import { createPrismaClient, type PrismaClient } from '@honey/db';

import { randomUUID } from 'node:crypto';

import type { CouponRecord, TaxRateRecord, VariantPriceRecord } from '../domain/pricing.js';
import type { PricingAuditActor, PricingRepository } from '../domain/pricing-repository.port.js';

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

function mapTaxRate(row: {
  id: string;
  code: string;
  rateBps: number;
  country: string;
  region: string | null;
  isInclusive: boolean;
  isActive: boolean;
}): TaxRateRecord {
  return {
    id: row.id,
    code: row.code,
    rateBps: row.rateBps,
    country: row.country,
    region: row.region,
    isInclusive: row.isInclusive,
    isActive: row.isActive,
  };
}

export class PrismaPricingRepository implements PricingRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  async existingVariantIds(variantIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (variantIds.length === 0) return new Set();
    const rows = await this.#client.productVariant.findMany({
      where: { id: { in: [...new Set(variantIds)] } },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }

  async pricesForVariants(
    variantIds: readonly string[],
    currency: string,
  ): Promise<readonly VariantPriceRecord[]> {
    if (variantIds.length === 0) return [];
    const rows = await this.#client.variantPrice.findMany({
      where: { variantId: { in: [...new Set(variantIds)] }, currency },
      orderBy: [{ variantId: 'asc' }, { validFrom: 'desc' }],
    });
    return rows.map(mapPrice);
  }

  async listVariantPrices(variantId?: string): Promise<readonly VariantPriceRecord[]> {
    const rows = await this.#client.variantPrice.findMany({
      where: variantId === undefined ? {} : { variantId },
      orderBy: [{ variantId: 'asc' }, { currency: 'asc' }, { validFrom: 'desc' }],
    });
    return rows.map(mapPrice);
  }

  async findCoupon(code: string): Promise<CouponRecord | null> {
    const row = await this.#client.coupon.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
    });
    return row === null ? null : mapCoupon(row);
  }

  async listCoupons(): Promise<readonly CouponRecord[]> {
    const rows = await this.#client.coupon.findMany({ orderBy: { code: 'asc' } });
    return rows.map(mapCoupon);
  }

  async countCouponRedemptions(couponId: string, userId: string): Promise<number> {
    return this.#client.couponRedemption.count({ where: { couponId, userId } });
  }

  async listTaxRates(): Promise<readonly TaxRateRecord[]> {
    const rows = await this.#client.taxRate.findMany({
      orderBy: [{ country: 'asc' }, { region: 'asc' }],
    });
    return rows.map(mapTaxRate);
  }

  async createVariantPrice(
    input: VariantPriceRecord,
    actor: PricingAuditActor,
  ): Promise<VariantPriceRecord> {
    return this.#client.$transaction(async (transaction) => {
      const row = await transaction.variantPrice.create({
        data: {
          id: input.id,
          variantId: input.variantId,
          currency: input.currency,
          amountMinor: input.amountMinor,
          compareAtMinor: input.compareAtMinor,
          validFrom: input.validFrom,
          validTo: input.validTo,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
        },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'pricing.variant_price.created', 'variant_price', row.id, {
          variantId: row.variantId,
          currency: row.currency,
          amountMinor: row.amountMinor.toString(),
        }),
      });
      return mapPrice(row);
    });
  }

  async createCoupon(input: CouponRecord, actor: PricingAuditActor): Promise<CouponRecord> {
    return this.#client.$transaction(async (transaction) => {
      const row = await transaction.coupon.create({
        data: {
          id: input.id,
          code: input.code,
          type: input.type,
          value: input.value,
          currency: input.currency,
          minSubtotalMinor: input.minSubtotalMinor,
          maxDiscountMinor: input.maxDiscountMinor,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          usageLimitTotal: input.usageLimitTotal,
          usageLimitPerUser: input.usageLimitPerUser,
          usedCount: input.usedCount,
          appliesTo: input.appliesTo,
          targetIds: [...input.targetIds],
          status: input.status,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
        },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'pricing.coupon.created', 'coupon', row.id, { code: row.code }),
      });
      return mapCoupon(row);
    });
  }

  async createTaxRate(input: TaxRateRecord, actor: PricingAuditActor): Promise<TaxRateRecord> {
    return this.#client.$transaction(async (transaction) => {
      const row = await transaction.taxRate.create({
        data: {
          id: input.id,
          code: input.code,
          name: input.code,
          rateBps: input.rateBps,
          country: input.country,
          region: input.region,
          isInclusive: input.isInclusive,
          isActive: input.isActive,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
        },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'pricing.tax_rate.created', 'tax_rate', row.id, { code: row.code }),
      });
      return mapTaxRate(row);
    });
  }

  async close(): Promise<void> {
    await this.#client.$disconnect();
  }
}

function audit(
  actor: PricingAuditActor,
  action: string,
  subjectType: string,
  subjectId: string,
  afterJson: Readonly<Record<string, string>>,
) {
  return {
    id: randomUUID(),
    actorUserId: actor.actorUserId,
    action,
    subjectType,
    subjectId,
    requestId: actor.requestId,
    ip: actor.clientIp ?? null,
    beforeJson: {},
    afterJson,
  };
}
