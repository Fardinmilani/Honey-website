import { randomUUID } from 'node:crypto';

import { createPrismaClient, Prisma, type PrismaClient, type TransactionClient } from '@honey/db';

import { ConflictAppError } from '../../../errors/index.js';
import {
  asPrismaTransaction,
  PrismaTransactionContext,
} from '../../../platform/infrastructure/prisma-platform.adapter.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import {
  compareInventoryKeys,
  reduceInventoryLedgerState,
  type InventoryActorContext,
  type InventoryLedgerState,
  type InventoryItemRecord,
  type InventoryKey,
  type InventoryRepository,
  type LocationInput,
  type PlanningInput,
  type ReservationAccountingChange,
  type StockLedgerRecord,
  type StockLocationRecord,
  type StockReservationRecord,
  type StockMovement,
} from '../domain/inventory.js';

function mapLocation(row: {
  id: string;
  code: string;
  name: string;
  type: StockLocationRecord['type'];
  isSellable: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}): StockLocationRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    isSellable: row.isSellable,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapItem(
  row: {
    id: string;
    variantId: string;
    stockLocationId: string;
    onHand: number;
    reserved: number;
    allocated: number;
    incoming: number;
    reorderPoint: number;
    safetyStock: number;
    lowStockAlertActive: boolean;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  },
  location: Readonly<{ isSellable: boolean; isDefault: boolean }>,
): InventoryItemRecord {
  return {
    id: row.id,
    variantId: row.variantId,
    stockLocationId: row.stockLocationId,
    onHand: row.onHand,
    reserved: row.reserved,
    allocated: row.allocated,
    incoming: row.incoming,
    reorderPoint: row.reorderPoint,
    safetyStock: row.safetyStock,
    lowStockAlertActive: row.lowStockAlertActive,
    version: row.version,
    isSellable: location.isSellable,
    isDefault: location.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapReservation(row: {
  id: string;
  variantId: string;
  stockLocationId: string;
  quantity: number;
  cartId: string | null;
  checkoutSessionId: string | null;
  orderId: string | null;
  status: StockReservationRecord['status'];
  expiresAt: Date;
  createdAt: Date;
  consumedAt: Date | null;
  releasedAt: Date | null;
  releaseReason: string | null;
}): StockReservationRecord {
  return {
    id: row.id,
    variantId: row.variantId,
    stockLocationId: row.stockLocationId,
    quantity: row.quantity,
    cartId: row.cartId,
    checkoutSessionId: row.checkoutSessionId,
    orderId: row.orderId,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    consumedAt: row.consumedAt,
    releasedAt: row.releasedAt,
    releaseReason: row.releaseReason,
  };
}

function auditData(
  actor: InventoryActorContext,
  action: string,
  subjectType: string,
  subjectId: string,
  before?: Readonly<Record<string, boolean | number | string | null>>,
  after?: Readonly<Record<string, boolean | number | string | null>>,
) {
  return {
    id: randomUUID(),
    actorUserId: actor.actorUserId,
    action,
    subjectType,
    subjectId,
    requestId: actor.metadata.requestId,
    ip: actor.metadata.clientIp ?? null,
    beforeJson: before ?? {},
    afterJson: after ?? {},
  };
}

export class PrismaInventoryRepository implements InventoryRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  runInTransaction<Result>(
    work: (transaction: TransactionContext) => Promise<Result>,
  ): Promise<Result> {
    return this.#client.$transaction((client) => work(new PrismaTransactionContext(client)));
  }

  async listLocations(): Promise<readonly StockLocationRecord[]> {
    const rows = await this.#client.stockLocation.findMany({ orderBy: { code: 'asc' } });
    return rows.map(mapLocation);
  }

  async getLocation(id: string): Promise<StockLocationRecord | null> {
    const row = await this.#client.stockLocation.findUnique({ where: { id } });
    return row === null ? null : mapLocation(row);
  }

  async getLocationByCode(code: string): Promise<StockLocationRecord | null> {
    const row = await this.#client.stockLocation.findUnique({ where: { code } });
    return row === null ? null : mapLocation(row);
  }

  async createLocation(
    input: LocationInput,
    actor: InventoryActorContext,
  ): Promise<StockLocationRecord> {
    return this.#client.$transaction(async (transaction) => {
      if (input.isDefault) {
        await transaction.stockLocation.updateMany({
          data: { isDefault: false },
          where: { isDefault: true },
        });
      }
      const created = await transaction.stockLocation.create({
        data: {
          id: randomUUID(),
          code: input.code,
          name: input.name,
          type: input.type,
          isSellable: input.isSellable,
          isDefault: input.isDefault,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
        },
      });
      await transaction.auditLog.create({
        data: auditData(
          actor,
          'inventory.location.created',
          'stock_location',
          created.id,
          undefined,
          {
            code: created.code,
          },
        ),
      });
      return mapLocation(created);
    });
  }

  async updateLocation(
    id: string,
    input: Partial<LocationInput>,
    actor: InventoryActorContext,
  ): Promise<StockLocationRecord | null> {
    return this.#client.$transaction(async (transaction) => {
      const existing = await transaction.stockLocation.findUnique({ where: { id } });
      if (existing === null) return null;
      if (input.isDefault === true) {
        await transaction.stockLocation.updateMany({
          data: { isDefault: false },
          where: { isDefault: true, NOT: { id } },
        });
      }
      const updated = await transaction.stockLocation.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.type === undefined ? {} : { type: input.type }),
          ...(input.isSellable === undefined ? {} : { isSellable: input.isSellable }),
          ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
          updatedBy: actor.actorUserId,
        },
      });
      await transaction.auditLog.create({
        data: auditData(
          actor,
          'inventory.location.updated',
          'stock_location',
          id,
          { isSellable: existing.isSellable, isDefault: existing.isDefault },
          { isSellable: updated.isSellable, isDefault: updated.isDefault },
        ),
      });
      return mapLocation(updated);
    });
  }

  async listItems(input: {
    cursor?: { updatedAt: string; id: string };
    limit: number;
    variantId?: string;
    stockLocationId?: string;
  }): Promise<
    Readonly<{
      items: readonly InventoryItemRecord[];
      next: { updatedAt: string; id: string } | null;
    }>
  > {
    const cursorDate = input.cursor === undefined ? undefined : new Date(input.cursor.updatedAt);
    const rows = await this.#client.inventoryItem.findMany({
      where: {
        ...(input.variantId === undefined ? {} : { variantId: input.variantId }),
        ...(input.stockLocationId === undefined ? {} : { stockLocationId: input.stockLocationId }),
        ...(cursorDate === undefined || input.cursor === undefined
          ? {}
          : {
              OR: [
                { updatedAt: { lt: cursorDate } },
                { updatedAt: cursorDate, id: { lt: input.cursor.id } },
              ],
            }),
      },
      include: { stockLocation: { select: { isSellable: true, isDefault: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const page = rows.slice(0, input.limit);
    const extra = rows[input.limit];
    return {
      items: page.map((row) => mapItem(row, row.stockLocation)),
      next: extra === undefined ? null : { updatedAt: extra.updatedAt.toISOString(), id: extra.id },
    };
  }

  async getItem(variantId: string, stockLocationId: string): Promise<InventoryItemRecord | null> {
    const row = await this.#client.inventoryItem.findUnique({
      where: { variantId_stockLocationId: { variantId, stockLocationId } },
      include: { stockLocation: { select: { isSellable: true, isDefault: true } } },
    });
    return row === null ? null : mapItem(row, row.stockLocation);
  }

  async getItemsForVariants(
    variantIds: readonly string[],
    transaction?: TransactionContext,
  ): Promise<readonly InventoryItemRecord[]> {
    if (variantIds.length === 0) return [];
    const client = transaction === undefined ? this.#client : asPrismaTransaction(transaction);
    const rows = await client.inventoryItem.findMany({
      where: { variantId: { in: [...variantIds] } },
      include: { stockLocation: { select: { isSellable: true, isDefault: true } } },
    });
    return rows.map((row) => mapItem(row, row.stockLocation));
  }

  async listAllItems(): Promise<readonly InventoryItemRecord[]> {
    const rows = await this.#client.inventoryItem.findMany({
      include: { stockLocation: { select: { isSellable: true, isDefault: true } } },
    });
    return rows.map((row) => mapItem(row, row.stockLocation));
  }

  async listLedger(input: {
    variantId: string;
    cursor?: { createdAt: string; id: string };
    limit: number;
  }): Promise<
    Readonly<{
      items: readonly StockLedgerRecord[];
      next: { createdAt: string; id: string } | null;
    }>
  > {
    const cursorDate = input.cursor === undefined ? undefined : new Date(input.cursor.createdAt);
    const rows = await this.#client.stockLedgerEntry.findMany({
      where: {
        variantId: input.variantId,
        ...(cursorDate === undefined || input.cursor === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: cursorDate } },
                { createdAt: cursorDate, id: { lt: input.cursor.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const page = rows.slice(0, input.limit);
    const extra = rows[input.limit];
    return {
      items: page.map((row) => ({
        id: row.id,
        variantId: row.variantId,
        stockLocationId: row.stockLocationId,
        delta: row.delta,
        reason: row.reason,
        refType: row.refType,
        refId: row.refId,
        note: row.note,
        actorUserId: row.actorUserId,
        createdAt: row.createdAt.toISOString(),
      })),
      next: extra === undefined ? null : { createdAt: extra.createdAt.toISOString(), id: extra.id },
    };
  }

  async ensureAndLockItems(
    transaction: TransactionContext,
    keys: readonly InventoryKey[],
    actorUserId: string | null,
  ): Promise<readonly InventoryItemRecord[]> {
    const client = asPrismaTransaction(transaction);
    const unique = [...keys].sort(compareInventoryKeys).filter((key, index, list) => {
      const previous = list[index - 1];
      return previous === undefined || compareInventoryKeys(previous, key) !== 0;
    });
    for (const key of unique) {
      await client.inventoryItem.upsert({
        where: {
          variantId_stockLocationId: {
            variantId: key.variantId,
            stockLocationId: key.stockLocationId,
          },
        },
        create: {
          id: randomUUID(),
          variantId: key.variantId,
          stockLocationId: key.stockLocationId,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
        update: {},
      });
    }
    if (unique.length === 0) return [];
    const tuples = unique.map(
      (key) => Prisma.sql`(${key.variantId}::uuid, ${key.stockLocationId}::uuid)`,
    );
    await client.$queryRaw`
      SELECT id
      FROM inventory_item
      WHERE (variant_id, stock_location_id) IN (${Prisma.join(tuples)})
      ORDER BY variant_id ASC, stock_location_id ASC
      FOR UPDATE
    `;
    const rows = await client.inventoryItem.findMany({
      where: {
        OR: unique.map((key) => ({
          variantId: key.variantId,
          stockLocationId: key.stockLocationId,
        })),
      },
      include: { stockLocation: { select: { isSellable: true, isDefault: true } } },
      orderBy: [{ variantId: 'asc' }, { stockLocationId: 'asc' }],
    });
    return rows.map((row) => mapItem(row, row.stockLocation));
  }

  async lockItems(
    transaction: TransactionContext,
    keys: readonly InventoryKey[],
  ): Promise<readonly InventoryItemRecord[]> {
    const client = asPrismaTransaction(transaction);
    const unique = [...keys].sort(compareInventoryKeys).filter((key, index, list) => {
      const previous = list[index - 1];
      return previous === undefined || compareInventoryKeys(previous, key) !== 0;
    });
    if (unique.length === 0) return [];
    const tuples = unique.map(
      (key) => Prisma.sql`(${key.variantId}::uuid, ${key.stockLocationId}::uuid)`,
    );
    await client.$queryRaw`
      SELECT id
      FROM inventory_item
      WHERE (variant_id, stock_location_id) IN (${Prisma.join(tuples)})
      ORDER BY variant_id ASC, stock_location_id ASC
      FOR UPDATE
    `;
    const rows = await client.inventoryItem.findMany({
      where: {
        OR: unique.map((key) => ({
          variantId: key.variantId,
          stockLocationId: key.stockLocationId,
        })),
      },
      include: { stockLocation: { select: { isSellable: true, isDefault: true } } },
      orderBy: [{ variantId: 'asc' }, { stockLocationId: 'asc' }],
    });
    return rows.map((row) => mapItem(row, row.stockLocation));
  }

  async lockSellableItemsForVariants(
    transaction: TransactionContext,
    variantIds: readonly string[],
  ): Promise<readonly InventoryItemRecord[]> {
    const uniqueVariantIds = [...new Set(variantIds)].sort((left, right) =>
      left.localeCompare(right),
    );
    if (uniqueVariantIds.length === 0) return [];
    const client = asPrismaTransaction(transaction);
    const values = uniqueVariantIds.map((variantId) => Prisma.sql`${variantId}::uuid`);
    await client.$queryRaw`
      SELECT inventory_item.id
      FROM inventory_item
      INNER JOIN stock_location ON stock_location.id = inventory_item.stock_location_id
      WHERE inventory_item.variant_id IN (${Prisma.join(values)})
        AND stock_location.is_sellable = true
      ORDER BY inventory_item.variant_id ASC, inventory_item.stock_location_id ASC
      FOR UPDATE
    `;
    const rows = await client.inventoryItem.findMany({
      where: {
        variantId: { in: uniqueVariantIds },
        stockLocation: { isSellable: true },
      },
      include: { stockLocation: { select: { isSellable: true, isDefault: true } } },
      orderBy: [{ variantId: 'asc' }, { stockLocationId: 'asc' }],
    });
    return rows.map((row) => mapItem(row, row.stockLocation));
  }

  async applyMovements(
    transaction: TransactionContext,
    movements: readonly StockMovement[],
    actor: InventoryActorContext,
  ): Promise<readonly InventoryItemRecord[]> {
    const client = asPrismaTransaction(transaction);
    const results: InventoryItemRecord[] = [];
    for (const movement of movements) {
      const current = await client.inventoryItem.findUnique({
        where: {
          variantId_stockLocationId: {
            variantId: movement.variantId,
            stockLocationId: movement.stockLocationId,
          },
        },
        include: { stockLocation: { select: { isSellable: true, isDefault: true } } },
      });
      if (current === null) throw new ConflictAppError({ code: 'INVENTORY_ITEM_MISSING' });
      if (movement.deltaOnHand === 0 && movement.deltaIncoming === 0) continue;
      const updated = await client.inventoryItem.update({
        where: { id: current.id },
        data: {
          onHand: current.onHand + movement.deltaOnHand,
          incoming: current.incoming + movement.deltaIncoming,
          version: { increment: 1 },
          updatedBy: actor.actorUserId,
        },
        include: { stockLocation: { select: { isSellable: true, isDefault: true } } },
      });
      if (movement.deltaOnHand !== 0) {
        await client.stockLedgerEntry.create({
          data: {
            id: randomUUID(),
            variantId: movement.variantId,
            stockLocationId: movement.stockLocationId,
            delta: movement.deltaOnHand,
            reason: movement.reason,
            refType: movement.refType,
            refId: movement.refId,
            note: movement.note,
            actorUserId: actor.actorUserId,
            createdBy: actor.actorUserId,
          },
        });
      }
      results.push(mapItem(updated, updated.stockLocation));
    }
    return results;
  }

  async applyReservationAccounting(
    transaction: TransactionContext,
    changes: readonly ReservationAccountingChange[],
    actor: InventoryActorContext,
  ): Promise<readonly InventoryItemRecord[]> {
    const client = asPrismaTransaction(transaction);
    const sorted = [...changes].sort(compareInventoryKeys);
    const results: InventoryItemRecord[] = [];
    for (const change of sorted) {
      const current = await client.inventoryItem.findUnique({
        where: {
          variantId_stockLocationId: {
            variantId: change.variantId,
            stockLocationId: change.stockLocationId,
          },
        },
        include: { stockLocation: { select: { isSellable: true, isDefault: true } } },
      });
      if (current === null) throw new ConflictAppError({ code: 'INVENTORY_ITEM_MISSING' });
      const reserved = current.reserved + change.deltaReserved;
      const allocated = current.allocated + change.deltaAllocated;
      if (
        reserved < 0 ||
        allocated < 0 ||
        current.onHand - reserved - allocated < 0 ||
        change.ledgerDelta === 0
      ) {
        throw new ConflictAppError({ code: 'INVENTORY_RESERVATION_DRIFT' });
      }
      const updated = await client.inventoryItem.update({
        where: { id: current.id },
        data: {
          reserved,
          allocated,
          version: { increment: 1 },
          updatedBy: actor.actorUserId,
        },
        include: { stockLocation: { select: { isSellable: true, isDefault: true } } },
      });
      await client.stockLedgerEntry.create({
        data: {
          id: randomUUID(),
          variantId: change.variantId,
          stockLocationId: change.stockLocationId,
          delta: change.ledgerDelta,
          reason: change.reason,
          refType: change.refType,
          refId: change.refId,
          note: change.note,
          actorUserId: actor.actorUserId,
          createdBy: actor.actorUserId,
        },
      });
      results.push(mapItem(updated, updated.stockLocation));
    }
    return results;
  }

  async setPlanning(
    variantId: string,
    stockLocationId: string,
    input: PlanningInput,
    actor: InventoryActorContext,
  ): Promise<InventoryItemRecord | null> {
    const existing = await this.#client.inventoryItem.findUnique({
      where: { variantId_stockLocationId: { variantId, stockLocationId } },
    });
    if (existing === null) return null;
    const updated = await this.#client.inventoryItem.update({
      where: { id: existing.id },
      data: {
        ...(input.reorderPoint === undefined ? {} : { reorderPoint: input.reorderPoint }),
        ...(input.safetyStock === undefined ? {} : { safetyStock: input.safetyStock }),
        updatedBy: actor.actorUserId,
      },
      include: { stockLocation: { select: { isSellable: true, isDefault: true } } },
    });
    return mapItem(updated, updated.stockLocation);
  }

  async setLowStockAlert(
    transaction: TransactionContext,
    keys: readonly InventoryKey[],
    active: boolean,
  ): Promise<void> {
    if (keys.length === 0) return;
    const client = asPrismaTransaction(transaction);
    await client.inventoryItem.updateMany({
      where: {
        OR: keys.map((key) => ({ variantId: key.variantId, stockLocationId: key.stockLocationId })),
      },
      data: { lowStockAlertActive: active },
    });
  }

  async variantExists(variantId: string): Promise<boolean> {
    const row = await this.#client.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true },
    });
    return row !== null;
  }

  async locationExists(stockLocationId: string): Promise<boolean> {
    const row = await this.#client.stockLocation.findUnique({
      where: { id: stockLocationId },
      select: { id: true },
    });
    return row !== null;
  }

  async ledgerStateByKey(): Promise<readonly (InventoryKey & InventoryLedgerState)[]> {
    const rows = await this.#client.stockLedgerEntry.groupBy({
      by: ['variantId', 'stockLocationId', 'reason'],
      _sum: { delta: true },
    });
    const byKey = new Map<string, InventoryKey & InventoryLedgerState>();
    for (const row of rows) {
      const key = `${row.variantId}:${row.stockLocationId}`;
      const current = byKey.get(key) ?? {
        variantId: row.variantId,
        stockLocationId: row.stockLocationId,
        onHand: 0,
        reserved: 0,
        allocated: 0,
      };
      const next = reduceInventoryLedgerState(current, {
        reason: row.reason,
        delta: row._sum.delta ?? 0,
      });
      byKey.set(key, { ...current, ...next });
    }
    return [...byKey.values()];
  }

  async repairCurrentState(
    transaction: TransactionContext,
    repairs: readonly (InventoryKey &
      Readonly<{
        onHand?: number;
        incoming?: number;
        reserved?: number;
        allocated?: number;
      }>)[],
    actor: InventoryActorContext,
  ): Promise<void> {
    const client = asPrismaTransaction(transaction);
    for (const repair of repairs) {
      await client.inventoryItem.update({
        where: {
          variantId_stockLocationId: {
            variantId: repair.variantId,
            stockLocationId: repair.stockLocationId,
          },
        },
        data: {
          ...(repair.onHand === undefined ? {} : { onHand: repair.onHand }),
          ...(repair.incoming === undefined ? {} : { incoming: repair.incoming }),
          ...(repair.reserved === undefined ? {} : { reserved: repair.reserved }),
          ...(repair.allocated === undefined ? {} : { allocated: repair.allocated }),
          version: { increment: 1 },
          updatedBy: actor.actorUserId,
        },
      });
    }
  }

  async listReservationsForCheckout(
    transaction: TransactionContext,
    checkoutSessionId: string,
  ): Promise<readonly StockReservationRecord[]> {
    const rows = await asPrismaTransaction(transaction).stockReservation.findMany({
      where: { checkoutSessionId },
      orderBy: [{ variantId: 'asc' }, { stockLocationId: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapReservation);
  }

  async lockReservationsForCheckout(
    transaction: TransactionContext,
    checkoutSessionId: string,
  ): Promise<readonly StockReservationRecord[]> {
    const client = asPrismaTransaction(transaction);
    await client.$queryRaw(Prisma.sql`
      SELECT id
      FROM stock_reservation
      WHERE checkout_session_id = ${checkoutSessionId}::uuid
      ORDER BY variant_id ASC, stock_location_id ASC, id ASC
      FOR UPDATE
    `);
    return this.listReservationsForCheckout(transaction, checkoutSessionId);
  }

  async lockReservationCheckout(
    transaction: TransactionContext,
    checkoutSessionId: string,
  ): Promise<void> {
    await asPrismaTransaction(transaction).$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(
        hashtextextended(${`reservation:${checkoutSessionId}`}, 0::bigint)
      )`,
    );
  }

  async listExpiredReservationIds(
    now: Date,
    batchSize: number,
    variantIds?: readonly string[],
  ): Promise<readonly string[]> {
    const uniqueVariantIds = variantIds === undefined ? undefined : [...new Set(variantIds)];
    if (uniqueVariantIds !== undefined && uniqueVariantIds.length === 0) return [];
    const rows = await this.#client.stockReservation.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lte: now },
        ...(uniqueVariantIds === undefined ? {} : { variantId: { in: uniqueVariantIds } }),
      },
      select: { id: true },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
    });
    return rows.map((row) => row.id);
  }

  async lockReservationsByIds(
    transaction: TransactionContext,
    reservationIds: readonly string[],
  ): Promise<readonly StockReservationRecord[]> {
    const ids = [...new Set(reservationIds)].sort((left, right) => left.localeCompare(right));
    if (ids.length === 0) return [];
    const client = asPrismaTransaction(transaction);
    const values = ids.map((id) => Prisma.sql`${id}::uuid`);
    await client.$queryRaw(Prisma.sql`
      SELECT id
      FROM stock_reservation
      WHERE id IN (${Prisma.join(values)})
      ORDER BY variant_id ASC, stock_location_id ASC, id ASC
      FOR UPDATE
    `);
    const rows = await client.stockReservation.findMany({
      where: { id: { in: ids } },
      orderBy: [{ variantId: 'asc' }, { stockLocationId: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapReservation);
  }

  async listReservationsByIds(
    transaction: TransactionContext,
    reservationIds: readonly string[],
  ): Promise<readonly StockReservationRecord[]> {
    const ids = [...new Set(reservationIds)].sort((left, right) => left.localeCompare(right));
    if (ids.length === 0) return [];
    const rows = await asPrismaTransaction(transaction).stockReservation.findMany({
      where: { id: { in: ids } },
      orderBy: [{ variantId: 'asc' }, { stockLocationId: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapReservation);
  }

  async createReservations(
    transaction: TransactionContext,
    reservations: readonly Readonly<{
      id: string;
      variantId: string;
      stockLocationId: string;
      quantity: number;
      cartId: string | null;
      checkoutSessionId: string;
      expiresAt: Date;
      createdAt: Date;
    }>[],
    actor: InventoryActorContext,
  ): Promise<readonly StockReservationRecord[]> {
    const client = asPrismaTransaction(transaction);
    for (const reservation of reservations) {
      await client.stockReservation.create({
        data: {
          id: reservation.id,
          variantId: reservation.variantId,
          stockLocationId: reservation.stockLocationId,
          quantity: reservation.quantity,
          cartId: reservation.cartId,
          checkoutSessionId: reservation.checkoutSessionId,
          status: 'ACTIVE',
          expiresAt: reservation.expiresAt,
          createdAt: reservation.createdAt,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
        },
      });
    }
    return this.lockReservationsByIds(
      transaction,
      reservations.map((reservation) => reservation.id),
    );
  }

  async markReservationsReleased(
    transaction: TransactionContext,
    reservations: readonly Readonly<{
      id: string;
      status: 'RELEASED' | 'EXPIRED';
      releasedAt: Date;
      releaseReason: string;
    }>[],
    actor: InventoryActorContext,
  ): Promise<void> {
    const client = asPrismaTransaction(transaction);
    for (const reservation of reservations) {
      await client.stockReservation.update({
        where: { id: reservation.id },
        data: {
          status: reservation.status,
          releasedAt: reservation.releasedAt,
          releaseReason: reservation.releaseReason,
          updatedBy: actor.actorUserId,
        },
      });
    }
  }

  async markReservationsConsumed(
    transaction: TransactionContext,
    reservations: readonly Readonly<{
      id: string;
      orderId: string;
      consumedAt: Date;
    }>[],
    actor: InventoryActorContext,
  ): Promise<void> {
    const client = asPrismaTransaction(transaction);
    for (const reservation of reservations) {
      await client.stockReservation.update({
        where: { id: reservation.id },
        data: {
          status: 'CONSUMED',
          orderId: reservation.orderId,
          consumedAt: reservation.consumedAt,
          updatedBy: actor.actorUserId,
        },
      });
    }
  }

  async extendReservations(
    transaction: TransactionContext,
    reservations: readonly Readonly<{ id: string; expiresAt: Date }>[],
    actor: InventoryActorContext,
  ): Promise<void> {
    const client = asPrismaTransaction(transaction);
    for (const reservation of reservations) {
      await client.stockReservation.update({
        where: { id: reservation.id },
        data: { expiresAt: reservation.expiresAt, updatedBy: actor.actorUserId },
      });
    }
  }

  async appendAudit(
    transaction: TransactionContext,
    actor: InventoryActorContext,
    action: string,
    subjectType: string,
    subjectId: string,
    before?: Readonly<Record<string, boolean | number | string | null>>,
    after?: Readonly<Record<string, boolean | number | string | null>>,
  ): Promise<void> {
    await asPrismaTransaction(transaction).auditLog.create({
      data: auditData(actor, action, subjectType, subjectId, before, after),
    });
  }

  async appendOutbox(
    transaction: TransactionContext,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Readonly<Record<string, string | number | boolean | null>>,
  ): Promise<void> {
    await asPrismaTransaction(transaction).outboxEvent.create({
      data: {
        id: randomUUID(),
        aggregateType,
        aggregateId,
        eventType,
        payload: { ...payload, version: 1 },
      },
    });
  }

  async close(): Promise<void> {
    await this.#client.$disconnect();
  }
}

export type { TransactionClient };
