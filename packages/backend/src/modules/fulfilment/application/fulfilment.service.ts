import { createHash, randomUUID } from 'node:crypto';

import {
  ConflictAppError,
  ForbiddenAppError,
  NotFoundAppError,
  ValidationAppError,
} from '../../../errors/index.js';
import type { AuthenticatedPrincipal, RequestMetadata } from '../../identity/index.js';
import type { InventoryService } from '../../inventory/index.js';
import type { FulfilmentOrder, OrdersService } from '../../orders/index.js';
import type { TransactionRunner } from '../../../platform/domain/transaction.js';
import type { ShippingProvider } from '../../shipping/index.js';
import type {
  FulfilmentNotification,
  FulfilmentNotificationKind,
  FulfilmentNotificationPort,
  FulfilmentRepository,
  ShipmentRecord,
} from '../domain/fulfilment.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/u;
const SYSTEM_CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;

function validation(path: string, code: string): ValidationAppError {
  return new ValidationAppError([{ path, code }]);
}

function uuid(value: string, path: string): string {
  if (!UUID.test(value)) throw validation(path, 'FULFILMENT_ID_INVALID');
  return value;
}

function assertStaff(
  principal: AuthenticatedPrincipal,
  permission: 'order:read' | 'order:write' | 'order:cancel',
): void {
  if (principal.kind !== 'STAFF' || !principal.permissions.includes(permission)) {
    throw new ForbiddenAppError({ code: 'STAFF_REQUIRED' });
  }
}

function normalizedTrackingNumber(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.normalize('NFC').trim();
  if (
    normalized.length < 1 ||
    Array.from(normalized).length > 120 ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(normalized)
  ) {
    throw validation('trackingNumber', 'TRACKING_NUMBER_INVALID');
  }
  return normalized;
}

function normalizedTrackingUrl(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (value.length > 2048) throw validation('trackingUrl', 'TRACKING_URL_INVALID');
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
      throw new Error('unsafe');
    }
    return parsed.toString();
  } catch {
    throw validation('trackingUrl', 'TRACKING_URL_INVALID');
  }
}

type ShipmentLineRequest = Readonly<{ orderLineId: string; quantity: number }>;

export type CreateShipmentRequest = Readonly<{
  orderId: string;
  lines: readonly ShipmentLineRequest[];
  idempotencyKey: string;
  trackingNumber?: string;
  trackingUrl?: string;
}>;

type NormalizedCreate = Readonly<{
  orderId: string;
  lines: readonly ShipmentLineRequest[];
  key: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  requestHash: string;
}>;

function normalizeCreate(input: CreateShipmentRequest): NormalizedCreate {
  const orderId = uuid(input.orderId, 'orderId');
  if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
    throw validation('idempotencyKey', 'IDEMPOTENCY_KEY_INVALID');
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw validation('lines', 'SHIPMENT_LINES_REQUIRED');
  }
  const seen = new Set<string>();
  const lines = input.lines
    .map((line) => {
      const orderLineId = uuid(line.orderLineId, 'lines.orderLineId');
      if (seen.has(orderLineId)) throw validation('lines', 'SHIPMENT_LINE_DUPLICATE');
      seen.add(orderLineId);
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
        throw validation('lines.quantity', 'SHIPMENT_QUANTITY_INVALID');
      }
      return { orderLineId, quantity: line.quantity };
    })
    .sort((left, right) => left.orderLineId.localeCompare(right.orderLineId));
  const trackingNumber = normalizedTrackingNumber(input.trackingNumber);
  const trackingUrl = normalizedTrackingUrl(input.trackingUrl);
  const requestHash = createHash('sha256')
    .update(JSON.stringify({ orderId, lines, trackingNumber, trackingUrl }), 'utf8')
    .digest('hex');
  return {
    orderId,
    lines,
    key: input.idempotencyKey,
    trackingNumber,
    trackingUrl,
    requestHash,
  };
}

function assertFulfillable(order: FulfilmentOrder): void {
  if (
    order.paymentStatus !== 'PAID' ||
    (order.status !== 'PAID' &&
      order.status !== 'PROCESSING' &&
      order.status !== 'PARTIALLY_FULFILLED') ||
    order.fulfilmentStatus === 'FULFILLED'
  ) {
    throw new ConflictAppError({ code: 'ORDER_NOT_FULFILLABLE' });
  }
}

function notificationFor(order: FulfilmentOrder, shipment: ShipmentRecord): FulfilmentNotification {
  return {
    shipmentId: shipment.id,
    orderNumber: order.number,
    email: order.email,
    locale: order.localeAtPurchase,
    trackingNumber: shipment.trackingNumber,
    trackingUrl: shipment.trackingUrl,
  };
}

/**
 * Staff-only fulfilment workflow. The order row is the transaction's first
 * lock, so drafts, dispatches and cancellation serialize for one order.
 */
