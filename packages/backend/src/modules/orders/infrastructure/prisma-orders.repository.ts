import { randomUUID } from 'node:crypto';

import { createPrismaClient, Prisma, type PrismaClient } from '@honey/db';

import { ConflictAppError } from '../../../errors/index.js';
import type { JsonValue } from '../../../errors/index.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import { asPrismaTransaction } from '../../../platform/infrastructure/prisma-platform.adapter.js';
import type {
  CreatedPendingOrder,
  CreatePendingOrderInput,
  CustomerOrder,
  CustomerOrderLine,
  OrderJsonObject,
  OrderOwner,
  OrdersRepository,
} from '../domain/orders.js';

type Client = PrismaClient | ReturnType<typeof asPrismaTransaction>;

/**
 * Prisma's generated JSON types (mutable, optional-keyed) and the domain's
 * `JsonValue` / `OrderJsonObject` (readonly, required-keyed) describe the
 * same runtime shape — parsed JSON. This is the one place that boundary is
 * crossed, per docs/module-boundaries.md §1: domain never sees a Prisma type,
 * infrastructure translates.
 */
function toDomainJson(value: Prisma.JsonValue): JsonValue {
  return value as unknown as JsonValue;
}

function toPrismaJsonInput(value: OrderJsonObject): Prisma.InputJsonObject {
  return value as unknown as Prisma.InputJsonObject;
}

type CreatedRow = Readonly<{
  id: string;
  number: string;
  checkoutSessionId: string | null;
  status: string;
  paymentStatus: string;
  fulfilmentStatus: string;
  createdAt: Date;
}>;

type CustomerLineRow = Readonly<{
  productNameSnapshot: Prisma.JsonValue;
  variantNameSnapshot: Prisma.JsonValue;
  skuSnapshot: string;
  imageUrlSnapshot: string | null;
  quantity: number;
  unitPriceMinor: bigint;
  discountAllocatedMinor: bigint;
  taxRateBps: number;
  taxAmountMinor: bigint;
  lineTotalMinor: bigint;
}>;

type CustomerOrderRow = Readonly<{
  number: string;
  email: string;
  phone: string | null;
  localeAtPurchase: string;
  currency: string;
  status: CustomerOrder['status'];
  paymentStatus: CustomerOrder['paymentStatus'];
  fulfilmentStatus: CustomerOrder['fulfilmentStatus'];
  subtotalMinor: bigint;
  discountTotalMinor: bigint;
  shippingTotalMinor: bigint;
  taxTotalMinor: bigint;
  grandTotalMinor: bigint;
  couponCodeSnapshot: string | null;
  shippingMethodSnapshot: Prisma.JsonValue;
  shippingAddressSnapshot: Prisma.JsonValue;
  billingAddressSnapshot: Prisma.JsonValue;
  placedAt: Date;
  lines: readonly CustomerLineRow[];
}>;

function clientFor(client: PrismaClient, transaction: TransactionContext | undefined): Client {
  return transaction === undefined ? client : asPrismaTransaction(transaction);
}

function mapCreated(row: CreatedRow): CreatedPendingOrder {
  if (row.checkoutSessionId === null)
    throw new TypeError('New pending order has no checkout session.');
  if (
    row.status !== 'PENDING_PAYMENT' ||
    row.paymentStatus !== 'UNPAID' ||
    row.fulfilmentStatus !== 'UNFULFILLED'
  ) {
    throw new TypeError('Phase 13 order is not in the required initial state.');
  }
  return {
    id: row.id,
    number: row.number,
    checkoutSessionId: row.checkoutSessionId,
    status: row.status,
    paymentStatus: row.paymentStatus,
    fulfilmentStatus: row.fulfilmentStatus,
    createdAt: row.createdAt,
  };
}

