import {
  allocateProportionalDiscount,
  calculateTax,
  type CouponLine,
  type DiscountAllocationLine,
} from '../../pricing/index.js';
import type { PricingService } from '../../pricing/index.js';
import type { CartCouponEvaluation, CartPricingPort } from '../domain/cart.js';

export class PricingCartAdapter implements CartPricingPort {
  constructor(private readonly pricing: PricingService) {}

  resolvePrices(variantIds: readonly string[], currency: string, now: Date) {
    return this.pricing.resolvePrices(variantIds, currency, now);
  }

  async evaluateCoupon(
    code: string,
    currency: string,
    now: Date,
    cartSubtotalMinor: bigint,
    lines: readonly CouponLine[],
    userId: string | null,
  ): Promise<CartCouponEvaluation> {
    const result = await this.pricing.evaluateCoupon(
      code,
      currency,
      now,
      cartSubtotalMinor,
      lines,
      userId,
    );
    return { coupon: result.coupon, couponEvaluation: result.evaluation };
  }

  allocateDiscount(lines: readonly DiscountAllocationLine[], discountMinor: bigint) {
    return allocateProportionalDiscount(lines, discountMinor);
  }

  unresolvedTax(taxableAmountMinor: bigint) {
    return calculateTax({ taxableAmountMinor, rate: null });
  }
}
