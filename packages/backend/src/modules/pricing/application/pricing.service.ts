import { randomUUID } from 'node:crypto';

import { ConflictAppError, ForbiddenAppError, ValidationAppError } from '../../../errors/index.js';
import type {
  AuthenticatedPrincipal,
  PermissionCode,
  RequestMetadata,
} from '../../identity/index.js';
import type {
  CouponLine,
  CouponEvaluation,
  CouponRecord,
  TaxJurisdiction,
  TaxRateRecord,
  VariantPriceRecord,
} from '../domain/pricing.js';
import {
  calculateTax,
  evaluateCoupon,
  normalizeCouponCode,
  resolveCurrentPrice,
  resolveTaxRate,
  validateCoupon,
  validateTaxRate,
  validateVariantPrice,
} from '../domain/pricing.js';
import type { PricingAuditActor, PricingRepository } from '../domain/pricing-repository.port.js';

export type PricingConfig = Readonly<{
  enabledCurrencies: readonly string[];
}>;

export type CouponLookupResult = Readonly<{
  coupon: CouponRecord | null;
  evaluation: CouponEvaluation | null;
}>;

export type CreateVariantPriceInput = Omit<
  VariantPriceRecord,
  'id' | 'amountMinor' | 'compareAtMinor'
> &
  Readonly<{
    amountMinor: string;
    compareAtMinor: string | null;
  }>;
export type CreateCouponInput = Omit<
  CouponRecord,
  'id' | 'usedCount' | 'value' | 'minSubtotalMinor' | 'maxDiscountMinor'
> &
  Readonly<{
    value: string;
    minSubtotalMinor: string | null;
    maxDiscountMinor: string | null;
  }>;
export type CreateTaxRateInput = Omit<TaxRateRecord, 'id'>;

function validation(path: string, code: string): ValidationAppError {
  return new ValidationAppError([{ path, code }]);
}

function assertAdmin(principal: AuthenticatedPrincipal, permission: PermissionCode): void {
  if (principal.kind !== 'STAFF') throw new ForbiddenAppError({ code: 'STAFF_REQUIRED' });
  if (!principal.permissions.includes(permission)) throw new ForbiddenAppError();
}

function minor(value: string, path: string): bigint {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) throw validation(path, 'PRICING_MINOR_INVALID');
  return BigInt(value);
}

export class PricingService {
  constructor(
    private readonly repository: PricingRepository,
    private readonly config: PricingConfig,
  ) {}

  async resolvePrices(
    variantIds: readonly string[],
    currency: string,
    now: Date,
  ): Promise<ReadonlyMap<string, VariantPriceRecord>> {
    const unique = [...new Set(variantIds)];
    if (unique.length === 0) return new Map();
    const [existingVariantIds, prices] = await Promise.all([
      this.repository.existingVariantIds(unique),
      this.repository.pricesForVariants(unique, currency),
    ]);
    const byVariant = new Map<string, VariantPriceRecord[]>();
    for (const price of prices) {
      const group = byVariant.get(price.variantId) ?? [];
      group.push(price);
      byVariant.set(price.variantId, group);
    }
    const result = new Map<string, VariantPriceRecord>();
    for (const variantId of unique) {
      if (!existingVariantIds.has(variantId)) continue;
      const current = resolveCurrentPrice({
        prices: byVariant.get(variantId) ?? [],
        variantId,
        currency,
        now,
        variantExists: true,
        enabledCurrencies: this.config.enabledCurrencies,
      });
      if (current !== null) result.set(variantId, current);
    }
    return result;
  }

  async evaluateCoupon(
    codeInput: string,
    currency: string,
    now: Date,
    cartSubtotalMinor: bigint,
    lines: readonly CouponLine[],
    userId: string | null,
  ): Promise<CouponLookupResult> {
    const code = normalizeCouponCode(codeInput);
    const coupon = await this.repository.findCoupon(code);
    if (coupon === null) return { coupon: null, evaluation: null };
    const customerRedemptionCount =
      coupon.usageLimitPerUser === null || userId === null
        ? null
        : await this.repository.countCouponRedemptions(coupon.id, userId);
    return {
      coupon,
      evaluation: evaluateCoupon({
        coupon,
        currency,
        now,
        cartSubtotalMinor,
        lines,
        customerRedemptionCount,
      }),
    };
  }

  async resolveTax(jurisdiction: TaxJurisdiction): Promise<TaxRateRecord | null> {
    return resolveTaxRate({ rates: await this.repository.listTaxRates(), jurisdiction });
  }