function mapCustomerLine(row: CustomerLineRow): CustomerOrderLine {
  return {
    productNameSnapshot: toDomainJson(row.productNameSnapshot),
    variantNameSnapshot: toDomainJson(row.variantNameSnapshot),
    skuSnapshot: row.skuSnapshot,
    imageUrlSnapshot: row.imageUrlSnapshot,
    quantity: row.quantity,
    unitPriceMinor: row.unitPriceMinor,
    discountAllocatedMinor: row.discountAllocatedMinor,
    taxRateBps: row.taxRateBps,
    taxAmountMinor: row.taxAmountMinor,
    lineTotalMinor: row.lineTotalMinor,
  };
}

function mapCustomerOrder(row: CustomerOrderRow): CustomerOrder {
  return {
    number: row.number,
    email: row.email,
    phone: row.phone,
    localeAtPurchase: row.localeAtPurchase,
    currency: row.currency,
    status: row.status,
    paymentStatus: row.paymentStatus,
    fulfilmentStatus: row.fulfilmentStatus,
    subtotalMinor: row.subtotalMinor,
    discountTotalMinor: row.discountTotalMinor,
    shippingTotalMinor: row.shippingTotalMinor,
    taxTotalMinor: row.taxTotalMinor,
    grandTotalMinor: row.grandTotalMinor,
    couponCodeSnapshot: row.couponCodeSnapshot,
    shippingMethodSnapshot: toDomainJson(row.shippingMethodSnapshot),
    shippingAddressSnapshot: toDomainJson(row.shippingAddressSnapshot),
    billingAddressSnapshot: toDomainJson(row.billingAddressSnapshot),
    placedAt: row.placedAt,
    lines: row.lines.map(mapCustomerLine),
  };
}

function orderNumberYear(placedAt: Date): string {
  const year = placedAt.getUTCFullYear();
  if (!Number.isSafeInteger(year) || year < 1 || year > 9_999) {
    throw new TypeError('Order timestamp is outside the supported year range.');
  }
  return String(year).padStart(4, '0');
}

