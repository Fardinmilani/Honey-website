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

  async publicBands(variantIds: readonly string[]): Promise<ReadonlyMap<string, AvailabilityBand>> {
    const snapshots = await this.availabilityForVariants(variantIds);
    return new Map(snapshots.map((snapshot) => [snapshot.variantId, snapshot.band]));
  }

  async availabilityForVariants(
    variantIds: readonly string[],
    transaction?: TransactionContext,
  ): Promise<readonly AvailabilitySnapshot[]> {
    const unique = [...new Set(variantIds)];
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
      this.repository.ledgerOnHandByKey(),
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
    const ledgerMap = new Map<string, number>();
    for (const row of ledger) {
      ledgerMap.set(remember(row.variantId, row.stockLocationId), row.onHand);
    }
    const incomingMap = new Map<string, number>();
    for (const row of incoming) {
      incomingMap.set(remember(row.variantId, row.stockLocationId), row.incoming);
    }
    const drifts: ReconciliationDrift[] = [];
    const repairMap = new Map<string, InventoryKey & { onHand?: number; incoming?: number }>();
    for (const [key, parts] of keyParts) {
      const item = itemMap.get(key);
      const expectedOnHand = ledgerMap.get(key) ?? 0;
      const actualOnHand = item?.onHand ?? 0;
      const expectedIncoming = incomingMap.get(key) ?? 0;
      const actualIncoming = item?.incoming ?? 0;
      const repair: InventoryKey & { onHand?: number; incoming?: number } = {
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
      if (repair.onHand !== undefined || repair.incoming !== undefined) {
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
