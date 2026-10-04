import { randomUUID } from 'node:crypto';

import {
  ConflictAppError,
  ForbiddenAppError,
  NotFoundAppError,
  ValidationAppError,
} from '../../../errors/index.js';
import type {
  AuthenticatedPrincipal,
  PermissionCode,
  RequestMetadata,
} from '../../identity/index.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import {
  ADJUSTMENT_REASONS,
  STOCK_LOCATION_TYPES,
  availabilityBand,
  availableUnits,
  compareInventoryKeys,
  type InventoryActorContext,
  type AdjustmentInput,
  type AvailabilityBand,
  type AvailabilitySnapshot,
  type IncomingProjectionPort,
  type InventoryItemRecord,
  type InventoryKey,
  type InventoryRepository,
  type LocationInput,
  type PlanningInput,
  type ProductionIntakeInput,
  type ReservationAcquireInput,
  type ReservationAcquireResult,
  type ReservationAccountingChange,
  type ReservationAllocation,
  type ReservationAssertionInput,
  type ReservationAssertionResult,
  type ReservationConsumptionInput,
  type ReservationConsumptionResult,
  type ReservationExpiryInput,
  type ReservationExpiryResult,
  type ReservationExtensionInput,
  type ReservationExtensionResult,
  type ReservationLine,
  type ReservationReleaseInput,
  type ReservationReleaseResult,
  type StockReservationRecord,
  type ReconciliationDrift,
  type ReconciliationReport,
  type StockLedgerRecord,
  type StockLocationRecord,
  type StockMovement,
} from '../domain/inventory.js';

function validation(path: string, code: string): ValidationAppError {
  return new ValidationAppError([{ path, code }]);
}

function assertAdmin(principal: AuthenticatedPrincipal, permission: PermissionCode): void {
  if (principal.kind !== 'STAFF') throw new ForbiddenAppError({ code: 'STAFF_REQUIRED' });
  if (!principal.permissions.includes(permission)) throw new ForbiddenAppError();
}

function boundedString(value: string, maximum: number, path: string): string {
  const normalized = value.normalize('NFC').trim();
  if (
    normalized.length < 1 ||
    Array.from(normalized).length > maximum ||
    /[\u0000-\u001F\u007F-\u009F]/u.test(normalized)
  ) {
    throw validation(path, 'INVENTORY_TEXT_INVALID');
  }
  return normalized;
}

function boundedInt(value: number, path: string, minimum: number, maximum = 1_000_000_000): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw validation(path, 'INVENTORY_NUMBER_INVALID');
  }
  return value;
}

function uuid(value: string, path: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) {
    throw validation(path, 'INVENTORY_ID_INVALID');
  }
  return value;
}

function decodeCursor(value: string | undefined): { updatedAt: string; id: string } | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !('t' in parsed) ||
      !('id' in parsed) ||
      typeof parsed.t !== 'string' ||
      typeof parsed.id !== 'string'
    ) {
      throw new Error('invalid');
    }
    return { updatedAt: parsed.t, id: parsed.id };
  } catch {
    throw validation('cursor', 'CURSOR_INVALID');
  }
}

function encodeCursor(value: { updatedAt: string; id: string }): string {
  return Buffer.from(JSON.stringify({ v: 1, t: value.updatedAt, id: value.id }), 'utf8').toString(
    'base64url',
  );
}

const RESERVATION_TTL_MS = 15 * 60 * 1_000;
const RESERVATION_MAX_HOLD_MS = 30 * 60 * 1_000;
const DEFAULT_EXPIRY_BATCH_SIZE = 100;
const MAX_EXPIRY_BATCH_SIZE = 500;
const SYSTEM_RESERVATION_ACTOR: InventoryActorContext = {
  actorUserId: null,
  metadata: { requestId: 'inventory-reservation-expiry' },
};

function reservationKey(value: InventoryKey): string {
  return `${value.variantId}:${value.stockLocationId}`;
}

function reservationAllocation(row: StockReservationRecord) {
  return {
    reservationId: row.id,
    variantId: row.variantId,
    stockLocationId: row.stockLocationId,
    quantity: row.quantity,
    expiresAt: row.expiresAt,
  };
}

function aggregateReservationLines(lines: readonly ReservationLine[]): readonly ReservationLine[] {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const variantId = uuid(line.variantId, 'lines.variantId');
    const quantity = boundedInt(line.quantity, 'lines.quantity', 1);
    const total = (totals.get(variantId) ?? 0) + quantity;
    if (!Number.isSafeInteger(total) || total > 1_000_000_000) {
      throw validation('lines.quantity', 'INVENTORY_NUMBER_INVALID');
    }
    totals.set(variantId, total);
  }
  if (totals.size === 0) throw validation('lines', 'RESERVATION_LINES_EMPTY');
  return [...totals.entries()]
    .map(([variantId, quantity]) => ({ variantId, quantity }))
    .sort((left, right) => left.variantId.localeCompare(right.variantId));
}

function earliestExpiry(rows: readonly StockReservationRecord[]): Date | null {
  let earliest: Date | null = null;
  for (const row of rows) {
    if (earliest === null || row.expiresAt.getTime() < earliest.getTime()) earliest = row.expiresAt;
  }
  return earliest;
}

