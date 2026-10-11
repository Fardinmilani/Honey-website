import {
  ConflictAppError,
  ForbiddenAppError,
  NotFoundAppError,
  ValidationAppError,
} from '../../../errors/index.js';
import {
  adminIdentifier,
  adminPageInput,
  type AdminPageInput,
} from '../../../platform/domain/admin-page.js';
import type { TransactionRunner } from '../../../platform/domain/transaction.js';
import type {
  AuditWriterPort,
  AuthenticatedPrincipal,
  PermissionCode,
  RequestMetadata,
} from '../../identity/index.js';
import type {
  AdminCouponQuery,
  AdminPriceQuery,
  AdminPricingRepository,
} from '../domain/admin-pricing.js';
import {
  COUPON_STATUSES,
  validateTaxRate,
  type CouponRecord,
  type TaxRateRecord,
} from '../domain/pricing.js';
function authorize(principal: AuthenticatedPrincipal, permission: PermissionCode) {
  if (principal.kind !== 'STAFF' || !principal.permissions.includes(permission))
    throw new ForbiddenAppError();
}
export class AdminPricingService {
  constructor(
    private readonly repository: AdminPricingRepository,
    private readonly audit: AuditWriterPort,
    private readonly transactions: TransactionRunner,
  ) {}
  prices(principal: AuthenticatedPrincipal, query: AdminPriceQuery) {
    authorize(principal, 'pricing:read');
    if (query.variantId !== undefined) adminIdentifier(query.variantId, 'variantId');
    return this.repository.prices({ ...query, ...adminPageInput(query) });
  }
  coupons(principal: AuthenticatedPrincipal, query: AdminCouponQuery) {
    authorize(principal, 'pricing:read');
    return this.repository.coupons({ ...query, ...adminPageInput(query) });
  }
  taxes(principal: AuthenticatedPrincipal, query: AdminPageInput) {
    authorize(principal, 'pricing:read');
    return this.repository.taxes(adminPageInput(query));
  }
  async setCouponStatus(
    principal: AuthenticatedPrincipal,
    id: string,
    expectedStatus: CouponRecord['status'],
    status: CouponRecord['status'],
    metadata: RequestMetadata,
  ) {
    authorize(principal, 'pricing:write');
    adminIdentifier(id);
    if (!COUPON_STATUSES.includes(status) || !COUPON_STATUSES.includes(expectedStatus))
      throw new ValidationAppError([{ path: 'status', code: 'PRICING_COUPON_INVALID' }]);
    return this.transactions.run(async (transaction) => {
      if (
        !(await this.repository.setCouponStatus(
          id,
          expectedStatus,
          status,
          principal.userId,
          transaction,
        ))
      )
        throw new ConflictAppError({ code: 'COUPON_STATUS_CHANGED' });
      await this.audit.appendAudit(
        {
          actorUserId: principal.userId,
          action: 'pricing.coupon.status_changed',
          subjectType: 'coupon',
          subjectId: id,
          before: { status: expectedStatus },
          after: { status },
          metadata,
        },
        transaction,
      );
      return { id, status };
    });
  }
  async updateTax(
    principal: AuthenticatedPrincipal,
    input: TaxRateRecord,
    metadata: RequestMetadata,
  ) {
    authorize(principal, 'pricing:write');
    adminIdentifier(input.id);
    let rate: TaxRateRecord;
    try {
      rate = validateTaxRate(input);
    } catch {
      throw new ValidationAppError([{ path: 'taxRate', code: 'PRICING_TAX_RATE_INVALID' }]);
    }
    return this.transactions.run(async (transaction) => {
      const before = await this.repository.updateTax(rate, principal.userId, transaction);
      if (before === null) throw new NotFoundAppError();
      await this.audit.appendAudit(
        {
          actorUserId: principal.userId,
          action: 'pricing.tax_rate.updated',
          subjectType: 'tax_rate',
          subjectId: rate.id,
          before: { ...before },
          after: { ...rate },
          metadata,
        },
        transaction,
      );
      return rate;
    });
  }
}
