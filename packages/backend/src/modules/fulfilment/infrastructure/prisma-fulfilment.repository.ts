import { randomUUID } from 'node:crypto';

import { createPrismaClient, type Prisma, type PrismaClient } from '@honey/db';

import { ConflictAppError } from '../../../errors/index.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import { asPrismaTransaction } from '../../../platform/infrastructure/prisma-platform.adapter.js';
import type {
  ClaimedShipmentQuantity,
  CreateDraftShipment,
  FulfilmentRepository,
  ShipmentForDispatch,
  ShipmentRecord,
} from '../domain/fulfilment.js';

type Client = PrismaClient | ReturnType<typeof asPrismaTransaction>;

function clientFor(client: PrismaClient, transaction: TransactionContext | undefined): Client {
  return transaction === undefined ? client : asPrismaTransaction(transaction);
}

type ShipmentRow = Readonly<{
  id: string;
  orderId: string;
  provider: string;
  status: ShipmentRecord['status'];
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  lines: readonly Readonly<{ orderLineId: string; quantity: number }>[];
}>;

function mapShipment(row: ShipmentRow): ShipmentRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    provider: row.provider,
    status: row.status,
    trackingNumber: row.trackingNumber,
    trackingUrl: row.trackingUrl,
    shippedAt: row.shippedAt,
    deliveredAt: row.deliveredAt,
    lines: row.lines.map((line) => ({
      orderLineId: line.orderLineId,
      quantity: line.quantity,
    })),
  };
}

const shipmentSelect = {
  id: true,
  orderId: true,
  provider: true,
  status: true,
  trackingNumber: true,
  trackingUrl: true,
  shippedAt: true,
  deliveredAt: true,
  lines: {
    orderBy: { id: 'asc' },
    select: { orderLineId: true, quantity: true },
  },
} satisfies Prisma.ShipmentSelect;

