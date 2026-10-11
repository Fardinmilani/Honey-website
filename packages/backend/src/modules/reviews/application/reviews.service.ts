import {
  ConflictAppError,
  ForbiddenAppError,
  NotFoundAppError,
  ValidationAppError,
} from '../../../errors/index.js';
import { editorialText } from '../../../policy/editorial-text.js';
import { adminIdentifier, adminPageInput } from '../../../platform/domain/admin-page.js';
import type { AdminPageInput } from '../../../platform/domain/admin-page.js';
import type { TransactionRunner } from '../../../platform/domain/transaction.js';
import type { AuthenticatedPrincipal, RequestMetadata } from '../../identity/index.js';
import type { ReviewPurchaseService } from '../../orders/index.js';
import type { FulfilmentService } from '../../fulfilment/index.js';
import type { CatalogService } from '../../catalog/index.js';
import type { ReviewInput, ReviewsRepository } from '../domain/reviews.js';
function customer(principal: AuthenticatedPrincipal) {
  if (principal.kind !== 'CUSTOMER' || !principal.permissions.includes('review:submit'))
    throw new ForbiddenAppError({ code: 'CUSTOMER_REQUIRED' });
}
export class ReviewsService {
  constructor(
    private readonly repository: ReviewsRepository,
    private readonly purchases: ReviewPurchaseService,
    private readonly delivery: Pick<FulfilmentService, 'verifyReviewDelivery'>,
    private readonly catalog: Pick<CatalogService, 'publicReviewContext'>,
    private readonly transactions: TransactionRunner,
    private readonly locales: readonly string[],
  ) {}
  async eligibility(principal: AuthenticatedPrincipal, productId: string) {
    customer(principal);
    adminIdentifier(productId);
    if (!(await this.catalog.publicReviewContext(productId)).published) return { eligible: false };
    if (await this.repository.existing(principal.userId, productId)) return { eligible: false };
    return {
      eligible:
        (await this.purchases.eligible(principal.userId, productId, this.delivery)) !== null,
    };
  }
  async submit(principal: AuthenticatedPrincipal, input: ReviewInput) {
    customer(principal);
    adminIdentifier(input.productId);
    if (input.orderId !== undefined) adminIdentifier(input.orderId);
    if (!(await this.catalog.publicReviewContext(input.productId)).published)
      throw new NotFoundAppError();
    if (
      !this.locales.includes(input.locale) ||
      !Number.isInteger(input.rating) ||
      input.rating < 1 ||
      input.rating > 5
    )
      throw new ValidationAppError([{ path: 'rating', code: 'REVIEW_INVALID' }]);
    const title = editorialText(input.title, 160, 'title');
    const body = editorialText(input.body, 5000, 'body');
    // Customer text remains plain text and immutable. Prohibited claims can be
    // held for rejection; approval enforces the deterministic publication rule.
    return this.transactions.run(async (transaction) => {
      const orderId = await this.purchases.eligible(
        principal.userId,
        input.productId,
        this.delivery,
        input.orderId,
        transaction,
      );
      if (orderId === null) throw new ForbiddenAppError({ code: 'REVIEW_PURCHASE_INELIGIBLE' });
      return this.repository.submit(
        principal.userId,
        orderId,
        { ...input, title, body },
        transaction,
      );
    });
  }
  async publicPage(productId: string, page: AdminPageInput) {
    adminIdentifier(productId);
    if (!(await this.catalog.publicReviewContext(productId)).published)
      throw new NotFoundAppError();
    return this.repository.publicPage(productId, adminPageInput(page));
  }
  async pending(principal: AuthenticatedPrincipal, page: AdminPageInput) {
    this.staff(principal);
    const rows = await this.repository.pending(adminPageInput(page));
    const items = await Promise.all(
      rows.items.map(async (row) => ({
        ...row,
        verifiedPurchase: true as const,
        productNames: (await this.catalog.publicReviewContext(row.productId)).names,
      })),
    );
    return { ...rows, items };
  }
  moderate(
    principal: AuthenticatedPrincipal,
    id: string,
    status: 'APPROVED' | 'REJECTED',
    metadata: RequestMetadata,
  ) {
    this.staff(principal);
    adminIdentifier(id);
    if (status !== 'APPROVED' && status !== 'REJECTED') throw new ConflictAppError();
    return this.repository.moderate(id, status, principal.userId, metadata);
  }
  private staff(principal: AuthenticatedPrincipal) {
    if (principal.kind !== 'STAFF' || !principal.permissions.includes('review:moderate'))
      throw new ForbiddenAppError();
  }
}
