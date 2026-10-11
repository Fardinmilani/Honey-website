import type { AdminPage, AdminPageInput } from '../../../platform/domain/admin-page.js';
export type AdminRefund = Readonly<{
  id: string;
  amountMinor: string;
  reason: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
}>;
export type AdminPaymentRow = Readonly<{
  id: string;
  orderId: string;
  provider: string;
  status: string;
  currency: string;
  amountMinor: string;
  remainingRefundableMinor: string;
  refunds: readonly AdminRefund[];
  createdAt: string;
  paidAt: string | null;
}>;
export type AdminPayment = AdminPaymentRow &
  Readonly<{ canRefund: boolean; partialRefund: boolean }>;
export interface AdminPaymentsRepository {
  list(orderId: string, query: AdminPageInput): Promise<AdminPage<AdminPaymentRow>>;
  close(): Promise<void>;
}