export class FulfilmentService {
  constructor(
    private readonly repository: FulfilmentRepository,
    private readonly orders: OrdersService,
    private readonly inventory: InventoryService,
    private readonly transactions: TransactionRunner,
    private readonly provider: ShippingProvider,
    private readonly notifications: FulfilmentNotificationPort,
  ) {}

  async getStaffOrder(
    principal: AuthenticatedPrincipal,
    orderIdInput: string,
  ): Promise<Readonly<{ order: FulfilmentOrder; shipments: readonly ShipmentRecord[] }>> {
    assertStaff(principal, 'order:read');
    const orderId = uuid(orderIdInput, 'orderId');
    return this.transactions.run(async (transaction) => {
      const order = await this.orders.lockForFulfilment(orderId, transaction);
      if (order === null) throw new NotFoundAppError();
      const shipments = await this.repository.listByOrder(orderId, transaction);
      return { order, shipments };
    });
  }

  async getOrderShipments(
    principal: AuthenticatedPrincipal,
    orderIdInput: string,
  ): Promise<readonly ShipmentRecord[]> {
    const result = await this.getStaffOrder(principal, orderIdInput);
    return result.shipments;
  }

  async createShipment(
    principal: AuthenticatedPrincipal,
    input: CreateShipmentRequest,
    metadata: RequestMetadata,
  ): Promise<ShipmentRecord> {
    assertStaff(principal, 'order:write');
    void metadata;
    const normalized = normalizeCreate(input);
    if (!this.provider.capabilities.createShipment) {
      throw new ConflictAppError({ code: 'SHIPPING_PROVIDER_UNAVAILABLE' });
    }
    return this.transactions.run(async (transaction) => {
      const order = await this.orders.lockForFulfilment(normalized.orderId, transaction);
      if (order === null) throw new NotFoundAppError();
      const replay = await this.repository.findByIdempotency(order.id, normalized.key, transaction);
      if (replay !== null) {
        if (replay.requestHash !== normalized.requestHash) {
          throw validation('idempotencyKey', 'IDEMPOTENCY_KEY_REUSE');
        }
        return replay.shipment;
      }
      assertFulfillable(order);
      const reservations = await this.inventory.listConsumedOrderReservations(
        order.id,
        transaction,
      );
      if (reservations.length === 0) throw new ConflictAppError({ code: 'ALLOCATION_MISMATCH' });
      const claimed = await this.repository.listClaimedQuantities(order.id, transaction);
      const claimedByLine = new Map<string, number>();
      const claimedByReservation = new Map<string, number>();
      for (const claim of claimed) {
        claimedByLine.set(
          claim.orderLineId,
          (claimedByLine.get(claim.orderLineId) ?? 0) + claim.quantity,
        );
        claimedByReservation.set(
          claim.stockReservationId,
          (claimedByReservation.get(claim.stockReservationId) ?? 0) + claim.quantity,
        );
      }
      const draftLines = normalized.lines.map((requested) => {
        const orderLine = order.lines.find((line) => line.id === requested.orderLineId);
        if (orderLine === undefined || orderLine.variantId === null) {
          throw new ConflictAppError({ code: 'ORDER_LINE_NOT_FULFILLABLE' });
        }
        if ((claimedByLine.get(orderLine.id) ?? 0) + requested.quantity > orderLine.quantity) {
          throw new ConflictAppError({ code: 'ALLOCATION_MISMATCH' });
        }
        let needed = requested.quantity;
        const allocations: { id: string; stockReservationId: string; quantity: number }[] = [];
        for (const reservation of reservations) {
          if (reservation.variantId !== orderLine.variantId || needed === 0) continue;
          const free = reservation.quantity - (claimedByReservation.get(reservation.id) ?? 0);
          if (free <= 0) continue;
          const quantity = Math.min(free, needed);
          allocations.push({ id: randomUUID(), stockReservationId: reservation.id, quantity });
          claimedByReservation.set(
            reservation.id,
            (claimedByReservation.get(reservation.id) ?? 0) + quantity,
          );
          needed -= quantity;
        }
        if (needed !== 0) throw new ConflictAppError({ code: 'ALLOCATION_MISMATCH' });
        claimedByLine.set(
          orderLine.id,
          (claimedByLine.get(orderLine.id) ?? 0) + requested.quantity,
        );
        return {
          id: randomUUID(),
          orderLineId: orderLine.id,
          quantity: requested.quantity,
          allocations,
        };
      });
      const shipmentId = randomUUID();
      const providerResult = await this.provider.createShipment({
        shipmentId,
        trackingNumber: normalized.trackingNumber,
        trackingUrl: normalized.trackingUrl,
      });
      if (
        providerResult.providerCode !== this.provider.code ||
        providerResult.providerShipmentRef !== shipmentId
      ) {
        throw new ConflictAppError({ code: 'SHIPPING_PROVIDER_UNAVAILABLE' });
      }
      return this.repository.createDraft(
        {
          id: shipmentId,
          orderId: order.id,
          provider: providerResult.providerCode,
          trackingNumber: providerResult.trackingNumber,
          trackingUrl: providerResult.trackingUrl,
          idempotencyKey: normalized.key,
          requestHash: normalized.requestHash,
          actorUserId: principal.userId,
          lines: draftLines,
        },
        transaction,
      );
    });
  }

