import { randomUUID } from 'node:crypto';

import { createPrismaClient, Prisma, type PrismaClient } from '@honey/db';

import {
  asPrismaTransaction,
  PrismaTransactionContext,
} from '../../../platform/infrastructure/prisma-platform.adapter.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import type { CouponRecord, VariantPriceRecord } from '../../pricing/index.js';
import type {
  CartAddIdempotencyClaim,
  CartAddIdempotencyLookup,
  CartLineRecord,
  CartOwner,
  CartProductSummary,
  CartRecord,
  CartRepository,
  CartStatus,
} from '../domain/cart.js';

type Client = PrismaClient | ReturnType<typeof asPrismaTransaction>;

type CartRow = Readonly<{
  id: string;
  userId: string | null;
  anonymousId: string | null;
  currency: string;
  locale: string;
  status: CartStatus;
  couponCode: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

type LineRow = Readonly<{
  id: string;
  cartId: string;
  variantId: string;
  quantity: number;
  addedAt: Date;
  variant: Readonly<{
    status: string;
    deletedAt: Date | null;
    netWeightGrams: number;
    translations: readonly Readonly<{ name: string }>[];
    media: readonly Readonly<{
      mediaAssetId: string;
      role: string;
      position: number;
    }>[];
    product: Readonly<{
      id: string;
      status: string;
      deletedAt: Date | null;
      publishedAt: Date | null;
      translations: readonly Readonly<{ name: string; slug: string }>[];
      categories: readonly Readonly<{ categoryId: string }>[];
      collections: readonly Readonly<{ collectionId: string }>[];
      media: readonly Readonly<{
        mediaAssetId: string;
        role: string;
        position: number;
      }>[];
    }>;
  }>;
}>;

const CART_IMAGE_ROLES = ['THUMBNAIL', 'GALLERY', 'LIFESTYLE'] as const;
const MAX_IMAGE_CANDIDATES_PER_SCOPE = 3;
const CART_ADD_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

const lineInclude = (locale: string) =>
  ({
    variant: {
      select: {
        status: true,
        deletedAt: true,
        netWeightGrams: true,
        translations: { where: { locale }, select: { name: true } },
        media: {
          where: { role: { in: [...CART_IMAGE_ROLES] } },
          select: { mediaAssetId: true, role: true, position: true },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
        },
        product: {
          select: {
            id: true,
            status: true,
            deletedAt: true,
            publishedAt: true,
            translations: { where: { locale }, select: { name: true, slug: true } },
            categories: { select: { categoryId: true } },
            collections: { select: { collectionId: true } },
            media: {
              where: {
                variantId: null,
                role: { in: [...CART_IMAGE_ROLES] },
              },
              select: { mediaAssetId: true, role: true, position: true },
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
    },
  }) satisfies Prisma.CartLineInclude;

function clientFor(client: PrismaClient, transaction: TransactionContext | undefined): Client {
  return transaction === undefined ? client : asPrismaTransaction(transaction);
}

function mapCart(row: CartRow): CartRecord {
  return {
    id: row.id,
    userId: row.userId,
    anonymousId: row.anonymousId,
    currency: row.currency,
    locale: row.locale,
    status: row.status,
    couponCode: row.couponCode,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function lineName(value: readonly Readonly<{ name: string }>[]): string {
  return value[0]?.name ?? '';
}

function imageRoleRank(role: string): number {
  if (role === 'THUMBNAIL') return 0;
  if (role === 'GALLERY') return 1;
  return 2;
}

function rankedMediaAssetIds(
  media: readonly Readonly<{ mediaAssetId: string; role: string; position: number }>[],
): readonly string[] {
  return [...media]
    .sort(
      (left, right) =>
        imageRoleRank(left.role) - imageRoleRank(right.role) ||
        left.position - right.position ||
        left.mediaAssetId.localeCompare(right.mediaAssetId),
    )
    .slice(0, MAX_IMAGE_CANDIDATES_PER_SCOPE)
    .map((attachment) => attachment.mediaAssetId);
}

function cartImageAssetIds(variant: LineRow['variant']): readonly string[] {
  return [
    ...new Set([
      ...rankedMediaAssetIds(variant.media),
      ...rankedMediaAssetIds(variant.product.media),
    ]),
  ];
}

function mapProductSummary(variant: LineRow['variant']): CartProductSummary {
  const productTranslation = variant.product.translations[0];
  return {
    productId: variant.product.id,
    productName: productTranslation?.name ?? '',
    productSlug: productTranslation?.slug ?? '',
    variantName: lineName(variant.translations),
    netWeightGrams: variant.netWeightGrams,
    imageAssetIds: cartImageAssetIds(variant),
    imageUrl: null,
    categoryIds: variant.product.categories.map((category) => category.categoryId),
    collectionIds: variant.product.collections.map((collection) => collection.collectionId),
    published:
      variant.status === 'PUBLISHED' &&
      variant.deletedAt === null &&
      variant.product.status === 'PUBLISHED' &&
      variant.product.deletedAt === null &&
      variant.product.publishedAt !== null &&
      productTranslation !== undefined &&
      lineName(variant.translations) !== '',
  };
}

function mapLine(row: LineRow): CartLineRecord {
  return {
    id: row.id,
    cartId: row.cartId,
    variantId: row.variantId,
    quantity: row.quantity,
    addedAt: row.addedAt,
    product: mapProductSummary(row.variant),
  };
}

function mapCoupon(row: {
  id: string;
  code: string;
  type: CouponRecord['type'];
  value: bigint;
  currency: string | null;
  minSubtotalMinor: bigint | null;
  maxDiscountMinor: bigint | null;
  startsAt: Date;
  endsAt: Date | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number | null;
  usedCount: number;
  appliesTo: CouponRecord['appliesTo'];
  targetIds: readonly string[];
  status: CouponRecord['status'];
}): CouponRecord {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: row.value,
    currency: row.currency,
    minSubtotalMinor: row.minSubtotalMinor,
    maxDiscountMinor: row.maxDiscountMinor,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    usageLimitTotal: row.usageLimitTotal,
    usageLimitPerUser: row.usageLimitPerUser,
    usedCount: row.usedCount,
    appliesTo: row.appliesTo,
    targetIds: row.targetIds,
    status: row.status,
  };
}

function mapPrice(row: {
  id: string;
  variantId: string;
  currency: string;
  amountMinor: bigint;
  compareAtMinor: bigint | null;
  validFrom: Date;
  validTo: Date | null;
}): VariantPriceRecord {
  return {
    id: row.id,
    variantId: row.variantId,
    currency: row.currency,
    amountMinor: row.amountMinor,
    compareAtMinor: row.compareAtMinor,
    validFrom: row.validFrom,
    validTo: row.validTo,
  };
}

export class PrismaCartRepository implements CartRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  runInTransaction<Result>(
    work: (transaction: TransactionContext) => Promise<Result>,
  ): Promise<Result> {
    return this.#client.$transaction((client) => work(new PrismaTransactionContext(client)));
  }

  async findActiveCart(
    owner: CartOwner,
    transaction?: TransactionContext,
  ): Promise<CartRecord | null> {
    const client = clientFor(this.#client, transaction);
    const row = await client.cart.findFirst({
      where: {
        status: 'ACTIVE',
        ...(owner.userId === undefined
          ? { anonymousId: owner.anonymousId }
          : { userId: owner.userId }),
      },
    });
    return row === null ? null : mapCart(row);
  }

  async findCartById(id: string, transaction?: TransactionContext): Promise<CartRecord | null> {
    const row = await clientFor(this.#client, transaction).cart.findUnique({ where: { id } });
    return row === null ? null : mapCart(row);
  }

  async createCart(
    input: Readonly<{
      id: string;
      owner: CartOwner;
      currency: string;
      locale: string;
      expiresAt: Date;
    }>,
    transaction: TransactionContext,
  ): Promise<CartRecord> {
    const row = await asPrismaTransaction(transaction).cart.create({
      data: {
        id: input.id,
        ...(input.owner.userId === undefined
          ? { anonymousId: input.owner.anonymousId }
          : { userId: input.owner.userId }),
        currency: input.currency,
        locale: input.locale,
        expiresAt: input.expiresAt,
        createdBy: input.owner.userId ?? null,
        updatedBy: input.owner.userId ?? null,
      },
    });
    return mapCart(row);
  }

  async lockCartOwner(owner: CartOwner, transaction: TransactionContext): Promise<void> {
    const ownerKey =
      owner.userId === undefined ? `anonymous:${owner.anonymousId}` : `user:${owner.userId}`;
    await asPrismaTransaction(transaction).$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${ownerKey}, 0::bigint))`,
    );
  }

  async claimAddIdempotency(
    transaction: TransactionContext,
    lookup: CartAddIdempotencyLookup,
  ): Promise<CartAddIdempotencyClaim | null> {
    const client = asPrismaTransaction(transaction);
    const now = new Date();
    await client.idempotencyKey.deleteMany({
      where: { key: lookup.key, scope: lookup.scope, expiresAt: { lte: now } },
    });
    const inserted = await client.$queryRaw<readonly Readonly<{ id: string }>[]>(Prisma.sql`
      INSERT INTO "idempotency_key" ("id", "key", "scope", "user_id", "request_hash", "expires_at")
      VALUES (
        ${randomUUID()}::uuid,
        ${lookup.key},
        ${lookup.scope},
        ${lookup.userId}::uuid,
        ${lookup.requestHash},
        ${new Date(now.getTime() + CART_ADD_IDEMPOTENCY_TTL_MS)}
      )
      ON CONFLICT ("key", "scope") DO NOTHING
      RETURNING "id"
    `);
    if (inserted.length === 1) return null;
    await client.$queryRaw(Prisma.sql`
      SELECT "id" FROM "idempotency_key"
      WHERE "key" = ${lookup.key} AND "scope" = ${lookup.scope}
      FOR UPDATE
    `);
    const existing = await client.idempotencyKey.findUnique({
      where: { key_scope: { key: lookup.key, scope: lookup.scope } },
    });
    if (existing === null) return null;
    return {
      requestHash: existing.requestHash,
      completed: existing.responseStatus === 200,
    };
  }

  async completeAddIdempotency(
    transaction: TransactionContext,
    lookup: CartAddIdempotencyLookup,
    cartId: string,
  ): Promise<void> {
    await asPrismaTransaction(transaction).idempotencyKey.update({
      where: { key_scope: { key: lookup.key, scope: lookup.scope } },
      data: { responseStatus: 200, responseBody: { cartId } },
    });
  }

  async lockCart(id: string, transaction: TransactionContext): Promise<CartRecord | null> {
    const client = asPrismaTransaction(transaction);
    await client.$queryRaw(Prisma.sql`SELECT "id" FROM "cart" WHERE "id" = ${id}::uuid FOR UPDATE`);
    const row = await client.cart.findUnique({ where: { id } });
    return row === null ? null : mapCart(row);
  }

  async abandonCart(id: string, transaction: TransactionContext): Promise<void> {
    await asPrismaTransaction(transaction).cart.update({
      where: { id },
      data: { status: 'ABANDONED' },
    });
  }

  async updateCart(
    id: string,
    input: Readonly<{
      userId?: string | null;
      anonymousId?: string | null;
      currency?: string;
      locale?: string;
      status?: CartStatus;
      couponCode?: string | null;
      expiresAt?: Date;
    }>,
    transaction: TransactionContext,
  ): Promise<CartRecord> {
    const row = await asPrismaTransaction(transaction).cart.update({
      where: { id },
      data: {
        ...(input.userId === undefined ? {} : { userId: input.userId }),
        ...(input.anonymousId === undefined ? {} : { anonymousId: input.anonymousId }),
        ...(input.currency === undefined ? {} : { currency: input.currency }),
        ...(input.locale === undefined ? {} : { locale: input.locale }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.couponCode === undefined ? {} : { couponCode: input.couponCode }),
        ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      },
    });
    return mapCart(row);
  }

  async listLines(
    cartId: string,
    locale: string,
    transaction?: TransactionContext,
  ): Promise<readonly CartLineRecord[]> {
    const rows = await clientFor(this.#client, transaction).cartLine.findMany({
      where: { cartId },
      include: lineInclude(locale),
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => mapLine(row));
  }

  async getVariant(
    variantId: string,
    locale: string,
  ): Promise<Readonly<{ id: string; product: CartLineRecord['product'] }> | null> {
    const row = await this.#client.productVariant.findUnique({
      where: { id: variantId },
      select: lineInclude(locale).variant.select,
    });
    return row === null ? null : { id: variantId, product: mapProductSummary(row) };
  }

  async getLine(
    id: string,
    locale: string,
    transaction?: TransactionContext,
  ): Promise<CartLineRecord | null> {
    const row = await clientFor(this.#client, transaction).cartLine.findUnique({
      where: { id },
      include: lineInclude(locale),
    });
    return row === null ? null : mapLine(row);
  }

  async upsertLine(
    input: Readonly<{
      cartId: string;
      variantId: string;
      quantity: number;
      actorUserId: string | null;
    }>,
    transaction: TransactionContext,
  ): Promise<void> {
    await asPrismaTransaction(transaction).cartLine.upsert({
      where: { cartId_variantId: { cartId: input.cartId, variantId: input.variantId } },
      create: {
        id: randomUUID(),
        cartId: input.cartId,
        variantId: input.variantId,
        quantity: input.quantity,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
      update: { quantity: input.quantity, updatedBy: input.actorUserId },
    });
  }

  async updateLineQuantity(
    id: string,
    quantity: number,
    actorUserId: string | null,
    transaction: TransactionContext,
  ): Promise<void> {
    await asPrismaTransaction(transaction).cartLine.update({
      where: { id },
      data: { quantity, updatedBy: actorUserId },
    });
  }

  async deleteLine(id: string, transaction: TransactionContext): Promise<void> {
    await asPrismaTransaction(transaction).cartLine.delete({ where: { id } });
  }

  async findCoupon(code: string): Promise<CouponRecord | null> {
    const rows = await this.#client.$queryRaw<
      readonly {
        id: string;
        code: string;
        type: CouponRecord['type'];
        value: bigint;
        currency: string | null;
        minSubtotalMinor: bigint | null;
        maxDiscountMinor: bigint | null;
        startsAt: Date;
        endsAt: Date | null;
        usageLimitTotal: number | null;
        usageLimitPerUser: number | null;
        usedCount: number;
        appliesTo: CouponRecord['appliesTo'];
        targetIds: readonly string[];
        status: CouponRecord['status'];
      }[]
    >(Prisma.sql`
      SELECT "id", "code", "type", "value", "currency", "min_subtotal_minor" AS "minSubtotalMinor",
             "max_discount_minor" AS "maxDiscountMinor", "starts_at" AS "startsAt", "ends_at" AS "endsAt",
             "usage_limit_total" AS "usageLimitTotal", "usage_limit_per_user" AS "usageLimitPerUser",
             "used_count" AS "usedCount", "applies_to" AS "appliesTo", "target_ids" AS "targetIds", "status"
      FROM "coupon"
      WHERE lower("code") = lower(${code})
      LIMIT 1
    `);
    const row = rows[0];
    return row === undefined ? null : mapCoupon(row);
  }

  async countCouponRedemptions(couponId: string, userId: string): Promise<number> {
    return this.#client.couponRedemption.count({ where: { couponId, userId } });
  }

  async pricesForVariants(
    variantIds: readonly string[],
    currency: string,
    now: Date,
  ): Promise<readonly VariantPriceRecord[]> {
    if (variantIds.length === 0) return [];
    const rows = await this.#client.variantPrice.findMany({
      where: {
        variantId: { in: [...new Set(variantIds)] },
        currency,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gt: now } }],
      },
      orderBy: [{ variantId: 'asc' }, { validFrom: 'desc' }],
    });
    return rows.map(mapPrice);
  }

  async appendSecurityAudit(
    input: Readonly<{
      actorUserId: string | null;
      subjectId: string;
      requestId: string;
      clientIp: string | null;
      offendingField: string;
    }>,
  ): Promise<void> {
    await this.#client.auditLog.create({
      data: {
        id: randomUUID(),
        actorUserId: input.actorUserId,
        action: 'security.tampering_attempt',
        subjectType: 'cart_request',
        subjectId: input.subjectId,
        requestId: input.requestId,
        ip: input.clientIp,
        beforeJson: {},
        afterJson: { offendingField: input.offendingField },
      },
    });
  }

  async close(): Promise<void> {
    await this.#client.$disconnect();
  }
}
