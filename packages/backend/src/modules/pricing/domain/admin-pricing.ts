import type { AdminPage, AdminPageInput } from '../../../platform/domain/admin-page.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import type { CouponRecord, TaxRateRecord, VariantPriceRecord } from './pricing.js';
export type AdminPriceQuery = AdminPageInput & Readonly<{ variantId?: string }>;
export type AdminCouponQuery = AdminPageInput & Readonly<{ status?: CouponRecord['status'] }>;
export interface AdminPricingRepository {
  prices(query: AdminPriceQuery): Promise<AdminPage<VariantPriceRecord>>;
  coupons(query: AdminCouponQuery): Promise<AdminPage<CouponRecord>>;
  taxes(query: AdminPageInput): Promise<AdminPage<TaxRateRecord>>;
  setCouponStatus(
    id: string,
    expectedStatus: CouponRecord['status'],
    status: CouponRecord['status'],
    actor: string,
    transaction: TransactionContext,
  ): Promise<boolean>;
  updateTax(
    input: TaxRateRecord,
    actor: string,
    transaction: TransactionContext,
  ): Promise<TaxRateRecord | null>;
  close(): Promise<void>;
}
