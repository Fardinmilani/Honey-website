import type { CouponRecord, TaxRateRecord, VariantPriceRecord } from './pricing.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';

export type PricingAuditActor = Readonly<{
  actorUserId: string;
  requestId: string;
  clientIp?: string;
}>;

export interface PricingRepository {
  existingVariantIds(
    variantIds: readonly string[],
    transaction?: TransactionContext,
  ): Promise<ReadonlySet<string>>;
  pricesForVariants(
    variantIds: readonly string[],
    currency: string,
    transaction?: TransactionContext,
  ): Promise<readonly VariantPriceRecord[]>;
  listVariantPrices(variantId?: string): Promise<readonly VariantPriceRecord[]>;
  findCoupon(code: string, transaction?: TransactionContext): Promise<CouponRecord | null>;
  lockCoupon(code: string, transaction: TransactionContext): Promise<CouponRecord | null>;
  listCoupons(): Promise<readonly CouponRecord[]>;
  countCouponRedemptions(
    couponId: string,
    userId: string,
    transaction?: TransactionContext,
  ): Promise<number>;
  listTaxRates(transaction?: TransactionContext): Promise<readonly TaxRateRecord[]>;
  redeemCoupon(
    input: Readonly<{
      couponId: string;
      userId: string | null;
      orderId: string;
      amountMinor: bigint;
      actorUserId: string | null;
    }>,
    transaction: TransactionContext,
  ): Promise<void>;
  createVariantPrice(
    input: VariantPriceRecord,
    actor: PricingAuditActor,
  ): Promise<VariantPriceRecord>;
  createCoupon(input: CouponRecord, actor: PricingAuditActor): Promise<CouponRecord>;
  createTaxRate(input: TaxRateRecord, actor: PricingAuditActor): Promise<TaxRateRecord>;
  close(): Promise<void>;
}
