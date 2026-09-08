import { randomUUID } from 'node:crypto';

import { createPrismaClient, type Prisma, type PrismaClient } from '@honey/db';

import {
  asPrismaTransaction,
  PrismaTransactionContext,
} from '../../../platform/infrastructure/prisma-platform.adapter.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import type {
  ProcurementActorContext,
  GoodsReceiptRecord,
  PurchaseOrderRecord,
  PurchaseOrderStatus,
  SupplierRecord,
  SupplierStatus,
} from '../domain/procurement.js';

export type SupplierInput = Readonly<{
  code: string;
  legalName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: SupplierStatus;
  qualityRating: number | null;
  notes: string | null;
}>;

export type PurchaseOrderWrite = Readonly<{
  number: string;
  supplierId: string;
  currency: string;
  expectedAt: string | null;
  notes: string | null;
  destinationStockLocationId: string | null;
  freightCostMinor: bigint;
  dutyCostMinor: bigint;
  otherCostMinor: bigint;
}>;

export type PurchaseOrderLineWrite = Readonly<{
  description: string;
  variantId: string | null;
  harvestBatchId: string | null;
  quantityOrdered: number;
  unitCostMinor: bigint;
  taxMinor: bigint;
  lineTotalMinor: bigint;
}>;

export type PurchaseOrderLineDraft = Omit<PurchaseOrderLineWrite, 'lineTotalMinor'> &
  Readonly<{ lineTotalMinor?: bigint }>;

export type IdempotencyLookup = Readonly<{
  scope: string;
  key: string;
  requestHash: string;
  userId: string;
}>;

