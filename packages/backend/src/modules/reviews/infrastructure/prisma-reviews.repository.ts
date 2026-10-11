import { randomUUID } from 'node:crypto';
import { createPrismaClient, type Prisma } from '@honey/db';
import { ConflictAppError, NotFoundAppError } from '../../../errors/index.js';
import { assertEditorialPublication } from '../../../policy/editorial-text.js';
import {
  adminPage,
  adminPageInput,
  type AdminPageInput,
} from '../../../platform/domain/admin-page.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import { asPrismaTransaction } from '../../../platform/infrastructure/prisma-platform.adapter.js';
import type { RequestMetadata } from '../../identity/index.js';
import type { ReviewInput, ReviewRecord, ReviewsRepository } from '../domain/reviews.js';
const select = {
  id: true,
  productId: true,
  rating: true,
  title: true,
  body: true,
  locale: true,
  status: true,
  createdAt: true,
} satisfies Prisma.ProductReviewSelect;
function project(row: Prisma.ProductReviewGetPayload<{ select: typeof select }>): ReviewRecord {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
function outbox(id: string, productId: string, action: string) {
  return {
    id: randomUUID(),
    aggregateType: 'review',
    aggregateId: id,
    eventType: `review.${action}`,
    payload: { reviewId: id, productId, version: 1 },
  };
}
export class PrismaReviewsRepository implements ReviewsRepository {
  readonly client;
  constructor(databaseUrl: string) {
    this.client = createPrismaClient({ databaseUrl });
  }
  async existing(userId: string, productId: string) {
    return (await this.client.productReview.count({ where: { userId, productId } })) > 0;
  }
  async submit(
    userId: string,
    orderId: string,
    input: ReviewInput,
    transaction: TransactionContext,
  ) {
    const tx = asPrismaTransaction(transaction);
    try {
      const row = await tx.productReview.create({
        data: {
          id: randomUUID(),
          userId,
          orderId,
          productId: input.productId,
          rating: input.rating,
          title: input.title,
          body: input.body,
          locale: input.locale,
        },
        select,
      });
      await tx.outboxEvent.create({ data: outbox(row.id, row.productId, 'submitted') });
      return project(row);
    } catch (error) {
      if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2002')
        throw new ConflictAppError({ code: 'REVIEW_ALREADY_SUBMITTED' });
      throw error;
    }
  }
  async pending(input: AdminPageInput) {
    const page = adminPageInput(input);
    const rows = await this.client.productReview.findMany({
      where: {
        status: 'PENDING',
        ...(page.cursor === undefined ? {} : { id: { lt: page.cursor } }),
      },
      orderBy: { id: 'desc' },
      take: page.limit + 1,
      select,
    });
    return adminPage(rows.map(project), page.limit);
  }
  async publicPage(productId: string, input: AdminPageInput) {
    const page = adminPageInput(input);
    // One repeatable-read snapshot keeps the visible list and its aggregate consistent.
    return this.client.$transaction(
      async (tx) => {
        const rows = await tx.productReview.findMany({
          where: {
            productId,
            status: 'APPROVED',
            ...(page.cursor === undefined ? {} : { id: { lt: page.cursor } }),
          },
          orderBy: { id: 'desc' },
          take: page.limit + 1,
          select,
        });
        const aggregate = await tx.productReview.aggregate({
          where: { productId, status: 'APPROVED' },
          _count: true,
          _avg: { rating: true },
        });
        const projected = rows.map((row) => ({
          id: row.id,
          productId: row.productId,
          rating: row.rating,
          title: row.title,
          body: row.body,
          locale: row.locale,
          createdAt: row.createdAt.toISOString(),
          verifiedPurchase: true as const,
        }));
        return {
          ...adminPage(projected, page.limit),
          aggregate:
            aggregate._count === 0 || aggregate._avg.rating === null
              ? null
              : { count: aggregate._count, average: aggregate._avg.rating },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async moderate(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    actorUserId: string,
    metadata: RequestMetadata,
  ) {
    return this.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM product_review WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.productReview.findUnique({ where: { id }, select });
      if (row === null) throw new NotFoundAppError();
      if (row.status !== 'PENDING')
        throw new ConflictAppError({ code: 'REVIEW_ALREADY_MODERATED' });
      if (status === 'APPROVED') assertEditorialPublication(`${row.title} ${row.body}`);
      const changed = await tx.productReview.update({
        where: { id },
        data: { status, moderatedBy: actorUserId, moderatedAt: new Date() },
        select,
      });
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          actorUserId,
          action: status === 'APPROVED' ? 'review.approved' : 'review.rejected',
          subjectType: 'review',
          subjectId: id,
          requestId: metadata.requestId,
          ip: metadata.clientIp ?? null,
          beforeJson: { status: 'PENDING' },
          afterJson: { status },
        },
      });
      await tx.outboxEvent.create({
        data: outbox(id, row.productId, status === 'APPROVED' ? 'approved' : 'rejected'),
      });
      return project(changed);
    });
  }
  close() {
    return this.client.$disconnect();
  }
}