  async markShipped(
    principal: AuthenticatedPrincipal,
    shipmentIdInput: string,
    metadata: RequestMetadata,
  ): Promise<ShipmentRecord> {
    assertStaff(principal, 'order:write');
    const shipmentId = uuid(shipmentIdInput, 'shipmentId');
    const initial = await this.repository.findById(shipmentId);
    if (initial === null) throw new NotFoundAppError();
    const result = await this.transactions.run(async (transaction) => {
      const order = await this.orders.lockForFulfilment(initial.orderId, transaction);
      if (order === null) throw new NotFoundAppError();
      const shipment = await this.repository.findForDispatch(shipmentId, transaction);
      if (shipment === null || shipment.orderId !== order.id) throw new NotFoundAppError();
      if (shipment.status === 'IN_TRANSIT' || shipment.status === 'DELIVERED') {
        return { order, shipment };
      }
      if (shipment.status !== 'PENDING') {
        throw new ConflictAppError({ code: 'SHIPMENT_NOT_DISPATCHABLE' });
      }
      assertFulfillable(order);
      const orderLineById = new Map(order.lines.map((line) => [line.id, line]));
      const totalsByLine = new Map<string, number>();
      for (const allocation of shipment.allocations) {
        const orderLine = orderLineById.get(allocation.orderLineId);
        if (
          orderLine === undefined ||
          orderLine.variantId !== allocation.variantId ||
          allocation.quantity < 1
        ) {
          throw new ConflictAppError({ code: 'ALLOCATION_MISMATCH' });
        }
        totalsByLine.set(
          allocation.orderLineId,
          (totalsByLine.get(allocation.orderLineId) ?? 0) + allocation.quantity,
        );
      }
      for (const line of shipment.lines) {
        if (totalsByLine.get(line.orderLineId) !== line.quantity) {
          throw new ConflictAppError({ code: 'ALLOCATION_MISMATCH' });
        }
      }
      const movementByKey = new Map<
        string,
        { variantId: string; stockLocationId: string; quantity: number }
      >();
      for (const allocation of shipment.allocations) {
        const key = `${allocation.variantId}:${allocation.stockLocationId}`;
        const previous = movementByKey.get(key);
        movementByKey.set(key, {
          variantId: allocation.variantId,
          stockLocationId: allocation.stockLocationId,
          quantity: (previous?.quantity ?? 0) + allocation.quantity,
        });
      }
      const updated = await this.repository.markShipped(shipmentId, principal.userId, transaction);
      await this.inventory.applyAllocatedStockMovements(
        transaction,
        [...movementByKey.values()].map((movement) => ({
          ...movement,
          reason: 'FULFILMENT' as const,
          refType: 'shipment' as const,
          refId: shipmentId,
        })),
        { actorUserId: principal.userId, metadata },
      );
      const physicalShipments = await this.repository.listByOrder(order.id, transaction);
      const physicallyFulfilled = new Map<string, number>();
      for (const row of physicalShipments) {
        if (row.status !== 'IN_TRANSIT' && row.status !== 'DELIVERED') continue;
        for (const line of row.lines) {
          physicallyFulfilled.set(
            line.orderLineId,
            (physicallyFulfilled.get(line.orderLineId) ?? 0) + line.quantity,
          );
        }
      }
      let complete = true;
      for (const line of order.lines) {
        const fulfilled = physicallyFulfilled.get(line.id) ?? 0;
        if (fulfilled > line.quantity) throw new ConflictAppError({ code: 'ALLOCATION_MISMATCH' });
        if (fulfilled !== line.quantity) complete = false;
      }
      await this.orders.updateFulfilmentState(
        order,
        complete ? 'FULFILLED' : 'PARTIAL',
        principal.userId,
        transaction,
      );
      return { order, shipment: updated };
    });
    return result.shipment;
  }