export class InventoryService {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly incoming: IncomingProjectionPort | undefined = undefined,
  ) {}

  async listLocations(principal: AuthenticatedPrincipal): Promise<readonly StockLocationRecord[]> {
    assertAdmin(principal, 'inventory:read');
    return this.repository.listLocations();
  }

  async getLocation(principal: AuthenticatedPrincipal, id: string): Promise<StockLocationRecord> {
    assertAdmin(principal, 'inventory:read');
    const location = await this.repository.getLocation(uuid(id, 'id'));
    if (location === null) throw new NotFoundAppError();
    return location;
  }

  async createLocation(
    principal: AuthenticatedPrincipal,
    input: LocationInput,
    metadata: RequestMetadata,
  ): Promise<StockLocationRecord> {
    assertAdmin(principal, 'inventory:adjust');
    return this.repository.createLocation(
      this.#normalizeLocation(input),
      this.#actor(principal, metadata),
    );
  }

  async updateLocation(
    principal: AuthenticatedPrincipal,
    id: string,
    input: Partial<LocationInput>,
    metadata: RequestMetadata,
  ): Promise<StockLocationRecord> {
    assertAdmin(principal, 'inventory:adjust');
    const normalized: Partial<LocationInput> = {
      ...(input.name === undefined ? {} : { name: boundedString(input.name, 160, 'name') }),
      ...(input.type === undefined ? {} : { type: this.#locationType(input.type) }),
      ...(input.isSellable === undefined ? {} : { isSellable: input.isSellable }),
      ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
    };
    const updated = await this.repository.updateLocation(
      uuid(id, 'id'),
      normalized,
      this.#actor(principal, metadata),
    );
    if (updated === null) throw new NotFoundAppError();
    return updated;
  }

  async listItems(
    principal: AuthenticatedPrincipal,
    input: {
      cursor?: string;
      limit?: number;
      variantId?: string;
      stockLocationId?: string;
    },
  ): Promise<
    Readonly<{
      data: readonly InventoryItemRecord[];
      page: { nextCursor: string | null; hasMore: boolean; limit: number };
    }>
  > {
    assertAdmin(principal, 'inventory:read');
    const limit = boundedInt(input.limit ?? 24, 'limit', 1, 100);
    const cursor = decodeCursor(input.cursor);
    const result = await this.repository.listItems({
      limit,
      ...(cursor === undefined ? {} : { cursor }),
      ...(input.variantId === undefined ? {} : { variantId: uuid(input.variantId, 'variantId') }),
      ...(input.stockLocationId === undefined
        ? {}
        : { stockLocationId: uuid(input.stockLocationId, 'stockLocationId') }),
    });
    return {
      data: result.items,
      page: {
        limit,
        hasMore: result.next !== null,
        nextCursor: result.next === null ? null : encodeCursor(result.next),
      },
    };
  }

  async getItem(
    principal: AuthenticatedPrincipal,
    variantId: string,
    stockLocationId: string,
  ): Promise<InventoryItemRecord> {
    assertAdmin(principal, 'inventory:read');
    const item = await this.repository.getItem(
      uuid(variantId, 'variantId'),
      uuid(stockLocationId, 'stockLocationId'),
    );
    if (item === null) throw new NotFoundAppError();
    return item;
  }

  async listLedger(
    principal: AuthenticatedPrincipal,
    variantId: string,
    input: { cursor?: string; limit?: number },
  ): Promise<
    Readonly<{
      data: readonly StockLedgerRecord[];
      page: { nextCursor: string | null; hasMore: boolean; limit: number };
    }>
  > {
    assertAdmin(principal, 'inventory:read');
    const limit = boundedInt(input.limit ?? 24, 'limit', 1, 100);
    const cursor = decodeCursor(input.cursor);
    const result = await this.repository.listLedger({
      variantId: uuid(variantId, 'variantId'),
      limit,
      ...(cursor === undefined ? {} : { cursor: { createdAt: cursor.updatedAt, id: cursor.id } }),
    });
    return {
      data: result.items,
      page: {
        limit,
        hasMore: result.next !== null,
        nextCursor:
          result.next === null
            ? null
            : encodeCursor({ updatedAt: result.next.createdAt, id: result.next.id }),
      },
    };
  }

  async setPlanning(
    principal: AuthenticatedPrincipal,
    variantId: string,
    stockLocationId: string,
    input: PlanningInput,
    metadata: RequestMetadata,
  ): Promise<InventoryItemRecord> {
    assertAdmin(principal, 'inventory:adjust');
    const updated = await this.repository.setPlanning(
      uuid(variantId, 'variantId'),
      uuid(stockLocationId, 'stockLocationId'),
      {
        ...(input.reorderPoint === undefined
          ? {}
          : { reorderPoint: boundedInt(input.reorderPoint, 'reorderPoint', 0) }),
        ...(input.safetyStock === undefined
          ? {}
          : { safetyStock: boundedInt(input.safetyStock, 'safetyStock', 0) }),
      },
      this.#actor(principal, metadata),
    );
    if (updated === null) throw new NotFoundAppError();
    return updated;
  }

  async adjust(
    principal: AuthenticatedPrincipal,
    input: AdjustmentInput,
    metadata: RequestMetadata,
  ): Promise<InventoryItemRecord> {
    assertAdmin(principal, 'inventory:adjust');
    if (!ADJUSTMENT_REASONS.includes(input.reason)) {
      throw validation('reason', 'INVENTORY_REASON_INVALID');
    }
    const delta = boundedInt(input.delta, 'delta', -1_000_000_000);
    if (delta === 0) throw validation('delta', 'INVENTORY_DELTA_NON_ZERO');
    const note = boundedString(input.note, 500, 'note');
    const variantId = uuid(input.variantId, 'variantId');
    const stockLocationId = uuid(input.stockLocationId, 'stockLocationId');
    const actor = this.#actor(principal, metadata);
    const refId = randomUUID();
    try {
      return await this.repository.runInTransaction(async (transaction) => {
        const [item] = await this.repository.ensureAndLockItems(
          transaction,
          [{ variantId, stockLocationId }],
          actor.actorUserId,
        );
        if (item === undefined) throw new ConflictAppError({ code: 'INVENTORY_ITEM_MISSING' });
        if (input.expectedVersion !== undefined && item.version !== input.expectedVersion) {
          throw new ConflictAppError({ code: 'INVENTORY_VERSION_CONFLICT' });
        }
        const nextOnHand = item.onHand + delta;
        const nextAvailable = nextOnHand - item.reserved - item.allocated;
        if (nextOnHand < 0 || nextAvailable < 0) {
          await this.repository.appendOutbox(
            transaction,
            'inventory_item',
            item.id,
            'inventory.oversell_prevented',
            { variantId, stockLocationId },
          );
          throw new ConflictAppError({ code: 'INSUFFICIENT_STOCK' });
        }
        const [updated] = await this.repository.applyMovements(
          transaction,
          [
            {
              variantId,
              stockLocationId,
              deltaOnHand: delta,
              deltaIncoming: 0,
              reason: input.reason,
              refType: 'inventory_adjustment',
              refId,
              note,
            },
          ],
          actor,
        );
        if (updated === undefined) throw new ConflictAppError({ code: 'INVENTORY_ITEM_MISSING' });
        await this.repository.appendAudit(
          transaction,
          actor,
          'inventory.adjusted',
          'inventory_item',
          updated.id,
          { onHand: item.onHand },
          { onHand: updated.onHand, reason: input.reason },
        );
        await this.repository.appendOutbox(
          transaction,
          'inventory_item',
          updated.id,
          'inventory.changed',
          { variantId, stockLocationId, delta },
        );
        await this.#evaluateLowStock(transaction, [variantId]);
        return updated;
      });
    } catch (error) {
      this.#rethrowConstraint(error);
    }
  }

  async receiveProduction(
    principal: AuthenticatedPrincipal,
    input: ProductionIntakeInput,
    metadata: RequestMetadata,
  ): Promise<InventoryItemRecord> {
    assertAdmin(principal, 'inventory:adjust');
    const quantity = boundedInt(input.quantity, 'quantity', 1);
    const actor = this.#actor(principal, metadata);
    const variantId = uuid(input.variantId, 'variantId');
    const stockLocationId = uuid(input.stockLocationId, 'stockLocationId');
    const allocationId = uuid(input.allocationId, 'allocationId');
    try {
      return await this.repository.runInTransaction(async (transaction) => {
        const [updated] = await this.applyStockChanges(
          transaction,
          [
            {
              variantId,
              stockLocationId,
              deltaOnHand: quantity,
              deltaIncoming: 0,
              reason: 'RECEIPT',
              refType: 'batch_allocation',
              refId: allocationId,
              note: input.note === undefined ? null : boundedString(input.note, 500, 'note'),
            },
          ],
          actor,
        );
        if (updated === undefined) throw new ConflictAppError({ code: 'INVENTORY_ITEM_MISSING' });
        await this.repository.appendAudit(
          transaction,
          actor,
          'inventory.production_received',
          'inventory_item',
          updated.id,
          { onHand: updated.onHand - quantity },
          { onHand: updated.onHand, harvestBatchId: input.harvestBatchId },
        );
        return updated;
      });
    } catch (error) {
      this.#rethrowConstraint(error);
    }
  }

  async applyStockChanges(
    transaction: TransactionContext,
    movements: readonly StockMovement[],
    actor: InventoryActorContext,
  ): Promise<readonly InventoryItemRecord[]> {
    const keys = movements.map((movement) => ({
      variantId: movement.variantId,
      stockLocationId: movement.stockLocationId,
    }));
    const locked = await this.repository.ensureAndLockItems(transaction, keys, actor.actorUserId);
    const byKey = new Map(
      locked.map((item) => [`${item.variantId}:${item.stockLocationId}`, item]),
    );
    for (const movement of movements) {
      const item = byKey.get(`${movement.variantId}:${movement.stockLocationId}`);
      if (item === undefined) throw new ConflictAppError({ code: 'INVENTORY_ITEM_MISSING' });
      const nextOnHand = item.onHand + movement.deltaOnHand;
      const nextIncoming = item.incoming + movement.deltaIncoming;
      const nextAvailable = nextOnHand - item.reserved - item.allocated;
      if (nextOnHand < 0 || nextIncoming < 0 || nextAvailable < 0) {
        await this.repository.appendOutbox(
          transaction,
          'inventory_item',
          item.id,
          'inventory.oversell_prevented',
          { variantId: movement.variantId, stockLocationId: movement.stockLocationId },
        );
        throw new ConflictAppError({ code: 'INSUFFICIENT_STOCK' });
      }
      byKey.set(`${movement.variantId}:${movement.stockLocationId}`, {
        ...item,
        onHand: nextOnHand,
        incoming: nextIncoming,
      });
    }
    const ledgerMovements = movements.filter(
      (movement) => movement.deltaOnHand !== 0 || movement.deltaIncoming !== 0,
    );
    const updated = await this.repository.applyMovements(transaction, ledgerMovements, actor);
    const variantIds = [...new Set(movements.map((movement) => movement.variantId))];
    await this.repository.appendOutbox(
      transaction,
      'inventory_item',
      updated[0]?.id ?? randomUUID(),
      'inventory.changed',
      { variantIds: variantIds.join(',') },
    );
    await this.#evaluateLowStock(transaction, variantIds);
    return updated;
  }

  /**
   * Acquires an all-or-nothing reservation. Callers that need a broader
   * checkout transaction pass that TransactionContext; standalone callers get
   * one short inventory transaction here.
   */
  async acquireReservations(
    input: ReservationAcquireInput,
    transaction?: TransactionContext,
  ): Promise<ReservationAcquireResult> {
    const checkoutSessionId = uuid(input.checkoutSessionId, 'checkoutSessionId');
    const cartId =
      input.cartId === undefined || input.cartId === null ? null : uuid(input.cartId, 'cartId');
    const lines = aggregateReservationLines(input.lines);
    const now = this.#reservationNow(input.now);
    return this.#inReservationTransaction(transaction, async (currentTransaction) => {
      const prepared = await this.#prepareCheckoutReservations(
        currentTransaction,
        checkoutSessionId,
        lines.map((line) => line.variantId),
      );
      const expired = await this.#expireLockedReservations(
        currentTransaction,
        prepared.reservations,
        prepared.items,
        input.actor,
        now,
      );
      if (expired.length > 0) {
        await this.#recordReservationReleaseEvents(
          currentTransaction,
          input.actor,
          expired,
          'inventory.reservation_expired',
        );
      }
      const active = prepared.reservations.filter(
        (reservation) =>
          reservation.status === 'ACTIVE' && reservation.expiresAt.getTime() > now.getTime(),
      );
      if (active.length > 0) {
        if (!this.#matchesRequestedLines(active, lines)) {
          throw new ConflictAppError({ code: 'RESERVATION_REQUEST_MISMATCH' });
        }
        const expiresAt = earliestExpiry(active);
        if (expiresAt === null) throw new ConflictAppError({ code: 'RESERVATION_NOT_ACTIVE' });
        return {
          allocations: active.map(reservationAllocation),
          expiresAt,
          replayed: true,
        };
      }
      const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);
      const allocations = this.#allocateReservationRows(lines, prepared.items, expiresAt);
      const created = await this.repository.createReservations(
        currentTransaction,
        allocations.map((allocation) => ({
          id: allocation.reservationId,
          variantId: allocation.variantId,
          stockLocationId: allocation.stockLocationId,
          quantity: allocation.quantity,
          cartId,
          checkoutSessionId,
          expiresAt,
          createdAt: now,
        })),
        input.actor,
      );
      await this.repository.applyReservationAccounting(
        currentTransaction,
        created.map((reservation) => ({
          variantId: reservation.variantId,
          stockLocationId: reservation.stockLocationId,
          deltaReserved: reservation.quantity,
          deltaAllocated: 0,
          ledgerDelta: reservation.quantity,
          reason: 'RESERVATION',
          refType: 'stock_reservation',
          refId: reservation.id,
          note: null,
        })),
        input.actor,
      );
      await this.#recordReservationCreatedEvents(currentTransaction, input.actor, created);
      await this.#evaluateLowStock(
        currentTransaction,
        lines.map((line) => line.variantId),
      );
      return { allocations, expiresAt, replayed: false };
    });
  }

  async releaseReservations(
    input: ReservationReleaseInput,
    transaction?: TransactionContext,
  ): Promise<ReservationReleaseResult> {
    const checkoutSessionId = uuid(input.checkoutSessionId, 'checkoutSessionId');
    const reason = boundedString(input.reason, 160, 'reason');
    const now = this.#reservationNow(input.now);
    return this.#inReservationTransaction(transaction, async (currentTransaction) => {
      const prepared = await this.#prepareCheckoutReservations(
        currentTransaction,
        checkoutSessionId,
        [],
      );
      const expired = await this.#expireLockedReservations(
        currentTransaction,
        prepared.reservations,
        prepared.items,
        input.actor,
        now,
      );
      const releasable = prepared.reservations.filter(
        (reservation) =>
          reservation.status === 'ACTIVE' && reservation.expiresAt.getTime() > now.getTime(),
      );
      const released = await this.#releaseLockedReservations(
        currentTransaction,
        releasable,
        input.actor,
        now,
        'RELEASED',
        reason,
      );
      if (expired.length > 0) {
        await this.#recordReservationReleaseEvents(
          currentTransaction,
          input.actor,
          expired,
          'inventory.reservation_expired',
        );
      }
      if (released.length > 0) {
        await this.#recordReservationReleaseEvents(
          currentTransaction,
          input.actor,
          released,
          'inventory.reservation_released',
        );
      }
      if (expired.length > 0 || released.length > 0) {
        await this.#evaluateLowStock(currentTransaction, [
          ...new Set([...expired, ...released].map((reservation) => reservation.variantId)),
        ]);
      }
      return {
        released: released.length,
        alreadyFinal: prepared.reservations.length - releasable.length,
      };
    });
  }

  /** Extends a payment-page hold exactly once, up to the 30-minute maximum. */
  async extendReservationsOnce(
    input: ReservationExtensionInput,
    transaction?: TransactionContext,
  ): Promise<ReservationExtensionResult> {
    const checkoutSessionId = uuid(input.checkoutSessionId, 'checkoutSessionId');
    const now = this.#reservationNow(input.now);
    return this.#inReservationTransaction(transaction, async (currentTransaction) => {
      const prepared = await this.#prepareCheckoutReservations(
        currentTransaction,
        checkoutSessionId,
        [],
      );
      const expired = await this.#expireLockedReservations(
        currentTransaction,
        prepared.reservations,
        prepared.items,
        input.actor,
        now,
      );
      if (expired.length > 0) {
        await this.#recordReservationReleaseEvents(
          currentTransaction,
          input.actor,
          expired,
          'inventory.reservation_expired',
        );
        await this.#evaluateLowStock(currentTransaction, [
          ...new Set(expired.map((reservation) => reservation.variantId)),
        ]);
      }
      const active = prepared.reservations.filter(
        (reservation) =>
          reservation.status === 'ACTIVE' && reservation.expiresAt.getTime() > now.getTime(),
      );
      if (active.length === 0) return { expiresAt: null, extended: false };
      const extensionRows = active
        .map((reservation) => ({
          id: reservation.id,
          expiresAt: new Date(reservation.createdAt.getTime() + RESERVATION_MAX_HOLD_MS),
        }))
        .filter((reservation) => {
          const current = active.find((candidate) => candidate.id === reservation.id);
          return (
            current !== undefined && current.expiresAt.getTime() < reservation.expiresAt.getTime()
          );
        });
      if (extensionRows.length === 0) {
        const expiresAt = earliestExpiry(active);
        return { expiresAt, extended: false };
      }
      await this.repository.extendReservations(currentTransaction, extensionRows, input.actor);
      const expiresAt = earliestExpiry(
        active.map((reservation) => {
          const extension = extensionRows.find((candidate) => candidate.id === reservation.id);
          return extension === undefined
            ? reservation
            : { ...reservation, expiresAt: extension.expiresAt };
        }),
      );
      return { expiresAt, extended: true };
    });
  }

  /**
   * Locks and verifies exact, unexpired reservations before checkout confirms.
   * It deliberately accepts a caller transaction so the later order and
   * allocation transition cannot observe a different state.
   */
  async assertActiveReservations(
    input: ReservationAssertionInput,
    transaction?: TransactionContext,
  ): Promise<ReservationAssertionResult> {
    const checkoutSessionId = uuid(input.checkoutSessionId, 'checkoutSessionId');
    const lines = aggregateReservationLines(input.lines);
    const now = this.#reservationNow(input.now);
    return this.#inReservationTransaction(transaction, async (currentTransaction) => {
      const prepared = await this.#prepareCheckoutReservations(
        currentTransaction,
        checkoutSessionId,
        lines.map((line) => line.variantId),
      );
      const expired = await this.#expireLockedReservations(
        currentTransaction,
        prepared.reservations,
        prepared.items,
        input.actor,
        now,
      );
      if (expired.length > 0) {
        await this.#recordReservationReleaseEvents(
          currentTransaction,
          input.actor,
          expired,
          'inventory.reservation_expired',
        );
        await this.#evaluateLowStock(currentTransaction, [
          ...new Set(expired.map((reservation) => reservation.variantId)),
        ]);
      }
      const active = prepared.reservations.filter(
        (reservation) =>
          reservation.status === 'ACTIVE' && reservation.expiresAt.getTime() > now.getTime(),
      );
      if (!this.#matchesRequestedLines(active, lines)) {
        throw new ConflictAppError({
          code: expired.length > 0 ? 'RESERVATION_EXPIRED' : 'RESERVATION_NOT_ACTIVE',
        });
      }
      const expiresAt = earliestExpiry(active);
      if (expiresAt === null) throw new ConflictAppError({ code: 'RESERVATION_NOT_ACTIVE' });
      return { allocations: active.map(reservationAllocation), expiresAt };
    });
  }

  /** Moves all active rows for a checkout from reserved to allocated. */
  async consumeReservations(
    input: ReservationConsumptionInput,
    transaction?: TransactionContext,
  ): Promise<ReservationConsumptionResult> {
    const checkoutSessionId = uuid(input.checkoutSessionId, 'checkoutSessionId');
    const orderId = uuid(input.orderId, 'orderId');
    const now = this.#reservationNow(input.now);
    return this.#inReservationTransaction(transaction, async (currentTransaction) => {
      const prepared = await this.#prepareCheckoutReservations(
        currentTransaction,
        checkoutSessionId,
        [],
      );
      const expired = await this.#expireLockedReservations(
        currentTransaction,
        prepared.reservations,
        prepared.items,
        input.actor,
        now,
      );
      if (expired.length > 0) {
        await this.#recordReservationReleaseEvents(
          currentTransaction,
          input.actor,
          expired,
          'inventory.reservation_expired',
        );
      }
      const active = prepared.reservations.filter(
        (reservation) =>
          reservation.status === 'ACTIVE' && reservation.expiresAt.getTime() > now.getTime(),
      );
      if (active.length === 0) {
        const consumed = prepared.reservations.filter(
          (reservation) => reservation.status === 'CONSUMED' && reservation.orderId === orderId,
        );
        if (consumed.length > 0)
          return { allocations: consumed.map(reservationAllocation), replayed: true };
        throw new ConflictAppError({
          code: expired.length > 0 ? 'RESERVATION_EXPIRED' : 'RESERVATION_NOT_ACTIVE',
        });
      }
      await this.repository.markReservationsConsumed(
        currentTransaction,
        active.map((reservation) => ({ id: reservation.id, orderId, consumedAt: now })),
        input.actor,
      );
      await this.repository.applyReservationAccounting(
        currentTransaction,
        active.map((reservation) => ({
          variantId: reservation.variantId,
          stockLocationId: reservation.stockLocationId,
          deltaReserved: -reservation.quantity,
          deltaAllocated: reservation.quantity,
          ledgerDelta: reservation.quantity,
          reason: 'ALLOCATION',
          refType: 'order',
          refId: orderId,
          note: null,
        })),
        input.actor,
      );
      await this.#recordReservationConsumedEvents(currentTransaction, input.actor, active, orderId);
      await this.#evaluateLowStock(currentTransaction, [
        ...new Set(active.map((reservation) => reservation.variantId)),
      ]);
      return { allocations: active.map(reservationAllocation), replayed: false };
    });
  }

  /** A bounded, transport-independent expiry sweep. Phase 16 schedules it. */
  async expireReservations(input: ReservationExpiryInput): Promise<ReservationExpiryResult> {
    const batchSize = boundedInt(
      input.batchSize ?? DEFAULT_EXPIRY_BATCH_SIZE,
      'batchSize',
      1,
      MAX_EXPIRY_BATCH_SIZE,
    );
    const now = this.#reservationNow(input.now);
    const ids = await this.repository.listExpiredReservationIds(now, batchSize);
    const expired = await this.repository.runInTransaction((transaction) =>
      this.#expireReservationIds(transaction, ids, input.actor, now),
    );
    return { expired: expired.length };
  }

  /** Lazy expiry for availability/checkout reads; no scheduler is created here. */
  async expireReservationsForVariants(
    variantIds: readonly string[],
    actor: InventoryActorContext = SYSTEM_RESERVATION_ACTOR,
    now?: Date,
  ): Promise<number> {
    const uniqueVariantIds = [...new Set(variantIds)].map((variantId) =>
      uuid(variantId, 'variantIds'),
    );
    if (uniqueVariantIds.length === 0) return 0;
    const effectiveNow = this.#reservationNow(now);
    const ids = await this.repository.listExpiredReservationIds(
      effectiveNow,
      MAX_EXPIRY_BATCH_SIZE,
      uniqueVariantIds,
    );
    const expired = await this.repository.runInTransaction((transaction) =>
      this.#expireReservationIds(transaction, ids, actor, effectiveNow),
    );
    return expired.length;
  }

  async publicBands(variantIds: readonly string[]): Promise<ReadonlyMap<string, AvailabilityBand>> {
    const snapshots = await this.availabilityForVariants(variantIds);
    return new Map(snapshots.map((snapshot) => [snapshot.variantId, snapshot.band]));
  }

  async availabilityForVariants(
    variantIds: readonly string[],
    transaction?: TransactionContext,
  ): Promise<readonly AvailabilitySnapshot[]> {
    const unique = [...new Set(variantIds)];
    if (transaction === undefined && unique.length > 0) {
      await this.expireReservationsForVariants(unique);
    }
    const items = await this.repository.getItemsForVariants(unique, transaction);
    const grouped = new Map<string, InventoryItemRecord[]>();
    for (const item of items) {
      const list = grouped.get(item.variantId) ?? [];
      list.push(item);
      grouped.set(item.variantId, list);
    }
    return unique.map((variantId) => {
      const rows = grouped.get(variantId) ?? [];
      const sellable = rows.filter((row) => row.isSellable);
      const availableToSell = sellable.reduce(
        (sum, row) => sum + Math.max(0, availableUnits(row)),
        0,
      );
      const reorderThreshold = sellable.reduce((max, row) => Math.max(max, row.reorderPoint), 0);
      return {
        variantId,
        availableToSell,
        reorderThreshold,
        band: availabilityBand(availableToSell, reorderThreshold),
      };
    });
  }

  async reconcile(
    principal: AuthenticatedPrincipal,
    metadata: RequestMetadata,
    repair = false,
  ): Promise<ReconciliationReport> {
    assertAdmin(principal, 'inventory:adjust');
    const actor = this.#actor(principal, metadata);
    const [ledger, items, incoming] = await Promise.all([
      this.repository.ledgerStateByKey(),
      this.repository.listAllItems(),
      this.incoming?.incomingByKey() ?? Promise.resolve([]),
    ]);
    const itemMap = new Map<string, InventoryItemRecord>();
    const keyParts = new Map<string, InventoryKey>();
    const remember = (variantId: string, stockLocationId: string): string => {
      const key = `${variantId}:${stockLocationId}`;
      keyParts.set(key, { variantId, stockLocationId });
      return key;
    };
    for (const item of items) {
      itemMap.set(remember(item.variantId, item.stockLocationId), item);
    }
    const ledgerMap = new Map<
      string,
      Readonly<{ onHand: number; reserved: number; allocated: number }>
    >();
    for (const row of ledger) {
      ledgerMap.set(remember(row.variantId, row.stockLocationId), row);
    }
    const incomingMap = new Map<string, number>();
    for (const row of incoming) {
      incomingMap.set(remember(row.variantId, row.stockLocationId), row.incoming);
    }
    const drifts: ReconciliationDrift[] = [];
    const repairMap = new Map<
      string,
      InventoryKey & { onHand?: number; incoming?: number; reserved?: number; allocated?: number }
    >();
    for (const [key, parts] of keyParts) {
      const item = itemMap.get(key);
      const ledgerState = ledgerMap.get(key);
      const expectedOnHand = ledgerState?.onHand ?? 0;
      const expectedReserved = ledgerState?.reserved ?? 0;
      const expectedAllocated = ledgerState?.allocated ?? 0;
      const actualOnHand = item?.onHand ?? 0;
      const actualReserved = item?.reserved ?? 0;
      const actualAllocated = item?.allocated ?? 0;
      const expectedIncoming = incomingMap.get(key) ?? 0;
      const actualIncoming = item?.incoming ?? 0;
      const repair: InventoryKey & {
        onHand?: number;
        incoming?: number;
        reserved?: number;
        allocated?: number;
      } = {
        variantId: parts.variantId,
        stockLocationId: parts.stockLocationId,
      };
      if (actualOnHand !== expectedOnHand) {
        drifts.push({
          variantId: parts.variantId,
          stockLocationId: parts.stockLocationId,
          field: 'onHand',
          expected: expectedOnHand,
          actual: actualOnHand,
        });
        repair.onHand = expectedOnHand;
      }
      if (actualReserved !== expectedReserved) {
        drifts.push({
          variantId: parts.variantId,
          stockLocationId: parts.stockLocationId,
          field: 'reserved',
          expected: expectedReserved,
          actual: actualReserved,
        });
        repair.reserved = expectedReserved;
      }
      if (actualAllocated !== expectedAllocated) {
        drifts.push({
          variantId: parts.variantId,
          stockLocationId: parts.stockLocationId,
          field: 'allocated',
          expected: expectedAllocated,
          actual: actualAllocated,
        });
        repair.allocated = expectedAllocated;
      }
      if (actualIncoming !== expectedIncoming) {
        drifts.push({
          variantId: parts.variantId,
          stockLocationId: parts.stockLocationId,
          field: 'incoming',
          expected: expectedIncoming,
          actual: actualIncoming,
        });
        repair.incoming = expectedIncoming;
      }
      if (
        repair.onHand !== undefined ||
        repair.incoming !== undefined ||
        repair.reserved !== undefined ||
        repair.allocated !== undefined
      ) {
        repairMap.set(key, repair);
      }
    }
    const repairs = [...repairMap.values()];
    if (!repair || drifts.length === 0) {
      return { drifted: drifts.length > 0, drifts, repaired: false };
    }
    await this.repository.runInTransaction(async (transaction) => {
      await this.repository.ensureAndLockItems(
        transaction,
        repairs.map((repairRow) => ({
          variantId: repairRow.variantId,
          stockLocationId: repairRow.stockLocationId,
        })),
        actor.actorUserId,
      );
      await this.repository.repairCurrentState(transaction, repairs, actor);
      await this.repository.appendAudit(
        transaction,
        actor,
        'inventory.reconciled',
        'inventory_item',
        repairs[0]?.variantId ?? randomUUID(),
        { drifted: drifts.length },
        { repaired: repairs.length },
      );
      await this.repository.appendOutbox(
        transaction,
        'inventory_item',
        repairs[0]?.variantId ?? randomUUID(),
        'inventory.reconciled',
        { drifted: drifts.length, repaired: repairs.length },
      );
    });
    return { drifted: true, drifts, repaired: true };
  }

  async #inReservationTransaction<Result>(
    transaction: TransactionContext | undefined,
    work: (currentTransaction: TransactionContext) => Promise<Result>,
  ): Promise<Result> {
    if (transaction !== undefined) return work(transaction);
    return this.repository.runInTransaction(work);
  }

  #reservationNow(input: Date | undefined): Date {
    const now = input === undefined ? new Date() : new Date(input.getTime());
    if (Number.isNaN(now.getTime())) throw validation('now', 'RESERVATION_TIME_INVALID');
    return now;
  }

  async #prepareCheckoutReservations(
    transaction: TransactionContext,
    checkoutSessionId: string,
    requestedVariantIds: readonly string[],
  ): Promise<
    Readonly<{
      items: readonly InventoryItemRecord[];
      reservations: readonly StockReservationRecord[];
    }>
  > {
    await this.repository.lockReservationCheckout(transaction, checkoutSessionId);
    const beforeLock = await this.repository.listReservationsForCheckout(
      transaction,
      checkoutSessionId,
    );
    const variantIds = [
      ...new Set([
        ...requestedVariantIds,
        ...beforeLock.map((reservation) => reservation.variantId),
      ]),
    ].sort((left, right) => left.localeCompare(right));
    const candidateItems = await this.repository.getItemsForVariants(variantIds, transaction);
    const itemKeys = candidateItems.map((item) => ({
      variantId: item.variantId,
      stockLocationId: item.stockLocationId,
    }));
    const items = await this.repository.lockItems(transaction, itemKeys);
    const reservations = await this.repository.lockReservationsForCheckout(
      transaction,
      checkoutSessionId,
    );
    const itemKeysAfterLock = new Set(items.map(reservationKey));
    for (const reservation of reservations) {
      if (!itemKeysAfterLock.has(reservationKey(reservation))) {
        throw new ConflictAppError({ code: 'INVENTORY_RESERVATION_DRIFT' });
      }
    }
    return { items, reservations };
  }

  #allocateReservationRows(
    lines: readonly ReservationLine[],
    items: readonly InventoryItemRecord[],
    expiresAt: Date,
  ): readonly ReservationAllocation[] {
    const grouped = new Map<string, InventoryItemRecord[]>();
    for (const item of items) {
      if (!item.isSellable) continue;
      const rows = grouped.get(item.variantId) ?? [];
      rows.push(item);
      grouped.set(item.variantId, rows);
    }
    const result: ReservationAllocation[] = [];
    for (const line of lines) {
      const candidates = [...(grouped.get(line.variantId) ?? [])].sort((left, right) => {
        if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
        return left.stockLocationId.localeCompare(right.stockLocationId);
      });
      let remaining = line.quantity;
      for (const candidate of candidates) {
        const available = Math.max(0, availableUnits(candidate));
        const quantity = Math.min(remaining, available);
        if (quantity === 0) continue;
        result.push({
          reservationId: randomUUID(),
          variantId: line.variantId,
          stockLocationId: candidate.stockLocationId,
          quantity,
          expiresAt,
        });
        remaining -= quantity;
        if (remaining === 0) break;
      }
      if (remaining !== 0) throw new ConflictAppError({ code: 'INSUFFICIENT_STOCK' });
    }
    return result;
  }

  #matchesRequestedLines(
    reservations: readonly StockReservationRecord[],
    lines: readonly ReservationLine[],
  ): boolean {
    if (reservations.length === 0) return false;
    const reserved = new Map<string, number>();
    for (const reservation of reservations) {
      reserved.set(
        reservation.variantId,
        (reserved.get(reservation.variantId) ?? 0) + reservation.quantity,
      );
    }
    if (reserved.size !== lines.length) return false;
    return lines.every((line) => reserved.get(line.variantId) === line.quantity);
  }

  async #releaseLockedReservations(
    transaction: TransactionContext,
    reservations: readonly StockReservationRecord[],
    actor: InventoryActorContext,
    now: Date,
    status: 'RELEASED' | 'EXPIRED',
    reason: string,
  ): Promise<readonly StockReservationRecord[]> {
    if (reservations.length === 0) return [];
    const active = reservations.filter((reservation) => reservation.status === 'ACTIVE');
    if (active.length === 0) return [];
    await this.repository.markReservationsReleased(
      transaction,
      active.map((reservation) => ({
        id: reservation.id,
        status,
        releasedAt: now,
        releaseReason: reason,
      })),
      actor,
    );
    const changes: readonly ReservationAccountingChange[] = active.map((reservation) => ({
      variantId: reservation.variantId,
      stockLocationId: reservation.stockLocationId,
      deltaReserved: -reservation.quantity,
      deltaAllocated: 0,
      ledgerDelta: -reservation.quantity,
      reason: 'RESERVATION_RELEASE',
      refType: 'stock_reservation',
      refId: reservation.id,
      note: reason,
    }));
    await this.repository.applyReservationAccounting(transaction, changes, actor);
    return active;
  }

  async #expireLockedReservations(
    transaction: TransactionContext,
    reservations: readonly StockReservationRecord[],
    _items: readonly InventoryItemRecord[],
    actor: InventoryActorContext,
    now: Date,
  ): Promise<readonly StockReservationRecord[]> {
    const expired = reservations.filter(
      (reservation) =>
        reservation.status === 'ACTIVE' && reservation.expiresAt.getTime() <= now.getTime(),
    );
    return this.#releaseLockedReservations(transaction, expired, actor, now, 'EXPIRED', 'EXPIRED');
  }

  async #expireReservationIds(
    transaction: TransactionContext,
    reservationIds: readonly string[],
    actor: InventoryActorContext,
    now: Date,
  ): Promise<readonly StockReservationRecord[]> {
    if (reservationIds.length === 0) return [];
    const beforeLock = await this.repository.listReservationsByIds(transaction, reservationIds);
    const variantIds = [...new Set(beforeLock.map((reservation) => reservation.variantId))].sort(
      (left, right) => left.localeCompare(right),
    );
    const candidateItems = await this.repository.getItemsForVariants(variantIds, transaction);
    const items = await this.repository.lockItems(
      transaction,
      candidateItems.map((item) => ({
        variantId: item.variantId,
        stockLocationId: item.stockLocationId,
      })),
    );
    const itemKeys = new Set(items.map(reservationKey));
    const locked = await this.repository.lockReservationsByIds(transaction, reservationIds);
    const expired = locked.filter(
      (reservation) =>
        reservation.status === 'ACTIVE' &&
        reservation.expiresAt.getTime() <= now.getTime() &&
        itemKeys.has(reservationKey(reservation)),
    );
    if (
      expired.length !==
      locked.filter(
        (reservation) =>
          reservation.status === 'ACTIVE' && reservation.expiresAt.getTime() <= now.getTime(),
      ).length
    ) {
      throw new ConflictAppError({ code: 'INVENTORY_RESERVATION_DRIFT' });
    }
    const released = await this.#releaseLockedReservations(
      transaction,
      expired,
      actor,
      now,
      'EXPIRED',
      'EXPIRED',
    );
    if (released.length > 0) {
      await this.#recordReservationReleaseEvents(
        transaction,
        actor,
        released,
        'inventory.reservation_expired',
      );
      await this.#evaluateLowStock(transaction, [
        ...new Set(released.map((reservation) => reservation.variantId)),
      ]);
    }
    return released;
  }

  async #recordReservationCreatedEvents(
    transaction: TransactionContext,
    actor: InventoryActorContext,
    reservations: readonly StockReservationRecord[],
  ): Promise<void> {
    for (const reservation of reservations) {
      await this.repository.appendAudit(
        transaction,
        actor,
        'inventory.reserved',
        'stock_reservation',
        reservation.id,
        undefined,
        { quantity: reservation.quantity, status: reservation.status },
      );
      await this.repository.appendOutbox(
        transaction,
        'stock_reservation',
        reservation.id,
        'inventory.reserved',
        {
          variantId: reservation.variantId,
          stockLocationId: reservation.stockLocationId,
          quantity: reservation.quantity,
        },
      );
    }
  }

  async #recordReservationReleaseEvents(
    transaction: TransactionContext,
    actor: InventoryActorContext,
    reservations: readonly StockReservationRecord[],
    eventType: 'inventory.reservation_expired' | 'inventory.reservation_released',
  ): Promise<void> {
    for (const reservation of reservations) {
      await this.repository.appendAudit(
        transaction,
        actor,
        eventType,
        'stock_reservation',
        reservation.id,
        { quantity: reservation.quantity, status: 'ACTIVE' },
        { status: eventType === 'inventory.reservation_expired' ? 'EXPIRED' : 'RELEASED' },
      );
      await this.repository.appendOutbox(
        transaction,
        'stock_reservation',
        reservation.id,
        eventType,
        {
          variantId: reservation.variantId,
          stockLocationId: reservation.stockLocationId,
          quantity: reservation.quantity,
        },
      );
    }
  }

  async #recordReservationConsumedEvents(
    transaction: TransactionContext,
    actor: InventoryActorContext,
    reservations: readonly StockReservationRecord[],
    orderId: string,
  ): Promise<void> {
    for (const reservation of reservations) {
      await this.repository.appendAudit(
        transaction,
        actor,
        'inventory.allocated',
        'stock_reservation',
        reservation.id,
        { quantity: reservation.quantity, status: 'ACTIVE' },
        { orderId, status: 'CONSUMED' },
      );
      await this.repository.appendOutbox(transaction, 'order', orderId, 'inventory.allocated', {
        variantId: reservation.variantId,
        stockLocationId: reservation.stockLocationId,
        quantity: reservation.quantity,
      });
    }
  }

  #normalizeLocation(input: LocationInput): LocationInput {
    if (!STOCK_LOCATION_TYPES.includes(input.type)) {
      throw validation('type', 'STOCK_LOCATION_TYPE_INVALID');
    }
    return {
      code: boundedString(input.code, 40, 'code').toUpperCase(),
      name: boundedString(input.name, 160, 'name'),
      type: input.type,
      isSellable: input.isSellable,
      isDefault: input.isDefault,
    };
  }

  #locationType(value: LocationInput['type']): LocationInput['type'] {
    if (!STOCK_LOCATION_TYPES.includes(value)) {
      throw validation('type', 'STOCK_LOCATION_TYPE_INVALID');
    }
    return value;
  }

  #actor(principal: AuthenticatedPrincipal, metadata: RequestMetadata): InventoryActorContext {
    return { actorUserId: principal.userId, metadata };
  }

  async #evaluateLowStock(
    transaction: TransactionContext,
    variantIds: readonly string[],
  ): Promise<void> {
    const snapshots = await this.availabilityForVariants(variantIds, transaction);
    const items = await this.repository.getItemsForVariants(variantIds, transaction);
    const grouped = new Map<string, InventoryItemRecord[]>();
    for (const item of items) {
      const list = grouped.get(item.variantId) ?? [];
      list.push(item);
      grouped.set(item.variantId, list);
    }
    for (const snapshot of snapshots) {
      const rows = (grouped.get(snapshot.variantId) ?? []).filter((row) => row.isSellable);
      if (rows.length === 0) continue;
      const alerted = rows.some((row) => row.lowStockAlertActive);
      const shouldAlert = snapshot.band === 'LOW_STOCK' || snapshot.band === 'OUT_OF_STOCK';
      const keys = rows.map((row) => ({
        variantId: row.variantId,
        stockLocationId: row.stockLocationId,
      }));
      if (shouldAlert && !alerted) {
        await this.repository.setLowStockAlert(transaction, keys, true);
        await this.repository.appendOutbox(
          transaction,
          'product_variant',
          snapshot.variantId,
          'stock.low',
          {
            variantId: snapshot.variantId,
            band: snapshot.band,
            availableToSell: snapshot.availableToSell,
          },
        );
      } else if (!shouldAlert && alerted) {
        await this.repository.setLowStockAlert(transaction, keys, false);
      }
    }
  }

  #rethrowConstraint(error: unknown): never {
    if (
      error instanceof ValidationAppError ||
      error instanceof ConflictAppError ||
      error instanceof NotFoundAppError ||
      error instanceof ForbiddenAppError
    ) {
      throw error;
    }
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = error.code;
      if (code === 'P2003') throw new NotFoundAppError({ code: 'VARIANT_OR_LOCATION_NOT_FOUND' });
      if (code === 'P2002') throw new ConflictAppError({ code: 'INVENTORY_CONFLICT' });
    }
    throw error;
  }
}

export { compareInventoryKeys };