  calculateTax(taxableAmountMinor: bigint, rate: TaxRateRecord | null) {
    return calculateTax({ taxableAmountMinor, rate });
  }

  async listVariantPrices(
    principal: AuthenticatedPrincipal,
    variantId?: string,
  ): Promise<readonly VariantPriceRecord[]> {
    assertAdmin(principal, 'pricing:read');
    if (variantId !== undefined && !/^[0-9a-f-]{36}$/iu.test(variantId)) {
      throw validation('variantId', 'PRICING_VARIANT_ID_INVALID');
    }
    return this.repository.listVariantPrices(variantId);
  }

  async listCoupons(principal: AuthenticatedPrincipal): Promise<readonly CouponRecord[]> {
    assertAdmin(principal, 'pricing:read');
    return this.repository.listCoupons();
  }

  async listTaxRates(principal: AuthenticatedPrincipal): Promise<readonly TaxRateRecord[]> {
    assertAdmin(principal, 'pricing:read');
    return this.repository.listTaxRates();
  }

  async createVariantPrice(
    principal: AuthenticatedPrincipal,
    input: CreateVariantPriceInput,
    metadata: RequestMetadata,
  ): Promise<VariantPriceRecord> {
    assertAdmin(principal, 'pricing:write');
    const exists = await this.repository.existingVariantIds([input.variantId]);
    if (!exists.has(input.variantId)) throw validation('variantId', 'PRICING_VARIANT_NOT_FOUND');
    let price: VariantPriceRecord;
    try {
      price = validateVariantPrice(
        {
          id: randomUUID(),
          variantId: input.variantId,
          currency: input.currency,
          amountMinor: minor(input.amountMinor, 'amountMinor'),
          compareAtMinor:
            input.compareAtMinor === null ? null : minor(input.compareAtMinor, 'compareAtMinor'),
          validFrom: input.validFrom,
          validTo: input.validTo,
        },
        this.config.enabledCurrencies,
        true,
      );
    } catch {
      throw validation('price', 'PRICING_PRICE_INVALID');
    }
    try {
      return await this.repository.createVariantPrice(price, this.#actor(principal, metadata));
    } catch (error) {
      this.#rethrowConstraint(error);
    }
  }

  async createCoupon(
    principal: AuthenticatedPrincipal,
    input: CreateCouponInput,
    metadata: RequestMetadata,
  ): Promise<CouponRecord> {
    assertAdmin(principal, 'pricing:write');
    let coupon: CouponRecord;
    try {
      coupon = validateCoupon({
        id: randomUUID(),
        code: input.code,
        type: input.type,
        value: minor(input.value, 'value'),
        currency: input.currency,
        minSubtotalMinor:
          input.minSubtotalMinor === null
            ? null
            : minor(input.minSubtotalMinor, 'minSubtotalMinor'),
        maxDiscountMinor:
          input.maxDiscountMinor === null
            ? null
            : minor(input.maxDiscountMinor, 'maxDiscountMinor'),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        usageLimitTotal: input.usageLimitTotal,
        usageLimitPerUser: input.usageLimitPerUser,
        usedCount: 0,
        appliesTo: input.appliesTo,
        targetIds: input.targetIds,
        status: input.status,
      });
    } catch {
      throw validation('coupon', 'PRICING_COUPON_INVALID');
    }
    try {
      return await this.repository.createCoupon(coupon, this.#actor(principal, metadata));
    } catch (error) {
      this.#rethrowConstraint(error);
    }
  }

  async createTaxRate(
    principal: AuthenticatedPrincipal,
    input: CreateTaxRateInput,
    metadata: RequestMetadata,
  ): Promise<TaxRateRecord> {
    assertAdmin(principal, 'pricing:write');
    let rate: TaxRateRecord;
    try {
      rate = validateTaxRate({ id: randomUUID(), ...input });
    } catch {
      throw validation('taxRate', 'PRICING_TAX_RATE_INVALID');
    }
    try {
      return await this.repository.createTaxRate(rate, this.#actor(principal, metadata));
    } catch (error) {
      this.#rethrowConstraint(error);
    }
  }

  #actor(principal: AuthenticatedPrincipal, metadata: RequestMetadata): PricingAuditActor {
    return {
      actorUserId: principal.userId,
      requestId: metadata.requestId,
      ...(metadata.clientIp === undefined ? {} : { clientIp: metadata.clientIp }),
    };
  }

  #rethrowConstraint(error: unknown): never {
    if (error instanceof ValidationAppError || error instanceof ConflictAppError) throw error;
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new ConflictAppError({ code: 'PRICING_DUPLICATE_RECORD' });
    }
    throw error;
  }
}
