import { createPrismaClient, type PrismaClient } from '@honey/db';
import {
  adminPage,
  type AdminPage,
  type AdminPageInput,
} from '../../../platform/domain/admin-page.js';
import type { AdminPaymentRow, AdminPaymentsRepository } from '../domain/admin-payments.js';
export class PrismaAdminPaymentsRepository implements AdminPaymentsRepository {
  private readonly client: PrismaClient;
  constructor(databaseUrl: string) {
    this.client = createPrismaClient({ databaseUrl });
  }
  async list(orderId: string, query: AdminPageInput): Promise<AdminPage<AdminPaymentRow>> {
    const rows = await this.client.payment.findMany({
      where: { orderId, ...(query.cursor === undefined ? {} : { id: { lt: query.cursor } }) },
      orderBy: { id: 'desc' },
      take: (query.limit ?? 25) + 1,
      select: {
        id: true,
        orderId: true,
        provider: true,
        status: true,
        currency: true,
        amountMinor: true,
        createdAt: true,
        paidAt: true,
        refunds: {
          take: 100,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            amountMinor: true,
            reason: true,
            status: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });
    const items = await Promise.all(
      rows.map(async (row): Promise<AdminPaymentRow> => {
        const claimed = await this.client.refund.aggregate({
          where: { paymentId: row.id, status: { in: ['REQUESTED', 'PENDING', 'COMPLETED'] } },
          _sum: { amountMinor: true },
        });
        const remaining = row.amountMinor - (claimed._sum.amountMinor ?? 0n);
        return {
          id: row.id,
          orderId: row.orderId,
          provider: row.provider,
          status: row.status,
          currency: row.currency,
          amountMinor: row.amountMinor.toString(),
          remainingRefundableMinor: (remaining > 0n ? remaining : 0n).toString(),
          createdAt: row.createdAt.toISOString(),
          paidAt: row.paidAt?.toISOString() ?? null,
          refunds: row.refunds.map((refund) => ({
            ...refund,
            amountMinor: refund.amountMinor.toString(),
            createdAt: refund.createdAt.toISOString(),
            completedAt: refund.completedAt?.toISOString() ?? null,
          })),
        };
      }),
    );
    return adminPage(items, query.limit ?? 25);
  }
  close(): Promise<void> {
    return this.client.$disconnect();
  }
}
