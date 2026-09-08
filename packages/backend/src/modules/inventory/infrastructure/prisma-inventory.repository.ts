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
  type InventoryActorContext,
  type InventoryItemRecord,
  type InventoryKey,
  type InventoryRepository,
  type LocationInput,
  type PlanningInput,
  type StockLedgerRecord,
  type StockLocationRecord,
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
  isSellable: boolean,
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
    isSellable,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
      include: { stockLocation: { select: { isSellable: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const page = rows.slice(0, input.limit);
    const extra = rows[input.limit];
    return {
      items: page.map((row) => mapItem(row, row.stockLocation.isSellable)),
      next: extra === undefined ? null : { updatedAt: extra.updatedAt.toISOString(), id: extra.id },
    };
  }

  async getItem(variantId: string, stockLocationId: string): Promise<InventoryItemRecord | null> {
    const row = await this.#client.inventoryItem.findUnique({
      where: { variantId_stockLocationId: { variantId, stockLocationId } },
      include: { stockLocation: { select: { isSellable: true } } },
    });
    return row === null ? null : mapItem(row, row.stockLocation.isSellable);
  }

  async getItemsForVariants(
    variantIds: readonly string[],
    transaction?: TransactionContext,
  ): Promise<readonly InventoryItemRecord[]> {
    if (variantIds.length === 0) return [];
    const client = transaction === undefined ? this.#client : asPrismaTransaction(transaction);
    const rows = await client.inventoryItem.findMany({
      where: { variantId: { in: [...variantIds] } },
      include: { stockLocation: { select: { isSellable: true } } },
    });
    return rows.map((row) => mapItem(row, row.stockLocation.isSellable));
  }

  async listAllItems(): Promise<readonly InventoryItemRecord[]> {
    const rows = await this.#client.inventoryItem.findMany({
      include: { stockLocation: { select: { isSellable: true } } },
    });
    return rows.map((row) => mapItem(row, row.stockLocation.isSellable));
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
    actorUserId: string,
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
      include: { stockLocation: { select: { isSellable: true } } },
      orderBy: [{ variantId: 'asc' }, { stockLocationId: 'asc' }],
    });
    return rows.map((row) => mapItem(row, row.stockLocation.isSellable));
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
        include: { stockLocation: { select: { isSellable: true } } },
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
        include: { stockLocation: { select: { isSellable: true } } },
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
      results.push(mapItem(updated, updated.stockLocation.isSellable));
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
      include: { stockLocation: { select: { isSellable: true } } },
    });
    return mapItem(updated, updated.stockLocation.isSellable);
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

  async ledgerOnHandByKey(): Promise<readonly (InventoryKey & Readonly<{ onHand: number }>)[]> {
    const rows = await this.#client.stockLedgerEntry.groupBy({
      by: ['variantId', 'stockLocationId'],
      _sum: { delta: true },
    });
    return rows.map((row) => ({
      variantId: row.variantId,
      stockLocationId: row.stockLocationId,
      onHand: row._sum.delta ?? 0,
    }));
  }

  async repairCurrentState(
    transaction: TransactionContext,
    repairs: readonly (InventoryKey & Readonly<{ onHand?: number; incoming?: number }>)[],
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
          version: { increment: 1 },
          updatedBy: actor.actorUserId,
        },
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
