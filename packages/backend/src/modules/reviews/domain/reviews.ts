import type { TransactionContext } from '../../../platform/domain/transaction.js';
import type { AdminPage, AdminPageInput } from '../../../platform/domain/admin-page.js';
import type { RequestMetadata } from '../../identity/index.js';
export type ReviewInput = Readonly<{
  productId: string;
  orderId?: string;
  rating: number;
  title: string;
  body: string;
  locale: string;
}>;
export type ReviewRecord = Readonly<{
  id: string;
  productId: string;
  rating: number;
  title: string;
  body: string;
  locale: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}>;
export type PublicReview = Omit<ReviewRecord, 'status'> & Readonly<{ verifiedPurchase: true }>;
export type ReviewAggregate = Readonly<{ count: number; average: number }>;
export interface ReviewsRepository {
  existing(userId: string, productId: string): Promise<boolean>;
  submit(
    userId: string,
    orderId: string,
    input: ReviewInput,
    transaction: TransactionContext,
  ): Promise<ReviewRecord>;
  pending(page: AdminPageInput): Promise<AdminPage<ReviewRecord>>;
  publicPage(
    productId: string,
    page: AdminPageInput,
  ): Promise<AdminPage<PublicReview> & Readonly<{ aggregate: ReviewAggregate | null }>>;
  moderate(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    actorUserId: string,
    metadata: RequestMetadata,
  ): Promise<ReviewRecord>;
  close(): Promise<void>;
}
