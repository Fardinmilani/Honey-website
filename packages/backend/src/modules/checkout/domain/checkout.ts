import type { JsonValue } from '../../../errors/index.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';

/**
 * Domain-owned JSON shape for the checkout pricing snapshot. Deliberately not
 * `Prisma.JsonValue` / `Prisma.InputJsonObject` — domain code must stay
 * persistence-independent (docs/module-boundaries.md §1). Infrastructure
 * translates to and from the Prisma JSON types at the repository boundary.
 */
export type CheckoutJsonObject = Readonly<Record<string, JsonValue>>;

export type CheckoutOwner =
  | Readonly<{ userId: string; anonymousId?: never }>
  | Readonly<{ userId?: never; anonymousId: string }>;

export type CheckoutAddressInput = Readonly<{
  fullName: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  postalCode: string;
  line1: string;
  line2: string | null;
}>;

export type StartCheckoutInput = Readonly<{
  email: string;
  phone: string | null;
  shippingAddress: CheckoutAddressInput;
  billingAddress: CheckoutAddressInput | null;
  sameAsShipping: boolean;
}>;

export type CheckoutAddress = CheckoutAddressInput & Readonly<{ id: string }>;

export type CheckoutSessionRecord = Readonly<{
  id: string;
  cartId: string;
  userId: string | null;
  email: string;
  phone: string | null;
  shippingAddress: CheckoutAddress | null;
  billingAddress: CheckoutAddress | null;
  sameAsShipping: boolean;
  shippingMethodCode: string | null;
  shippingQuoteId: string | null;
  status: 'OPEN' | 'AWAITING_PAYMENT' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  reservationExpiresAt: Date | null;
  pricingSnapshot: JsonValue | null;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}>;

export type CheckoutIdempotencyClaim = Readonly<{
  requestHash: string;
  completedOrderNumber: string | null;
}>;

export interface CheckoutRepository {
  findOwnedSession(
    id: string,
    owner: CheckoutOwner,
    transaction?: TransactionContext,
  ): Promise<CheckoutSessionRecord | null>;
  lockOwnedSession(
    id: string,
    owner: CheckoutOwner,
    transaction: TransactionContext,
  ): Promise<CheckoutSessionRecord | null>;
  findOwnedByInitiationKey(
    idempotencyKey: string,
    owner: CheckoutOwner,
    transaction: TransactionContext,
  ): Promise<CheckoutSessionRecord | null>;
  createSession(
    input: Readonly<{
      id: string;
      cartId: string;
      userId: string | null;
      idempotencyKey: string;
      contact: StartCheckoutInput;
      reservationExpiresAt: Date;
      pricingSnapshot: CheckoutJsonObject;
      actorUserId: string | null;
      requestId: string;
      clientIp: string | null;
    }>,
    transaction: TransactionContext,
  ): Promise<CheckoutSessionRecord>;
  updatePricingSnapshot(
    id: string,
    input: Readonly<{
      reservationExpiresAt: Date;
      pricingSnapshot: CheckoutJsonObject;
      actorUserId: string | null;
    }>,
    transaction: TransactionContext,
  ): Promise<CheckoutSessionRecord>;
  /**
   * Persists a reservation-hold extension. Unlike `updatePricingSnapshot`,
   * this never touches the pricing snapshot — extension is purely a stock
   * -hold lifecycle event (domain-model.md §7), not a re-price.
   */
  extendReservationExpiry(
    id: string,
    input: Readonly<{ reservationExpiresAt: Date; actorUserId: string | null }>,
    transaction: TransactionContext,
  ): Promise<CheckoutSessionRecord>;
  markAwaitingPayment(
    id: string,
    actorUserId: string | null,
    completedAt: Date,
    transaction: TransactionContext,
  ): Promise<void>;
  markExpired(
    id: string,
    actorUserId: string | null,
    transaction: TransactionContext,
  ): Promise<void>;
  claimConfirmationIdempotency(
    input: Readonly<{
      key: string;
      scope: string;
      userId: string | null;
      requestHash: string;
      expiresAt: Date;
    }>,
    transaction: TransactionContext,
  ): Promise<CheckoutIdempotencyClaim | null>;
  completeConfirmationIdempotency(
    input: Readonly<{ key: string; scope: string; orderNumber: string }>,
    transaction: TransactionContext,
  ): Promise<void>;
  close(): Promise<void>;
}
