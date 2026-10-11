import { adminIdentifier } from '../../../platform/domain/admin-page.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import type { ReviewPurchaseRepository, ReviewDeliveryPort } from '../domain/review-purchase.js';
/** Only Orders decides ownership, delivered quantities, cancellation and refund qualification. */
export class ReviewPurchaseService {
  constructor(private readonly repository: ReviewPurchaseRepository) {}
  async eligible(
    userId: string,
    productId: string,
    delivery: ReviewDeliveryPort,
    orderId?: string,
    transaction?: TransactionContext,
  ) {
    adminIdentifier(userId);
    adminIdentifier(productId);
    if (orderId !== undefined) adminIdentifier(orderId);
    let cursor: string | undefined;
    while (true) {
      const candidate = await this.repository.candidate(
        userId,
        productId,
        orderId,
        cursor,
        transaction,
      );
      if (candidate === null) return null;
      if (await delivery.verifyReviewDelivery(candidate.id, candidate.lines, transaction))
        return candidate.id;
      if (orderId !== undefined) return null;
      cursor = candidate.id;
    }
  }
}
