import { createPrismaClient } from '@honey/db';
import {
  adminPage,
  adminPageInput,
  type AdminPageInput,
} from '../../../platform/domain/admin-page.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import { asPrismaTransaction } from '../../../platform/infrastructure/prisma-platform.adapter.js';
import type {
  AdminCouponQuery,
  AdminPriceQuery,
  AdminPricingRepository,
} from '../domain/admin-pricing.js';
import type { CouponRecord, TaxRateRecord } from '../domain/pricing.js';
import { mapCoupon, mapPrice, mapTaxRate } from './prisma-pricing.repository.js';
export class PrismaAdminPricingRepository implements AdminPricingRepository {
  readonly #client;
  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }
  async prices(query: AdminPriceQuery) {
    const page = adminPageInput(query);
    const rows = await this.#client.variantPrice.findMany({
      where: {
        ...(page.cursor === undefined ? {} : { id: { lt: page.cursor } }),
        ...(query.variantId === undefined ? {} : { variantId: query.variantId }),
      },
      orderBy: { id: 'desc' },
      take: page.limit + 1,
    });
    return adminPage(rows.map(mapPrice), page.limit);
  }
  async coupons(query: AdminCouponQuery) {
    const page = adminPageInput(query);
    const rows = await this.#client.coupon.findMany({
      where: {
        ...(page.cursor === undefined ? {} : { id: { lt: page.cursor } }),
        ...(query.status === undefined ? {} : { status: query.status }),
      },
      orderBy: { id: 'desc' },
      take: page.limit + 1,
    });
    return adminPage(rows.map(mapCoupon), page.limit);
  }
  async taxes(query: AdminPageInput) {
    const page = adminPageInput(query);
    const rows = await this.#client.taxRate.findMany({
      where: page.cursor === undefined ? {} : { id: { lt: page.cursor } },
      orderBy: { id: 'desc' },
      take: page.limit + 1,
    });
    return adminPage(rows.map(mapTaxRate), page.limit);
  }
  async setCouponStatus(
    id: string,
    expectedStatus: CouponRecord['status'],
    status: CouponRecord['status'],
    actor: string,
    transaction: TransactionContext,
  ) {
    const changed = await asPrismaTransaction(transaction).coupon.updateMany({
      where: { id, status: expectedStatus },
      data: { status, updatedBy: actor },
    });
    return changed.count === 1;
  }
  async updateTax(input: TaxRateRecord, actor: string, transaction: TransactionContext) {
    const client = asPrismaTransaction(transaction);
    await client.$queryRaw`SELECT id FROM tax_rate WHERE id = ${input.id}::uuid FOR UPDATE`;
    const previous = await client.taxRate.findUnique({ where: { id: input.id } });
    if (previous === null) return null;
    await client.taxRate.updateMany({
      where: { id: input.id },
      data: {
        code: input.code,
        name: input.code,
        country: input.country,
        region: input.region,
        rateBps: input.rateBps,
        isInclusive: input.isInclusive,
        isActive: input.isActive,
        updatedBy: actor,
      },
    });
    return mapTaxRate(previous);
  }
  close() {
    return this.#client.$disconnect();
  }
}
