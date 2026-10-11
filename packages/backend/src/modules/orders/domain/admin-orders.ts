import type { AdminPage, AdminPageInput } from '../../../platform/domain/admin-page.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import type { JsonValue } from '../../../errors/index.js';
import type { CustomerOrder } from './orders.js';

export type AdminOrderQuery = AdminPageInput &
  Readonly<{
    q?: string;
    status?: CustomerOrder['status'];
    paymentStatus?: CustomerOrder['paymentStatus'];
    fulfilmentStatus?: CustomerOrder['fulfilmentStatus'];
    customerId?: string;
  }>;
export type AdminOrderSummary = Readonly<{
  id: string;
  number: string;
  email: string;
  currency: string;
  status: CustomerOrder['status'];
  paymentStatus: CustomerOrder['paymentStatus'];
  fulfilmentStatus: CustomerOrder['fulfilmentStatus'];
  grandTotalMinor: string;
  placedAt: string;
}>;
export type AdminOrderNote = Readonly<{
  id: string;
  body: string;
  actorUserId: string | null;
  createdAt: string;
}>;
export type AdminOrderDetail = AdminOrderSummary &
  Readonly<{
    customerId: string | null;
    phone: string | null;
    localeAtPurchase: string;
    subtotalMinor: string;
    discountTotalMinor: string;
    taxTotalMinor: string;
    shippingTotalMinor: string;
    refundedTotalMinor: string;
    shippingAddress: JsonValue;
    billingAddress: JsonValue;
    shippingMethod: JsonValue;
    lines: readonly Readonly<{
      id: string;
      sku: string;
      productName: JsonValue;
      variantName: JsonValue;
      quantity: number;
      unitPriceMinor: string;
      discountMinor: string;
      taxMinor: string;
      totalMinor: string;
    }>[];
    history: readonly Readonly<{
      id: string;
      fromStatus: string | null;
      toStatus: string;
      createdAt: string;
    }>[];
  }>;
export interface AdminOrdersRepository {
  list(query: AdminOrderQuery): Promise<AdminPage<AdminOrderSummary>>;
  detail(id: string): Promise<AdminOrderDetail | null>;
  notes(id: string, query: AdminPageInput): Promise<AdminPage<AdminOrderNote>>;
  addNote(
    orderId: string,
    body: string,
    actorUserId: string,
    transaction: TransactionContext,
  ): Promise<AdminOrderNote | null>;
  close(): Promise<void>;
}
