import type { CouponRecord, TaxRateRecord, VariantPriceRecord } from './pricing.js';

export type PricingAuditActor = Readonly<{
  actorUserId: string;
  requestId: string;
  clientIp?: string;
}>;

export interface PricingRepository {
  existingVariantIds(variantIds: readonly string[]): Promise<ReadonlySet<string>>;
  pricesForVariants(
    variantIds: readonly string[],
    currency: string,
  ): Promise<readonly VariantPriceRecord[]>;
  listVariantPrices(variantId?: string): Promise<readonly VariantPriceRecord[]>;
  findCoupon(code: string): Promise<CouponRecord | null>;
  listCoupons(): Promise<readonly CouponRecord[]>;
  countCouponRedemptions(couponId: string, userId: string): Promise<number>;
  listTaxRates(): Promise<readonly TaxRateRecord[]>;
  createVariantPrice(
    input: VariantPriceRecord,
    actor: PricingAuditActor,
  ): Promise<VariantPriceRecord>;
  createCoupon(input: CouponRecord, actor: PricingAuditActor): Promise<CouponRecord>;
  createTaxRate(input: TaxRateRecord, actor: PricingAuditActor): Promise<TaxRateRecord>;
  close(): Promise<void>;
}
