import type { Prisma } from '@honey/db';

import type { TransactionContext } from '../../../platform/domain/transaction.js';

export type OrderOwner =
  | Readonly<{ userId: string; anonymousId?: never }>
  | Readonly<{ userId?: never; anonymousId: string }>;

export type OrderLineSnapshotInput = Readonly<{
  productId: string | null;
  variantId: string | null;
  skuSnapshot: string;
  productNameSnapshot: Prisma.InputJsonObject;
  variantNameSnapshot: Prisma.InputJsonObject;
  attributesSnapshot: Prisma.InputJsonObject;
  imageUrlSnapshot: string | null;
  quantity: number;
  unitPriceMinor: bigint;
  discountAllocatedMinor: bigint;
  taxRateBps: number;
  taxAmountMinor: bigint;
  lineTotalMinor: bigint;
  harvestBatchCodeSnapshot: string | null;
}>;

export type CreatePendingOrderInput = Readonly<{
  checkoutSessionId: string;
  userId: string | null;
  email: string;
  phone: string | null;
  localeAtPurchase: string;
  currency: string;
  subtotalMinor: bigint;
  discountTotalMinor: bigint;
  shippingTotalMinor: bigint;
  taxTotalMinor: bigint;
  taxInclusive: boolean;
  grandTotalMinor: bigint;
  couponCodeSnapshot: string | null;
  shippingMethodSnapshot: Prisma.InputJsonObject;
  shippingAddressSnapshot: Prisma.InputJsonObject;
  billingAddressSnapshot: Prisma.InputJsonObject;
  placedAt: Date;
  actorUserId: string | null;
  lines: readonly OrderLineSnapshotInput[];
}>;

export type CreatedPendingOrder = Readonly<{
  id: string;
  number: string;
  checkoutSessionId: string;
  status: 'PENDING_PAYMENT';
  paymentStatus: 'UNPAID';
  fulfilmentStatus: 'UNFULFILLED';
  createdAt: Date;
}>;

export type CustomerOrderLine = Readonly<{
  productNameSnapshot: Prisma.JsonValue;
  variantNameSnapshot: Prisma.JsonValue;
  skuSnapshot: string;
  imageUrlSnapshot: string | null;
  quantity: number;
  unitPriceMinor: bigint;
  discountAllocatedMinor: bigint;
  taxRateBps: number;
  taxAmountMinor: bigint;
  lineTotalMinor: bigint;
}>;

export type CustomerOrder = Readonly<{
  number: string;
  email: string;
  phone: string | null;
  localeAtPurchase: string;
  currency: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'PROCESSING' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'FAILED';
  paymentStatus: 'UNPAID' | 'AUTHORIZED' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED';
  fulfilmentStatus: 'UNFULFILLED' | 'PARTIAL' | 'FULFILLED';
  subtotalMinor: bigint;
  discountTotalMinor: bigint;
  shippingTotalMinor: bigint;
  taxTotalMinor: bigint;
  grandTotalMinor: bigint;
  couponCodeSnapshot: string | null;
  shippingMethodSnapshot: Prisma.JsonValue;
  shippingAddressSnapshot: Prisma.JsonValue;
  billingAddressSnapshot: Prisma.JsonValue;
  placedAt: Date;
  lines: readonly CustomerOrderLine[];
}>;

export interface OrdersRepository {
  createPendingOrder(
    input: CreatePendingOrderInput,
    transaction: TransactionContext,
  ): Promise<CreatedPendingOrder>;
  findOwnedOrder(number: string, owner: OrderOwner): Promise<CustomerOrder | null>;
  listOrdersForUser(userId: string, limit: number): Promise<readonly CustomerOrder[]>;
  findByCheckoutSession(
    checkoutSessionId: string,
    transaction: TransactionContext,
  ): Promise<CreatedPendingOrder | null>;
  close(): Promise<void>;
}