export class PrismaFulfilmentRepository implements FulfilmentRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  async findByIdempotency(
    orderId: string,
    key: string,
    transaction: TransactionContext,
  ): Promise<Readonly<{ shipment: ShipmentRecord; requestHash: string }> | null> {
    const row = await asPrismaTransaction(transaction).shipment.findUnique({
      where: { orderId_idempotencyKey: { orderId, idempotencyKey: key } },
      select: { ...shipmentSelect, requestHash: true },
    });
    if (row === null) return null;
    if (row.requestHash === null) throw new ConflictAppError({ code: 'IDEMPOTENCY_KEY_REUSE' });
    return { shipment: mapShipment(row), requestHash: row.requestHash };
  }

  async listClaimedQuantities(
    orderId: string,
    transaction: TransactionContext,
  ): Promise<readonly ClaimedShipmentQuantity[]> {
    const rows = await asPrismaTransaction(transaction).shipmentLineAllocation.findMany({
      where: { shipmentLine: { shipment: { orderId } } },
      select: {
        stockReservationId: true,
        quantity: true,
        shipmentLine: { select: { orderLineId: true } },
      },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => ({
      orderLineId: row.shipmentLine.orderLineId,
      stockReservationId: row.stockReservationId,
      quantity: row.quantity,
    }));
  }

  async createDraft(
    input: CreateDraftShipment,
    transaction: TransactionContext,
  ): Promise<ShipmentRecord> {
    const client = asPrismaTransaction(transaction);
    const row = await client.shipment.create({
      data: {
        id: input.id,
        orderId: input.orderId,
        provider: input.provider,
        status: 'PENDING',
        trackingNumber: input.trackingNumber,
        trackingUrl: input.trackingUrl,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
        lines: {
          create: input.lines.map((line) => ({
            id: line.id,
            orderLineId: line.orderLineId,
            quantity: line.quantity,
            createdBy: input.actorUserId,
            updatedBy: input.actorUserId,
            allocations: {
              create: line.allocations.map((allocation) => ({
                id: allocation.id,
                stockReservationId: allocation.stockReservationId,
                quantity: allocation.quantity,
              })),
            },
          })),
        },
      },
      select: shipmentSelect,
    });
    await client.auditLog.create({
      data: {
        id: randomUUID(),
        actorUserId: input.actorUserId,
        action: 'shipment.created',
        subjectType: 'shipment',
        subjectId: input.id,
        beforeJson: {},
        afterJson: { orderId: input.orderId, status: 'PENDING' },
      },
    });
    await client.outboxEvent.create({
      data: {
        id: randomUUID(),
        aggregateType: 'shipment',
        aggregateId: input.id,
        eventType: 'shipment.created',
        payload: { shipmentId: input.id, orderId: input.orderId, version: 1 },
      },
    });
    return mapShipment(row);
  }

  async findById(id: string): Promise<ShipmentRecord | null> {
    const row = await this.#client.shipment.findUnique({ where: { id }, select: shipmentSelect });
    return row === null ? null : mapShipment(row);
  }

  async findForDispatch(
    id: string,
    transaction: TransactionContext,
  ): Promise<ShipmentForDispatch | null> {
    const row = await asPrismaTransaction(transaction).shipment.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            allocations: {
              include: { stockReservation: { select: { variantId: true, stockLocationId: true } } },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (row === null) return null;
    return {
      ...mapShipment(row),
      allocations: row.lines.flatMap((line) =>
        line.allocations.map((allocation) => ({
          orderLineId: line.orderLineId,
          stockReservationId: allocation.stockReservationId,
          variantId: allocation.stockReservation.variantId,
          stockLocationId: allocation.stockReservation.stockLocationId,
          quantity: allocation.quantity,
        })),
      ),
    };
  }

  async listByOrder(
    orderId: string,
    transaction?: TransactionContext,
  ): Promise<readonly ShipmentRecord[]> {
    const rows = await clientFor(this.#client, transaction).shipment.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: shipmentSelect,
    });
    return rows.map(mapShipment);
  }

  async markShipped(
    shipmentId: string,
    actorUserId: string,
    transaction: TransactionContext,
  ): Promise<ShipmentRecord> {
    const client = asPrismaTransaction(transaction);
    const now = new Date();
    const changed = await client.shipment.updateMany({
      where: { id: shipmentId, status: 'PENDING', shippedAt: null },
      data: { status: 'IN_TRANSIT', shippedAt: now, updatedBy: actorUserId },
    });
    if (changed.count !== 1) throw new ConflictAppError({ code: 'ALREADY_FULFILLED' });
    const row = await client.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      select: shipmentSelect,
    });
    await client.trackingEvent.create({
      data: {
        id: randomUUID(),
        shipmentId,
        status: 'IN_TRANSIT',
        occurredAt: now,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    await client.auditLog.create({
      data: {
        id: randomUUID(),
        actorUserId,
        action: 'shipment.shipped',
        subjectType: 'shipment',
        subjectId: shipmentId,
        beforeJson: { status: 'PENDING' },
        afterJson: { status: 'IN_TRANSIT' },
      },
    });
    await client.outboxEvent.create({
      data: {
        id: randomUUID(),
        aggregateType: 'shipment',
        aggregateId: shipmentId,
        eventType: 'shipment.shipped',
        payload: { shipmentId, orderId: row.orderId, version: 1 },
      },
    });
    return mapShipment(row);
  }

  async markDelivered(
    shipmentId: string,
    actorUserId: string,
    transaction: TransactionContext,
  ): Promise<ShipmentRecord> {
    const client = asPrismaTransaction(transaction);
    const now = new Date();
    const changed = await client.shipment.updateMany({
      where: { id: shipmentId, status: 'IN_TRANSIT', deliveredAt: null },
      data: { status: 'DELIVERED', deliveredAt: now, updatedBy: actorUserId },
    });
    if (changed.count !== 1) throw new ConflictAppError({ code: 'SHIPMENT_NOT_DELIVERABLE' });
    const row = await client.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      select: shipmentSelect,
    });
    await client.trackingEvent.create({
      data: {
        id: randomUUID(),
        shipmentId,
        status: 'DELIVERED',
        occurredAt: now,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    await client.auditLog.create({
      data: {
        id: randomUUID(),
        actorUserId,
        action: 'shipment.delivered',
        subjectType: 'shipment',
        subjectId: shipmentId,
        beforeJson: { status: 'IN_TRANSIT' },
        afterJson: { status: 'DELIVERED' },
      },
    });
    await client.outboxEvent.create({
      data: {
        id: randomUUID(),
        aggregateType: 'shipment',
        aggregateId: shipmentId,
        eventType: 'shipment.delivered',
        payload: { shipmentId, orderId: row.orderId, version: 1 },
      },
    });
    return mapShipment(row);
  }

  close(): Promise<void> {
    return this.#client.$disconnect();
  }
}
