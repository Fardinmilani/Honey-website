import { randomUUID } from 'node:crypto';

import { createPrismaClient, Prisma, type PrismaClient } from '@honey/db';

import type { JsonValue } from '../../../errors/index.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import { asPrismaTransaction } from '../../../platform/infrastructure/prisma-platform.adapter.js';
import type {
  CheckoutAddress,
  CheckoutIdempotencyClaim,
  CheckoutJsonObject,
  CheckoutOwner,
  CheckoutRepository,
  CheckoutSessionRecord,
  StartCheckoutInput,
} from '../domain/checkout.js';

type Client = PrismaClient | ReturnType<typeof asPrismaTransaction>;

/**
 * Prisma's generated JSON types (mutable, optional-keyed) and the domain's
 * `JsonValue` / `CheckoutJsonObject` (readonly, required-keyed) describe the
 * same runtime shape — parsed JSON. This is the one place that boundary is
 * crossed, per docs/module-boundaries.md §1 ("infrastructure implements
 * domain ports"): domain never sees a Prisma type, infrastructure translates.
 */
function toDomainJson(value: Prisma.JsonValue): JsonValue {
  return value as unknown as JsonValue;
}

function toDomainJsonNullable(value: Prisma.JsonValue | null): JsonValue | null {
  return value === null ? null : toDomainJson(value);
}

function toPrismaJsonInput(value: CheckoutJsonObject): Prisma.InputJsonObject {
  return value as unknown as Prisma.InputJsonObject;
}

type AddressRow = Readonly<{
  id: string;
  fullName: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  postalCode: string;
  line1: string;
  line2: string | null;
}>;

type SessionRow = Readonly<{
  id: string;
  cartId: string;
  userId: string | null;
  email: string;
  phone: string | null;
  shippingAddress: AddressRow | null;
  billingAddress: AddressRow | null;
  sameAsShipping: boolean;
  shippingMethodCode: string | null;
  shippingQuoteId: string | null;
  status: string;
  reservationExpiresAt: Date | null;
  pricingSnapshot: Prisma.JsonValue | null;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}>;

const sessionInclude = {
  shippingAddress: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      country: true,
      province: true,
      city: true,
      postalCode: true,
      line1: true,
      line2: true,
    },
  },
  billingAddress: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      country: true,
      province: true,
      city: true,
      postalCode: true,
      line1: true,
      line2: true,
    },
  },
} satisfies Prisma.CheckoutSessionInclude;

function clientFor(client: PrismaClient, transaction: TransactionContext | undefined): Client {
  return transaction === undefined ? client : asPrismaTransaction(transaction);
}

function mapAddress(row: AddressRow | null): CheckoutAddress | null {
  return row === null
    ? null
    : {
        id: row.id,
        fullName: row.fullName,
        phone: row.phone,
        country: row.country,
        province: row.province,
        city: row.city,
        postalCode: row.postalCode,
        line1: row.line1,
        line2: row.line2,
      };
}

function status(value: string): CheckoutSessionRecord['status'] {
  if (
    value === 'OPEN' ||
    value === 'AWAITING_PAYMENT' ||
    value === 'COMPLETED' ||
    value === 'EXPIRED' ||
    value === 'CANCELLED'
  ) {
    return value;
  }
  throw new TypeError('Checkout session has an unknown status.');
}

