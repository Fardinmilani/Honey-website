import type { TransactionContext } from '../../../platform/domain/transaction.js';
export interface ReviewPurchaseRepository {
  candidate(
    userId: string,
    productId: string,
    orderId: string | undefined,
    cursor: string | undefined,
    transaction?: TransactionContext,
  ): Promise<Readonly<{
    id: string;
    lines: readonly Readonly<{ id: string; quantity: number }>[];
  }> | null>;
}
export interface ReviewDeliveryPort {
  verifyReviewDelivery(
    orderId: string,
    lines: readonly Readonly<{ id: string; quantity: number }>[],
    transaction?: TransactionContext,
  ): Promise<boolean>;
}
