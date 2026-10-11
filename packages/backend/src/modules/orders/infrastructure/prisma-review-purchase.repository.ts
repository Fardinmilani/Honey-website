import { createPrismaClient } from '@honey/db';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import { asPrismaTransaction } from '../../../platform/infrastructure/prisma-platform.adapter.js';
import type { ReviewPurchaseRepository } from '../domain/review-purchase.js';
export class PrismaReviewPurchaseRepository implements ReviewPurchaseRepository {
  readonly client;
  constructor(databaseUrl: string) {
    this.client = createPrismaClient({ databaseUrl });
  }
  async candidate(
    userId: string,
    productId: string,
    orderId: string | undefined,
    cursor: string | undefined,
    transaction?: TransactionContext,
  ) {
    const tx = transaction === undefined ? this.client : asPrismaTransaction(transaction);
    // Lock the selected purchase before checking state. Refund/cancel/fulfilment
    // transitions use the same order lock, so submission observes one state.
    const candidate = await tx.order.findFirst({
      where: {
        userId,
        ...(orderId === undefined ? {} : { id: orderId }),
        ...(cursor === undefined ? {} : { id: { lt: cursor } }),
        status: { in: ['FULFILLED', 'COMPLETED'] },
        paymentStatus: 'PAID',
        refundedTotalMinor: 0n,
        lines: { some: { productId } },
      },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    if (candidate !== null) {
      if (transaction !== undefined)
        await tx.$queryRaw`SELECT id FROM "order" WHERE id = ${candidate.id}::uuid FOR UPDATE`;
      const row = await tx.order.findFirst({
        where: {
          id: candidate.id,
          userId,
          status: { in: ['FULFILLED', 'COMPLETED'] },
          paymentStatus: 'PAID',
          refundedTotalMinor: 0n,
          lines: { some: { productId } },
        },
        select: { id: true, lines: { select: { id: true, quantity: true } } },
      });
      return row;
    }
    return null;
  }
  close() {
    return this.client.$disconnect();
  }
}
