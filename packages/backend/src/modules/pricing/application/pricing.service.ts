import { randomUUID } from 'node:crypto';

import { ConflictAppError, ForbiddenAppError, ValidationAppError } from '../../../errors/index.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import type {
  AuthenticatedPrincipal,
  PermissionCode,
  RequestMetadata,
} from '../../identity/index.js';
import type {
  CouponLine,
  CouponEvaluation,
  CouponRecord,
  DiscountAllocationResult,
  TaxJurisdiction,
  TaxCalculation,
  TaxRateRecord,
  VariantPriceRecord,
} from '../domain/pricing.js';
import {
  calculateTax,
  allocateProportionalDiscount,
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

export type CheckoutPricingLine = Readonly<{
  id: string;
  variantId: string;
  quantity: number;
  published: boolean;
  categoryIds: readonly string[];
  collectionIds: readonly string[];
}>;

export type CheckoutPricingInput = Readonly<{
  currency: string;
  lines: readonly CheckoutPricingLine[];
  couponCode: string | null;
  userId: string | null;
  jurisdiction: TaxJurisdiction;
  now: Date;
  transaction: TransactionContext;
}>;

export type CheckoutPricingResult = Readonly<{
  currency: string;
  lines: readonly Readonly<{
    id: string;
    variantId: string;
    quantity: number;
    unitPriceMinor: bigint;
    subtotalMinor: bigint;
    discountMinor: bigint;
    lineTotalMinor: bigint;
  }>[];
  subtotalMinor: bigint;
  discountTotalMinor: bigint;
  merchandiseTotalMinor: bigint;
  coupon: CouponRecord | null;
  couponEvaluation: CouponEvaluation | null;
  discountAllocation: DiscountAllocationResult;
  tax: TaxCalculation;
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
    transaction?: TransactionContext,
  ): Promise<ReadonlyMap<string, VariantPriceRecord>> {
    const unique = [...new Set(variantIds)];
    if (unique.length === 0) return new Map();
    const [existingVariantIds, prices] = await Promise.all([
      this.repository.existingVariantIds(unique, transaction),
      this.repository.pricesForVariants(unique, currency, transaction),
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

  /**
   * Resolves all money during the caller's short checkout transaction. A
   * coupon row is locked before it is evaluated, so an order cannot consume a
   * stale last use. Tax deliberately fails closed in CheckoutService when the
   * data-driven resolver has no policy for the authoritative destination.
   */
  async priceCheckout(input: CheckoutPricingInput): Promise<CheckoutPricingResult> {
    if (input.lines.length === 0) throw validation('lines', 'CHECKOUT_CART_EMPTY');
    const prices = await this.resolvePrices(
      input.lines.map((line) => line.variantId),
      input.currency,
      input.now,
      input.transaction,
    );
    const priced = input.lines.map((line) => {
      if (!line.published) throw new ConflictAppError({ code: 'CHECKOUT_VARIANT_NOT_AVAILABLE' });
      const price = prices.get(line.variantId);
      if (price === undefined) throw new ConflictAppError({ code: 'CHECKOUT_PRICE_UNAVAILABLE' });
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
        throw validation('lines.quantity', 'CHECKOUT_QUANTITY_INVALID');
      }
      const subtotalMinor = price.amountMinor * BigInt(line.quantity);
      return { ...line, unitPriceMinor: price.amountMinor, subtotalMinor };
    });
    const subtotalMinor = priced.reduce((total, line) => total + line.subtotalMinor, 0n);
    let coupon: CouponRecord | null = null;
    let couponEvaluation: CouponEvaluation | null = null;
    if (input.couponCode !== null) {
      coupon = await this.repository.lockCoupon(normalizeCouponCode(input.couponCode), input.transaction);
      if (coupon === null) throw new ConflictAppError({ code: 'CHECKOUT_COUPON_INVALID' });
      const redemptionCount =
        input.userId === null || coupon.usageLimitPerUser === null
          ? null
          : await this.repository.countCouponRedemptions(coupon.id, input.userId, input.transaction);
      couponEvaluation = evaluateCoupon({
        coupon,
        currency: input.currency,
        now: input.now,
        cartSubtotalMinor: subtotalMinor,
        lines: priced.map((line) => ({
          id: line.id,
          variantId: line.variantId,
          categoryIds: line.categoryIds,
          collectionIds: line.collectionIds,
          subtotalMinor: line.subtotalMinor,
        })),
        customerRedemptionCount: redemptionCount,
      });
      if (!couponEvaluation.eligible) {
        throw new ConflictAppError({ code: 'CHECKOUT_COUPON_INVALID' });
      }
    }
    const discountMinor = couponEvaluation?.effect?.discountMinor ?? 0n;
    const discountAllocation = allocateProportionalDiscount(
      priced.map((line) => ({
        id: line.id,
        subtotalMinor: line.subtotalMinor,
        eligible: couponEvaluation?.eligibleLineIds.includes(line.id) ?? false,
      })),
      discountMinor,
    );
    const allocationByLine = new Map(
      discountAllocation.lines.map((allocation) => [allocation.id, allocation]),
    );
    const lines = priced.map((line) => {
      const allocation = allocationByLine.get(line.id);
      if (allocation === undefined) throw new Error('Checkout discount allocation is incomplete.');
      return {
        id: line.id,
        variantId: line.variantId,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        subtotalMinor: line.subtotalMinor,
        discountMinor: allocation.discountMinor,
        lineTotalMinor: allocation.finalTotalMinor,
      };
    });
    const tax = calculateTax({
      taxableAmountMinor: discountAllocation.finalMerchandiseTotalMinor,
      rate: resolveTaxRate({
        rates: await this.repository.listTaxRates(input.transaction),
        jurisdiction: input.jurisdiction,
      }),
    });
    return {
      currency: input.currency,
      lines,
      subtotalMinor,
      discountTotalMinor: discountAllocation.discountMinor,
      merchandiseTotalMinor: discountAllocation.finalMerchandiseTotalMinor,
      coupon,
      couponEvaluation,
      discountAllocation,
      tax,
    };
  }

  async redeemCheckoutCoupon(
    input: Readonly<{
      coupon: CouponRecord | null;
      userId: string | null;
      orderId: string;
      amountMinor: bigint;
      actorUserId: string | null;
      transaction: TransactionContext;
    }>,
  ): Promise<void> {
    if (input.coupon === null) return;
    try {
      await this.repository.redeemCoupon(
        {
          couponId: input.coupon.id,
          userId: input.userId,
          orderId: input.orderId,
          amountMinor: input.amountMinor,
          actorUserId: input.actorUserId,
        },
        input.transaction,
      );
    } catch (error) {
      if (error instanceof ConflictAppError || error instanceof ValidationAppError) throw error;
      throw new ConflictAppError({ code: 'CHECKOUT_COUPON_REDEMPTION_FAILED' });
    }
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