async function nextOrderNumber(
  client: ReturnType<typeof asPrismaTransaction>,
  placedAt: Date,
): Promise<string> {
  const year = orderNumberYear(placedAt);
  const prefix = `HNY-${year}-`;
  await client.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`order-number:${year}`}, 0::bigint))`,
  );
  const latest = await client.order.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const current = latest === null ? 0 : Number(latest.number.slice(prefix.length));
  if (!Number.isSafeInteger(current) || current < 0 || current >= 999_999) {
    throw new ConflictAppError({ code: 'ORDER_NUMBER_CAPACITY_EXHAUSTED' });
  }
  return `${prefix}${String(current + 1).padStart(6, '0')}`;
}

const customerOrderSelect = {
  number: true,
  email: true,
  phone: true,
  localeAtPurchase: true,
  currency: true,
  status: true,
  paymentStatus: true,
  fulfilmentStatus: true,
  subtotalMinor: true,
  discountTotalMinor: true,
  shippingTotalMinor: true,
  taxTotalMinor: true,
  grandTotalMinor: true,
  couponCodeSnapshot: true,
  shippingMethodSnapshot: true,
  shippingAddressSnapshot: true,
  billingAddressSnapshot: true,
  placedAt: true,
  lines: {
    orderBy: { id: 'asc' },
    select: {
      productNameSnapshot: true,
      variantNameSnapshot: true,
      skuSnapshot: true,
      imageUrlSnapshot: true,
      quantity: true,
      unitPriceMinor: true,
      discountAllocatedMinor: true,
      taxRateBps: true,
      taxAmountMinor: true,
      lineTotalMinor: true,
    },
  },
} satisfies Prisma.OrderSelect;

/** Persistence owned by the order boundary; every write uses the caller's transaction. */
export class PrismaOrdersRepository implements OrdersRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  async createPendingOrder(
    input: CreatePendingOrderInput,
    transaction: TransactionContext,
  ): Promise<CreatedPendingOrder> {
    const client = asPrismaTransaction(transaction);
    const number = await nextOrderNumber(client, input.placedAt);
    const order = await client.order.create({
      data: {
        id: randomUUID(),
        number,
        checkoutSessionId: input.checkoutSessionId,
        userId: input.userId,
        email: input.email,
        phone: input.phone,
        localeAtPurchase: input.localeAtPurchase,
        currency: input.currency,
        status: 'PENDING_PAYMENT',
        paymentStatus: 'UNPAID',
        fulfilmentStatus: 'UNFULFILLED',
        subtotalMinor: input.subtotalMinor,
        discountTotalMinor: input.discountTotalMinor,
        shippingTotalMinor: input.shippingTotalMinor,
        taxTotalMinor: input.taxTotalMinor,
        grandTotalMinor: input.grandTotalMinor,
        couponCodeSnapshot: input.couponCodeSnapshot,
        shippingMethodSnapshot: toPrismaJsonInput(input.shippingMethodSnapshot),
        shippingAddressSnapshot: toPrismaJsonInput(input.shippingAddressSnapshot),
        billingAddressSnapshot: toPrismaJsonInput(input.billingAddressSnapshot),
        placedAt: input.placedAt,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
        lines: {
          create: input.lines.map((line) => ({
            id: randomUUID(),
            productId: line.productId,
            variantId: line.variantId,
            skuSnapshot: line.skuSnapshot,
            productNameSnapshot: toPrismaJsonInput(line.productNameSnapshot),
            variantNameSnapshot: toPrismaJsonInput(line.variantNameSnapshot),
            attributesSnapshot: toPrismaJsonInput(line.attributesSnapshot),
            imageUrlSnapshot: line.imageUrlSnapshot,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountAllocatedMinor: line.discountAllocatedMinor,
            taxRateBps: line.taxRateBps,
            taxAmountMinor: line.taxAmountMinor,
            lineTotalMinor: line.lineTotalMinor,
            harvestBatchCodeSnapshot: line.harvestBatchCodeSnapshot,
          })),
        },
      },
      select: {
        id: true,
        number: true,
        checkoutSessionId: true,
        status: true,
        paymentStatus: true,
        fulfilmentStatus: true,
        createdAt: true,
      },
    });
    await client.orderStatusHistory.create({
      data: {
        id: randomUUID(),
        orderId: order.id,
        fromStatus: null,
        toStatus: 'PENDING_PAYMENT',
        reason: 'checkout_confirmed',
        actorUserId: input.actorUserId,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
    await client.auditLog.create({
      data: {
        id: randomUUID(),
        actorUserId: input.actorUserId,
        action: 'order.created',
        subjectType: 'order',
        subjectId: order.id,
        beforeJson: {},
        afterJson: { number: order.number, status: order.status },
      },
    });
    await client.outboxEvent.create({
      data: {
        id: randomUUID(),
        aggregateType: 'order',
        aggregateId: order.id,
        eventType: 'order.created',
        payload: { number: order.number, version: 1 },
      },
    });
    return mapCreated(order);
  }

  async findOwnedOrder(number: string, owner: OrderOwner): Promise<CustomerOrder | null> {
    const order = await this.#client.order.findFirst({
      where:
        owner.userId === undefined
          ? { number, checkoutSession: { cart: { anonymousId: owner.anonymousId } } }
          : { number, userId: owner.userId },
      select: customerOrderSelect,
    });
    return order === null ? null : mapCustomerOrder(order);
  }

  async listOrdersForUser(userId: string, limit: number): Promise<readonly CustomerOrder[]> {
    const rows = await this.#client.order.findMany({
      where: { userId },
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: customerOrderSelect,
    });
    return rows.map(mapCustomerOrder);
  }

  async findByCheckoutSession(
    checkoutSessionId: string,
    transaction: TransactionContext,
  ): Promise<CreatedPendingOrder | null> {
    const row = await clientFor(this.#client, transaction).order.findFirst({
      where: { checkoutSessionId },
      select: {
        id: true,
        number: true,
        checkoutSessionId: true,
        status: true,
        paymentStatus: true,
        fulfilmentStatus: true,
        createdAt: true,
      },
    });
    return row === null ? null : mapCreated(row);
  }

  close(): Promise<void> {
    return this.#client.$disconnect();
  }
}
