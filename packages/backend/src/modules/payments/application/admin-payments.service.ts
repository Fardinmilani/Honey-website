import { ForbiddenAppError } from '../../../errors/index.js';
import {
  adminIdentifier,
  adminPageInput,
  type AdminPageInput,
  type AdminPage,
} from '../../../platform/domain/admin-page.js';
import type { AuthenticatedPrincipal } from '../../identity/index.js';
import type { PaymentProvider } from '../domain/payments.js';
import type { AdminPayment, AdminPaymentsRepository } from '../domain/admin-payments.js';
export class AdminPaymentsService {
  constructor(
    private readonly repository: AdminPaymentsRepository,
    private readonly providers: ReadonlyMap<string, PaymentProvider>,
  ) {}
  async list(
    principal: AuthenticatedPrincipal,
    orderId: string,
    query: AdminPageInput,
  ): Promise<AdminPage<AdminPayment>> {
    if (principal.kind !== 'STAFF' || !principal.permissions.includes('order:read'))
      throw new ForbiddenAppError();
    const page = await this.repository.list(
      adminIdentifier(orderId, 'orderId'),
      adminPageInput(query),
    );
    return {
      ...page,
      items: page.items.map((payment) => {
        const capabilities = this.providers.get(payment.provider)?.capabilities;
        const remaining = BigInt(payment.remainingRefundableMinor);
        return {
          ...payment,
          partialRefund: capabilities?.partialRefund === true,
          canRefund:
            capabilities?.refund === true &&
            ['PAID', 'PARTIALLY_REFUNDED'].includes(payment.status) &&
            remaining > 0n &&
            (capabilities.partialRefund || remaining === BigInt(payment.amountMinor)),
        };
      }),
    };
  }
}