function mapSupplier(row: {
  id: string;
  code: string;
  legalName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: SupplierStatus;
  qualityRating: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SupplierRecord {
  return {
    id: row.id,
    code: row.code,
    legalName: row.legalName,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    address: row.address,
    status: row.status,
    qualityRating: row.qualityRating,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function audit(
  actor: ProcurementActorContext,
  action: string,
  subjectType: string,
  subjectId: string,
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
    afterJson: after ?? {},
  };
}

export class PrismaProcurementRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  runInTransaction<Result>(
    work: (transaction: TransactionContext) => Promise<Result>,
  ): Promise<Result> {
    return this.#client.$transaction((client) => work(new PrismaTransactionContext(client)));
  }

  async listSuppliers(input: {
    cursor?: { createdAt: string; id: string };
    limit: number;
    status?: SupplierStatus;
  }): Promise<
    Readonly<{ items: readonly SupplierRecord[]; next: { createdAt: string; id: string } | null }>
  > {
    const cursorDate = input.cursor === undefined ? undefined : new Date(input.cursor.createdAt);
    const rows = await this.#client.supplier.findMany({
      where: {
        ...(input.status === undefined ? {} : { status: input.status }),
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
      items: page.map(mapSupplier),
      next: extra === undefined ? null : { createdAt: extra.createdAt.toISOString(), id: extra.id },
    };
  }

  async getSupplier(id: string): Promise<SupplierRecord | null> {
    const row = await this.#client.supplier.findUnique({ where: { id } });
    return row === null ? null : mapSupplier(row);
  }

  async createSupplier(
    input: SupplierInput,
    actor: ProcurementActorContext,
  ): Promise<SupplierRecord> {
    return this.#client.$transaction(async (transaction) => {
      const created = await transaction.supplier.create({
        data: {
          id: randomUUID(),
          ...input,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
        },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'procurement.supplier.created', 'supplier', created.id, {
          code: created.code,
          status: created.status,
        }),
      });
      return mapSupplier(created);
    });
  }

  async updateSupplier(
    id: string,
    input: Partial<SupplierInput>,
    actor: ProcurementActorContext,
  ): Promise<SupplierRecord | null> {
    return this.#client.$transaction(async (transaction) => {
      const existing = await transaction.supplier.findUnique({ where: { id } });
      if (existing === null) return null;
      const updated = await transaction.supplier.update({
        where: { id },
        data: { ...input, updatedBy: actor.actorUserId },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'procurement.supplier.updated', 'supplier', id, {
          status: updated.status,
        }),
      });
      return mapSupplier(updated);
    });
  }

  async listPurchaseOrders(input: {
    cursor?: { createdAt: string; id: string };
    limit: number;
    status?: PurchaseOrderStatus;
    supplierId?: string;
  }): Promise<
    Readonly<{
      items: readonly PurchaseOrderRecord[];
      next: { createdAt: string; id: string } | null;
    }>
  > {
    const cursorDate = input.cursor === undefined ? undefined : new Date(input.cursor.createdAt);
    const rows = await this.#client.purchaseOrder.findMany({
      where: {
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.supplierId === undefined ? {} : { supplierId: input.supplierId }),
        ...(cursorDate === undefined || input.cursor === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: cursorDate } },
                { createdAt: cursorDate, id: { lt: input.cursor.id } },
              ],
            }),
      },
      include: { lines: { orderBy: { id: 'asc' } }, receipts: { include: { lines: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const page = rows.slice(0, input.limit);
    const extra = rows[input.limit];
    return {
      items: page.map((row) => this.#mapOrder(row)),
      next: extra === undefined ? null : { createdAt: extra.createdAt.toISOString(), id: extra.id },
    };
  }

  async getPurchaseOrder(
    id: string,
    transaction?: TransactionContext,
  ): Promise<PurchaseOrderRecord | null> {
    const client = transaction === undefined ? this.#client : asPrismaTransaction(transaction);
    const row = await client.purchaseOrder.findUnique({
      where: { id },
      include: { lines: { orderBy: { id: 'asc' } }, receipts: { include: { lines: true } } },
    });
    return row === null ? null : this.#mapOrder(row);
  }

  async lockPurchaseOrder(
    transaction: TransactionContext,
    id: string,
  ): Promise<PurchaseOrderRecord | null> {
    const client = asPrismaTransaction(transaction);
    await client.$queryRaw`SELECT id FROM purchase_order WHERE id = ${id}::uuid FOR UPDATE`;
    await client.$queryRaw`
      SELECT id FROM purchase_order_line
      WHERE purchase_order_id = ${id}::uuid
      ORDER BY id ASC
      FOR UPDATE
    `;
    return this.getPurchaseOrder(id, transaction);
  }

  async createPurchaseOrder(
    input: PurchaseOrderWrite,
    lines: readonly PurchaseOrderLineWrite[],
    actor: ProcurementActorContext,
  ): Promise<PurchaseOrderRecord> {
    return this.#client.$transaction(async (transaction) => {
      const created = await transaction.purchaseOrder.create({
        data: {
          id: randomUUID(),
          number: input.number,
          supplierId: input.supplierId,
          currency: input.currency,
          expectedAt: input.expectedAt === null ? null : new Date(input.expectedAt),
          notes: input.notes,
          destinationStockLocationId: input.destinationStockLocationId,
          freightCostMinor: input.freightCostMinor,
          dutyCostMinor: input.dutyCostMinor,
          otherCostMinor: input.otherCostMinor,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
          lines: {
            create: lines.map((line) => ({
              id: randomUUID(),
              description: line.description,
              variantId: line.variantId,
              harvestBatchId: line.harvestBatchId,
              quantityOrdered: line.quantityOrdered,
              unitCostMinor: line.unitCostMinor,
              taxMinor: line.taxMinor,
              lineTotalMinor: line.lineTotalMinor,
              createdBy: actor.actorUserId,
            })),
          },
        },
        include: { lines: { orderBy: { id: 'asc' } }, receipts: { include: { lines: true } } },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'procurement.purchase_order.created', 'purchase_order', created.id, {
          number: created.number,
          status: created.status,
        }),
      });
      return this.#mapOrder(created);
    });
  }

  async replaceDraftLines(
    transaction: TransactionContext,
    purchaseOrderId: string,
    lines: readonly PurchaseOrderLineWrite[],
    actor: ProcurementActorContext,
  ): Promise<void> {
    const client = asPrismaTransaction(transaction);
    await client.purchaseOrderLine.deleteMany({ where: { purchaseOrderId } });
    if (lines.length > 0) {
      await client.purchaseOrderLine.createMany({
        data: lines.map((line) => ({
          id: randomUUID(),
          purchaseOrderId,
          description: line.description,
          variantId: line.variantId,
          harvestBatchId: line.harvestBatchId,
          quantityOrdered: line.quantityOrdered,
          unitCostMinor: line.unitCostMinor,
          taxMinor: line.taxMinor,
          lineTotalMinor: line.lineTotalMinor,
          createdBy: actor.actorUserId,
        })),
      });
    }
  }

  async updatePurchaseOrderHeader(
    transaction: TransactionContext,
    id: string,
    input: Partial<PurchaseOrderWrite> &
      Readonly<{ status?: PurchaseOrderStatus; placedBy?: string | null; placedAt?: Date | null }>,
    actor: ProcurementActorContext,
  ): Promise<PurchaseOrderRecord> {
    const client = asPrismaTransaction(transaction);
    const updated = await client.purchaseOrder.update({
      where: { id },
      data: {
        ...(input.expectedAt === undefined
          ? {}
          : { expectedAt: input.expectedAt === null ? null : new Date(input.expectedAt) }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(input.destinationStockLocationId === undefined
          ? {}
          : { destinationStockLocationId: input.destinationStockLocationId }),
        ...(input.freightCostMinor === undefined
          ? {}
          : { freightCostMinor: input.freightCostMinor }),
        ...(input.dutyCostMinor === undefined ? {} : { dutyCostMinor: input.dutyCostMinor }),
        ...(input.otherCostMinor === undefined ? {} : { otherCostMinor: input.otherCostMinor }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.placedBy === undefined ? {} : { placedBy: input.placedBy }),
        ...(input.placedAt === undefined ? {} : { placedAt: input.placedAt }),
        updatedBy: actor.actorUserId,
      },
      include: { lines: { orderBy: { id: 'asc' } }, receipts: { include: { lines: true } } },
    });
    return this.#mapOrder(updated);
  }

  async createGoodsReceipt(
    transaction: TransactionContext,
    input: Readonly<{
      purchaseOrderId: string;
      stockLocationId: string;
      receivedAt: Date;
      receivedBy: string;
      notes: string | null;
      lines: readonly Readonly<{
        purchaseOrderLineId: string;
        quantityAccepted: number;
        quantityRejected: number;
        rejectionReason: string | null;
        harvestBatchId: string;
      }>[];
    }>,
    actor: ProcurementActorContext,
  ): Promise<GoodsReceiptRecord> {
    const client = asPrismaTransaction(transaction);
    const created = await client.goodsReceipt.create({
      data: {
        id: randomUUID(),
        purchaseOrderId: input.purchaseOrderId,
        stockLocationId: input.stockLocationId,
        receivedAt: input.receivedAt,
        receivedBy: input.receivedBy,
        notes: input.notes,
        createdBy: actor.actorUserId,
        lines: {
          create: input.lines.map((line) => ({
            id: randomUUID(),
            purchaseOrderLineId: line.purchaseOrderLineId,
            quantityAccepted: line.quantityAccepted,
            quantityRejected: line.quantityRejected,
            rejectionReason: line.rejectionReason,
            harvestBatchId: line.harvestBatchId,
            createdBy: actor.actorUserId,
          })),
        },
      },
      include: { lines: true },
    });
    return {
      id: created.id,
      purchaseOrderId: created.purchaseOrderId,
      receivedAt: created.receivedAt.toISOString(),
      receivedBy: created.receivedBy,
      stockLocationId: created.stockLocationId,
      notes: created.notes,
      createdAt: created.createdAt.toISOString(),
      lines: created.lines.map((line) => ({
        id: line.id,
        purchaseOrderLineId: line.purchaseOrderLineId,
        quantityAccepted: line.quantityAccepted,
        quantityRejected: line.quantityRejected,
        rejectionReason: line.rejectionReason,
        harvestBatchId: line.harvestBatchId,
      })),
    };
  }

  async getHarvestBatchSupplier(
    transaction: TransactionContext,
    harvestBatchId: string,
  ): Promise<Readonly<{ supplierId: string | null; sourcingType: string }> | null> {
    const row = await asPrismaTransaction(transaction).harvestBatch.findUnique({
      where: { id: harvestBatchId },
      select: { supplierId: true, sourcingType: true },
    });
    return row;
  }

  async projectIncoming(): Promise<
    readonly Readonly<{ variantId: string; stockLocationId: string; incoming: number }>[]
  > {
    const orders = await this.#client.purchaseOrder.findMany({
      where: { status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] } },
      include: { lines: true, receipts: { include: { lines: true } } },
    });
    const totals = new Map<
      string,
      { variantId: string; stockLocationId: string; incoming: number }
    >();
    for (const order of orders) {
      if (order.destinationStockLocationId === null) continue;
      const received = new Map<string, number>();
      for (const receipt of order.receipts) {
        for (const line of receipt.lines) {
          received.set(
            line.purchaseOrderLineId,
            (received.get(line.purchaseOrderLineId) ?? 0) +
              line.quantityAccepted +
              line.quantityRejected,
          );
        }
      }
      for (const line of order.lines) {
        if (line.variantId === null) continue;
        const remaining = Math.max(0, line.quantityOrdered - (received.get(line.id) ?? 0));
        if (remaining === 0) continue;
        const key = `${line.variantId}:${order.destinationStockLocationId}`;
        const current = totals.get(key) ?? {
          variantId: line.variantId,
          stockLocationId: order.destinationStockLocationId,
          incoming: 0,
        };
        current.incoming += remaining;
        totals.set(key, current);
      }
    }
    return [...totals.values()];
  }

  async claimIdempotency(
    transaction: TransactionContext,
    lookup: IdempotencyLookup,
  ): Promise<Readonly<{
    requestHash: string;
    responseBody: unknown;
    responseStatus: number | null;
  }> | null> {
    const client = asPrismaTransaction(transaction);
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const inserted = await client.$queryRaw<ReadonlyArray<{ id: string }>>`
      INSERT INTO idempotency_key (id, key, scope, user_id, request_hash, expires_at)
      VALUES (${id}::uuid, ${lookup.key}, ${lookup.scope}, ${lookup.userId}::uuid, ${lookup.requestHash}, ${expiresAt})
      ON CONFLICT (key, scope) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 1) return null;
    await client.$queryRaw`
      SELECT id FROM idempotency_key
      WHERE key = ${lookup.key} AND scope = ${lookup.scope}
      FOR UPDATE
    `;
    const row = await client.idempotencyKey.findUnique({
      where: { key_scope: { key: lookup.key, scope: lookup.scope } },
    });
    if (row === null) return null;
    return {
      requestHash: row.requestHash,
      responseBody: row.responseBody,
      responseStatus: row.responseStatus,
    };
  }

  async saveIdempotency(
    transaction: TransactionContext,
    lookup: IdempotencyLookup,
    status: number,
    body: Prisma.InputJsonValue,
  ): Promise<void> {
    const client = asPrismaTransaction(transaction);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await client.idempotencyKey.upsert({
      where: { key_scope: { key: lookup.key, scope: lookup.scope } },
      create: {
        id: randomUUID(),
        key: lookup.key,
        scope: lookup.scope,
        userId: lookup.userId,
        requestHash: lookup.requestHash,
        responseStatus: status,
        responseBody: body,
        expiresAt,
      },
      update: {
        responseStatus: status,
        responseBody: body,
      },
    });
  }

  async appendAudit(
    transaction: TransactionContext,
    actor: ProcurementActorContext,
    action: string,
    subjectType: string,
    subjectId: string,
    after?: Readonly<Record<string, boolean | number | string | null>>,
  ): Promise<void> {
    await asPrismaTransaction(transaction).auditLog.create({
      data: audit(actor, action, subjectType, subjectId, after),
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

  #mapOrder(row: {
    id: string;
    number: string;
    supplierId: string;
    status: PurchaseOrderStatus;
    currency: string;
    expectedAt: Date | null;
    placedBy: string | null;
    placedAt: Date | null;
    notes: string | null;
    destinationStockLocationId: string | null;
    freightCostMinor: bigint;
    dutyCostMinor: bigint;
    otherCostMinor: bigint;
    createdAt: Date;
    updatedAt: Date;
    lines: readonly {
      id: string;
      purchaseOrderId: string;
      description: string;
      variantId: string | null;
      harvestBatchId: string | null;
      quantityOrdered: number;
      unitCostMinor: bigint;
      taxMinor: bigint;
      lineTotalMinor: bigint;
    }[];
    receipts: readonly {
      lines: readonly {
        purchaseOrderLineId: string;
        quantityAccepted: number;
        quantityRejected: number;
      }[];
    }[];
  }): PurchaseOrderRecord {
    const received = new Map<string, { accepted: number; rejected: number }>();
    for (const receipt of row.receipts) {
      for (const line of receipt.lines) {
        const current = received.get(line.purchaseOrderLineId) ?? { accepted: 0, rejected: 0 };
        current.accepted += line.quantityAccepted;
        current.rejected += line.quantityRejected;
        received.set(line.purchaseOrderLineId, current);
      }
    }
    return {
      id: row.id,
      number: row.number,
      supplierId: row.supplierId,
      status: row.status,
      currency: row.currency,
      expectedAt: row.expectedAt === null ? null : row.expectedAt.toISOString(),
      placedBy: row.placedBy,
      placedAt: row.placedAt === null ? null : row.placedAt.toISOString(),
      notes: row.notes,
      destinationStockLocationId: row.destinationStockLocationId,
      freightCostMinor: row.freightCostMinor.toString(),
      dutyCostMinor: row.dutyCostMinor.toString(),
      otherCostMinor: row.otherCostMinor.toString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lines: row.lines.map((line) => {
        const progress = received.get(line.id) ?? { accepted: 0, rejected: 0 };
        return {
          id: line.id,
          purchaseOrderId: line.purchaseOrderId,
          description: line.description,
          variantId: line.variantId,
          harvestBatchId: line.harvestBatchId,
          quantityOrdered: line.quantityOrdered,
          unitCostMinor: line.unitCostMinor.toString(),
          taxMinor: line.taxMinor.toString(),
          lineTotalMinor: line.lineTotalMinor.toString(),
          quantityReceivedAccepted: progress.accepted,
          quantityReceivedRejected: progress.rejected,
        };
      }),
    };
  }
}
