import { createPrismaClient, uuidV7, type Prisma } from '@honey/db';
import {
  adminPage,
  adminPageInput,
  type AdminPageInput,
} from '../../../platform/domain/admin-page.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import { asPrismaTransaction } from '../../../platform/infrastructure/prisma-platform.adapter.js';
import type { JsonValue } from '../../../errors/index.js';
import type {
  AdminOrderQuery,
  AdminOrdersRepository,
  AdminOrderSummary,
} from '../domain/admin-orders.js';

const summarySelection = {
  id: true,
  number: true,
  email: true,
  currency: true,
  status: true,
  paymentStatus: true,
  fulfilmentStatus: true,
  grandTotalMinor: true,
  placedAt: true,
} satisfies Prisma.OrderSelect;
const noteSelection = {
  id: true,
  body: true,
  authorUserId: true,
  createdAt: true,
} satisfies Prisma.OrderNoteSelect;
function summary(
  row: Prisma.OrderGetPayload<{ select: typeof summarySelection }>,
): AdminOrderSummary {
  return {
    ...row,
    grandTotalMinor: row.grandTotalMinor.toString(),
    placedAt: row.placedAt.toISOString(),
  };
}
function json(value: Prisma.JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(json);
  const result: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value))
    if (entry !== undefined) result[key] = json(entry);
  return result;
}
export class PrismaAdminOrdersRepository implements AdminOrdersRepository {
  readonly #client;
  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }
  async list(query: AdminOrderQuery) {
    const page = adminPageInput(query);
    const where: Prisma.OrderWhereInput = {
      ...(page.cursor === undefined ? {} : { id: { lt: page.cursor } }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.paymentStatus === undefined ? {} : { paymentStatus: query.paymentStatus }),
      ...(query.fulfilmentStatus === undefined ? {} : { fulfilmentStatus: query.fulfilmentStatus }),
      ...(query.customerId === undefined ? {} : { userId: query.customerId }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { number: { equals: query.q.trim().toUpperCase() } },
              { email: { equals: query.q.trim().toLowerCase() } },
            ],
          }),
    };
    const rows = await this.#client.order.findMany({
      where,
      orderBy: { id: 'desc' },
      take: page.limit + 1,
      select: summarySelection,
    });
    return adminPage(rows.map(summary), page.limit);
  }
  async detail(id: string) {
    const row = await this.#client.order.findUnique({
      where: { id },
      select: {
        ...summarySelection,
        userId: true,
        phone: true,
        localeAtPurchase: true,
        subtotalMinor: true,
        discountTotalMinor: true,
        shippingTotalMinor: true,
        taxTotalMinor: true,
        refundedTotalMinor: true,
        shippingAddressSnapshot: true,
        billingAddressSnapshot: true,
        shippingMethodSnapshot: true,
        lines: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            skuSnapshot: true,
            productNameSnapshot: true,
            variantNameSnapshot: true,
            quantity: true,
            unitPriceMinor: true,
            discountAllocatedMinor: true,
            taxAmountMinor: true,
            lineTotalMinor: true,
          },
        },
        statusHistory: {
          orderBy: { id: 'desc' },
          take: 100,
          select: { id: true, fromStatus: true, toStatus: true, createdAt: true },
        },
      },
    });
    if (row === null) return null;
    return {
      ...summary(row),
      customerId: row.userId,
      phone: row.phone,
      localeAtPurchase: row.localeAtPurchase,
      subtotalMinor: row.subtotalMinor.toString(),
      discountTotalMinor: row.discountTotalMinor.toString(),
      shippingTotalMinor: row.shippingTotalMinor.toString(),
      taxTotalMinor: row.taxTotalMinor.toString(),
      refundedTotalMinor: row.refundedTotalMinor.toString(),
      shippingAddress: json(row.shippingAddressSnapshot),
      billingAddress: json(row.billingAddressSnapshot),
      shippingMethod: json(row.shippingMethodSnapshot),
      lines: row.lines.map((line) => ({
        id: line.id,
        sku: line.skuSnapshot,
        productName: json(line.productNameSnapshot),
        variantName: json(line.variantNameSnapshot),
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor.toString(),
        discountMinor: line.discountAllocatedMinor.toString(),
        taxMinor: line.taxAmountMinor.toString(),
        totalMinor: line.lineTotalMinor.toString(),
      })),
      history: row.statusHistory.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }
  async notes(id: string, query: AdminPageInput) {
    const page = adminPageInput(query);
    const rows = await this.#client.orderNote.findMany({
      where: { orderId: id, ...(page.cursor === undefined ? {} : { id: { lt: page.cursor } }) },
      orderBy: { id: 'desc' },
      take: page.limit + 1,
      select: noteSelection,
    });
    return adminPage(
      rows.map((row) => ({
        id: row.id,
        body: row.body,
        actorUserId: row.authorUserId,
        createdAt: row.createdAt.toISOString(),
      })),
      page.limit,
    );
  }
  async addNote(
    orderId: string,
    body: string,
    actorUserId: string,
    transaction: TransactionContext,
  ) {
    const client = asPrismaTransaction(transaction);
    if ((await client.order.findUnique({ where: { id: orderId }, select: { id: true } })) === null)
      return null;
    const row = await client.orderNote.create({
      data: { id: uuidV7(), orderId, body, authorUserId: actorUserId, isCustomerVisible: false },
      select: noteSelection,
    });
    return {
      id: row.id,
      body: row.body,
      actorUserId: row.authorUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }
  close() {
    return this.#client.$disconnect();
  }
}
