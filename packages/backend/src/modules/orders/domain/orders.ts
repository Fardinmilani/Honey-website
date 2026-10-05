import type { JsonValue } from '../../../errors/index.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';

/**
 * Domain-owned JSON shape for order snapshots. Deliberately not
 * `Prisma.JsonValue` / `Prisma.InputJsonObject` — domain code must stay
 * persistence-independent (docs/module-boundaries.md §1). Infrastructure
 * translates to and from the Prisma JSON types at the repository boundary.
 */
export type OrderJsonObject = Readonly<Record<string, JsonValue>>;

export type OrderOwner =
  | Readonly<{ userId: string; anonymousId?: never }>
  | Readonly<{ userId?: never; anonymousId: string }>;

export type OrderLineSnapshotInput = Readonly<{
  productId: string | null;
  variantId: string | null;
  skuSnapshot: string;
  productNameSnapshot: OrderJsonObject;
  variantNameSnapshot: OrderJsonObject;
  attributesSnapshot: OrderJsonObject;
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
  shippingMethodSnapshot: OrderJsonObject;
  shippingAddressSnapshot: OrderJsonObject;
  billingAddressSnapshot: OrderJsonObject;
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
  productNameSnapshot: JsonValue;
  variantNameSnapshot: JsonValue;
  skuSnapshot: string;
  imageUrlSnapshot: string | null;
  quantity: number;
  unitPriceMinor: bigint;
  discountAllocatedMinor: bigint;
  taxRateBps: number;
  taxAmountMinor: bigint;
  lineTotalMinor: bigint;
}>;

export type CustomerShipment = Readonly<{
  id: string;
  status: 'PENDING' | 'LABEL_CREATED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'RETURNED';
  provider: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  lines: readonly Readonly<{ quantity: number }>[];
}>;

export type FulfilmentOrderLine = Readonly<{
  id: string;
  variantId: string | null;
  quantity: number;
}>;

export type FulfilmentOrder = Readonly<{
  id: string;
  number: string;
  email: string;
  localeAtPurchase: string;
  status: CustomerOrder['status'];
  paymentStatus: CustomerOrder['paymentStatus'];
  fulfilmentStatus: CustomerOrder['fulfilmentStatus'];
  lines: readonly FulfilmentOrderLine[];
}>;

export type CustomerOrder = Readonly<{
  number: string;
  email: string;
  phone: string | null;
  localeAtPurchase: string;
  currency: string;
  status:
    | 'PENDING_PAYMENT'
    | 'PAID'
    | 'PROCESSING'
    | 'PARTIALLY_FULFILLED'
    | 'FULFILLED'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'REFUNDED'
    | 'PARTIALLY_REFUNDED'
    | 'FAILED';
  paymentStatus: 'UNPAID' | 'AUTHORIZED' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED';
  fulfilmentStatus: 'UNFULFILLED' | 'PARTIAL' | 'FULFILLED';
  subtotalMinor: bigint;
  discountTotalMinor: bigint;
  shippingTotalMinor: bigint;
  taxTotalMinor: bigint;
  grandTotalMinor: bigint;
  couponCodeSnapshot: string | null;
  shippingMethodSnapshot: JsonValue;
  shippingAddressSnapshot: JsonValue;
  billingAddressSnapshot: JsonValue;
  placedAt: Date;
  lines: readonly CustomerOrderLine[];
  shipments: readonly CustomerShipment[];
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
  lockForFulfilment(
    orderId: string,
    transaction: TransactionContext,
  ): Promise<FulfilmentOrder | null>;
  updateFulfilmentState(
    order: FulfilmentOrder,
    fulfilmentStatus: 'PARTIAL' | 'FULFILLED',
    actorUserId: string,
    transaction: TransactionContext,
  ): Promise<void>;
  cancelBeforeShipment(
    order: FulfilmentOrder,
    actorUserId: string,
    transaction: TransactionContext,
  ): Promise<void>;
  close(): Promise<void>;
}