  async markDelivered(
    principal: AuthenticatedPrincipal,
    shipmentIdInput: string,
    metadata: RequestMetadata,
  ): Promise<ShipmentRecord> {
    assertStaff(principal, 'order:write');
    void metadata;
    const shipmentId = uuid(shipmentIdInput, 'shipmentId');
    const initial = await this.repository.findById(shipmentId);
    if (initial === null) throw new NotFoundAppError();
    const result = await this.transactions.run(async (transaction) => {
      const order = await this.orders.lockForFulfilment(initial.orderId, transaction);
      if (order === null) throw new NotFoundAppError();
      const shipments = await this.repository.listByOrder(order.id, transaction);
      const shipment = shipments.find((candidate) => candidate.id === shipmentId);
      if (shipment === undefined) throw new NotFoundAppError();
      if (shipment.status === 'DELIVERED') return { order, shipment };
      if (shipment.status !== 'IN_TRANSIT') {
        throw new ConflictAppError({ code: 'SHIPMENT_NOT_DELIVERABLE' });
      }
      const updated = await this.repository.markDelivered(
        shipmentId,
        principal.userId,
        transaction,
      );
      return { order, shipment: updated };
    });
    return result.shipment;
  }

  /** Called by the worker for a committed shipment event; the job carries no recipient PII. */
  async sendNotificationForSystem(
    context: Readonly<{ kind: 'SYSTEM'; source: 'WORKER'; correlationId: string }>,
    input: Readonly<{ shipmentId: string; kind: FulfilmentNotificationKind }>,
  ): Promise<void> {
    if (
      context.kind !== 'SYSTEM' ||
      context.source !== 'WORKER' ||
      !SYSTEM_CORRELATION_ID.test(context.correlationId)
    ) {
      throw new ForbiddenAppError({ code: 'SYSTEM_EXECUTION_REQUIRED' });
    }
    const shipment = await this.repository.findById(uuid(input.shipmentId, 'shipmentId'));
    if (shipment === null) throw new NotFoundAppError();
    if (
      (input.kind === 'SHIPPED' && shipment.shippedAt === null) ||
      (input.kind === 'DELIVERED' && shipment.deliveredAt === null)
    ) {
      throw new ConflictAppError({ code: 'SHIPMENT_NOTIFICATION_NOT_READY' });
    }
    if (input.kind !== 'SHIPPED' && input.kind !== 'DELIVERED') {
      throw validation('kind', 'SHIPMENT_NOTIFICATION_KIND_INVALID');
    }
    const order = await this.transactions.run((transaction) =>
      this.orders.lockForFulfilment(shipment.orderId, transaction),
    );
    if (order === null) throw new NotFoundAppError();
    const notification = notificationFor(order, shipment);
    if (input.kind === 'SHIPPED') {
      await this.notifications.sendShipped(notification);
    } else {
      await this.notifications.sendDelivered(notification);
    }
  }

  async cancelBeforeShipment(
    principal: AuthenticatedPrincipal,
    orderIdInput: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    assertStaff(principal, 'order:cancel');
    const orderId = uuid(orderIdInput, 'orderId');
    await this.transactions.run(async (transaction) => {
      const order = await this.orders.lockForFulfilment(orderId, transaction);
      if (order === null) throw new NotFoundAppError();
      if (
        order.paymentStatus !== 'PAID' ||
        (order.status !== 'PAID' && order.status !== 'PROCESSING') ||
        order.fulfilmentStatus !== 'UNFULFILLED'
      ) {
        throw new ConflictAppError({ code: 'ORDER_NOT_CANCELLABLE' });
      }
      const shipments = await this.repository.listByOrder(orderId, transaction);
      if (shipments.length !== 0) throw new ConflictAppError({ code: 'SHIPMENT_EXISTS' });
      const reservations = await this.inventory.listConsumedOrderReservations(orderId, transaction);
      const expectedByVariant = new Map<string, number>();
      for (const line of order.lines) {
        if (line.variantId === null) throw new ConflictAppError({ code: 'ALLOCATION_MISMATCH' });
        expectedByVariant.set(
          line.variantId,
          (expectedByVariant.get(line.variantId) ?? 0) + line.quantity,
        );
      }
      const actualByVariant = new Map<string, number>();
      for (const reservation of reservations) {
        actualByVariant.set(
          reservation.variantId,
          (actualByVariant.get(reservation.variantId) ?? 0) + reservation.quantity,
        );
      }
      if (
        expectedByVariant.size !== actualByVariant.size ||
        [...expectedByVariant].some(
          ([variantId, quantity]) => actualByVariant.get(variantId) !== quantity,
        )
      ) {
        throw new ConflictAppError({ code: 'ALLOCATION_MISMATCH' });
      }
      await this.inventory.applyAllocatedStockMovements(
        transaction,
        reservations.map((reservation) => ({
          variantId: reservation.variantId,
          stockLocationId: reservation.stockLocationId,
          quantity: reservation.quantity,
          reason: 'ALLOCATION_RELEASE' as const,
          refType: 'order' as const,
          refId: orderId,
        })),
        { actorUserId: principal.userId, metadata },
      );
      await this.orders.cancelBeforeShipment(order, principal.userId, transaction);
    });
  }
}