function mapSession(row: SessionRow): CheckoutSessionRecord {
  return {
    id: row.id,
    cartId: row.cartId,
    userId: row.userId,
    email: row.email,
    phone: row.phone,
    shippingAddress: mapAddress(row.shippingAddress),
    billingAddress: mapAddress(row.billingAddress),
    sameAsShipping: row.sameAsShipping,
    shippingMethodCode: row.shippingMethodCode,
    shippingQuoteId: row.shippingQuoteId,
    status: status(row.status),
    reservationExpiresAt: row.reservationExpiresAt,
    pricingSnapshot: toDomainJsonNullable(row.pricingSnapshot),
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

function ownerWhere(owner: CheckoutOwner): Prisma.CheckoutSessionWhereInput {
  return owner.userId === undefined
    ? { cart: { anonymousId: owner.anonymousId } }
    : { userId: owner.userId };
}

function parseCompletedOrderNumber(value: Prisma.JsonValue | null): string | null {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('orderNumber' in value) ||
    typeof value['orderNumber'] !== 'string'
  ) {
    return null;
  }
  return value['orderNumber'];
}

/** Checkout owns checkout-session, address and checkout idempotency persistence. */
export class PrismaCheckoutRepository implements CheckoutRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  async findOwnedSession(
    id: string,
    owner: CheckoutOwner,
    transaction?: TransactionContext,
  ): Promise<CheckoutSessionRecord | null> {
    const row = await clientFor(this.#client, transaction).checkoutSession.findFirst({
      where: { id, ...ownerWhere(owner) },
      include: sessionInclude,
    });
    return row === null ? null : mapSession(row);
  }

  async lockOwnedSession(
    id: string,
    owner: CheckoutOwner,
    transaction: TransactionContext,
  ): Promise<CheckoutSessionRecord | null> {
    const client = asPrismaTransaction(transaction);
    const ownerCondition =
      owner.userId === undefined
        ? Prisma.sql`cart."anonymous_id" = ${owner.anonymousId}`
        : Prisma.sql`checkout_session."user_id" = ${owner.userId}::uuid`;
    const rows = await client.$queryRaw<readonly Readonly<{ id: string }>[]>(Prisma.sql`
      SELECT checkout_session."id"
      FROM "checkout_session" AS checkout_session
      INNER JOIN "cart" AS cart ON cart."id" = checkout_session."cart_id"
      WHERE checkout_session."id" = ${id}::uuid AND ${ownerCondition}
      FOR UPDATE
    `);
    if (rows.length === 0) return null;
    return this.findOwnedSession(id, owner, transaction);
  }

  async findOwnedByInitiationKey(
    idempotencyKey: string,
    owner: CheckoutOwner,
    transaction: TransactionContext,
  ): Promise<CheckoutSessionRecord | null> {
    const row = await asPrismaTransaction(transaction).checkoutSession.findFirst({
      where: { idempotencyKey, ...ownerWhere(owner) },
      include: sessionInclude,
    });
    return row === null ? null : mapSession(row);
  }

  async createSession(
    input: Readonly<{
      id: string;
      cartId: string;
      userId: string | null;
      idempotencyKey: string;
      contact: StartCheckoutInput;
      reservationExpiresAt: Date;
      pricingSnapshot: CheckoutJsonObject;
      actorUserId: string | null;
      requestId: string;
      clientIp: string | null;
    }>,
    transaction: TransactionContext,
  ): Promise<CheckoutSessionRecord> {
    const client = asPrismaTransaction(transaction);
    const shippingAddressId = randomUUID();
    await client.address.create({
      data: {
        id: shippingAddressId,
        userId: input.userId,
        ...addressData(input.contact.shippingAddress),
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
    const billingAddressId =
      input.contact.sameAsShipping || input.contact.billingAddress === null
        ? shippingAddressId
        : randomUUID();
    if (billingAddressId !== shippingAddressId && input.contact.billingAddress !== null) {
      await client.address.create({
        data: {
          id: billingAddressId,
          userId: input.userId,
          ...addressData(input.contact.billingAddress),
          createdBy: input.actorUserId,
          updatedBy: input.actorUserId,
        },
      });
    }
    const row = await client.checkoutSession.create({
      data: {
        id: input.id,
        cartId: input.cartId,
        userId: input.userId,
        email: input.contact.email,
        phone: input.contact.phone,
        shippingAddressId,
        billingAddressId,
        sameAsShipping: input.contact.sameAsShipping,
        status: 'OPEN',
        reservationExpiresAt: input.reservationExpiresAt,
        idempotencyKey: input.idempotencyKey,
        pricingSnapshot: toPrismaJsonInput(input.pricingSnapshot),
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
      include: sessionInclude,
    });
    await client.auditLog.create({
      data: {
        id: randomUUID(),
        actorUserId: input.actorUserId,
        action: 'checkout.started',
        subjectType: 'checkout_session',
        subjectId: row.id,
        beforeJson: {},
        afterJson: { status: row.status },
        requestId: input.requestId,
        ip: input.clientIp,
      },
    });
    await client.outboxEvent.create({
      data: {
        id: randomUUID(),
        aggregateType: 'checkout_session',
        aggregateId: row.id,
        eventType: 'checkout.started',
        payload: { version: 1 },
      },
    });
    return mapSession(row);
  }

  async updatePricingSnapshot(
    id: string,
    input: Readonly<{
      reservationExpiresAt: Date;
      pricingSnapshot: CheckoutJsonObject;
      actorUserId: string | null;
    }>,
    transaction: TransactionContext,
  ): Promise<CheckoutSessionRecord> {
    const row = await asPrismaTransaction(transaction).checkoutSession.update({
      where: { id },
      data: {
        reservationExpiresAt: input.reservationExpiresAt,
        pricingSnapshot: toPrismaJsonInput(input.pricingSnapshot),
        updatedBy: input.actorUserId,
      },
      include: sessionInclude,
    });
    return mapSession(row);
  }

  async extendReservationExpiry(
    id: string,
    input: Readonly<{ reservationExpiresAt: Date; actorUserId: string | null }>,
    transaction: TransactionContext,
  ): Promise<CheckoutSessionRecord> {
    const row = await asPrismaTransaction(transaction).checkoutSession.update({
      where: { id },
      data: {
        reservationExpiresAt: input.reservationExpiresAt,
        updatedBy: input.actorUserId,
      },
      include: sessionInclude,
    });
    return mapSession(row);
  }

  async markAwaitingPayment(
    id: string,
    actorUserId: string | null,
    completedAt: Date,
    transaction: TransactionContext,
  ): Promise<void> {
    await asPrismaTransaction(transaction).checkoutSession.update({
      where: { id },
      data: {
        status: 'AWAITING_PAYMENT',
        completedAt,
        updatedBy: actorUserId,
      },
    });
  }

  async markExpired(
    id: string,
    actorUserId: string | null,
    transaction: TransactionContext,
  ): Promise<void> {
    await asPrismaTransaction(transaction).checkoutSession.update({
      where: { id },
      data: { status: 'EXPIRED', updatedBy: actorUserId },
    });
  }

  async claimConfirmationIdempotency(
    input: Readonly<{
      key: string;
      scope: string;
      userId: string | null;
      requestHash: string;
      expiresAt: Date;
    }>,
    transaction: TransactionContext,
  ): Promise<CheckoutIdempotencyClaim | null> {
    const client = asPrismaTransaction(transaction);
    await client.idempotencyKey.deleteMany({
      where: { key: input.key, scope: input.scope, expiresAt: { lte: new Date() } },
    });
    const created = await client.$queryRaw<readonly Readonly<{ id: string }>[]>(Prisma.sql`
      INSERT INTO "idempotency_key" ("id", "key", "scope", "user_id", "request_hash", "expires_at")
      VALUES (
        ${randomUUID()}::uuid,
        ${input.key},
        ${input.scope},
        ${input.userId}::uuid,
        ${input.requestHash},
        ${input.expiresAt}
      )
      ON CONFLICT ("key", "scope") DO NOTHING
      RETURNING "id"
    `);
    if (created.length === 1) return null;
    await client.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "idempotency_key"
      WHERE "key" = ${input.key} AND "scope" = ${input.scope}
      FOR UPDATE
    `);
    const existing = await client.idempotencyKey.findUnique({
      where: { key_scope: { key: input.key, scope: input.scope } },
    });
    if (existing === null) return null;
    return {
      requestHash: existing.requestHash,
      completedOrderNumber: existing.responseStatus === 200 ? parseCompletedOrderNumber(existing.responseBody) : null,
    };
  }

  async completeConfirmationIdempotency(
    input: Readonly<{ key: string; scope: string; orderNumber: string }>,
    transaction: TransactionContext,
  ): Promise<void> {
    await asPrismaTransaction(transaction).idempotencyKey.update({
      where: { key_scope: { key: input.key, scope: input.scope } },
      data: { responseStatus: 200, responseBody: { orderNumber: input.orderNumber } },
    });
  }

  close(): Promise<void> {
    return this.#client.$disconnect();
  }
}

function addressData(address: StartCheckoutInput['shippingAddress']) {
  return {
    fullName: address.fullName,
    phone: address.phone,
    country: address.country,
    province: address.province,
    city: address.city,
    postalCode: address.postalCode,
    line1: address.line1,
    line2: address.line2,
  };
}
