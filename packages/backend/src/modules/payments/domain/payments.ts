import type { JsonValue } from '../../../errors/index.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';

/**
 * Domain-owned JSON shape for redacted provider summaries. Deliberately not
 * `Prisma.JsonValue` / `Prisma.InputJsonObject` — domain code must stay
 * persistence-independent (docs/module-boundaries.md §1). Infrastructure
 * translates to and from the Prisma JSON types at the repository boundary.
 *
 * Every value stored here has already had card data, merchant secrets, and
 * signature material removed by the provider adapter — see
 * docs/payments-development.md "Redaction".
 */
export type PaymentJsonObject = Readonly<Record<string, JsonValue>>;

export type PaymentOwner =
  | Readonly<{ userId: string; anonymousId?: never }>
  | Readonly<{ userId?: never; anonymousId: string }>;

export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'AUTHORIZED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type PaymentAttemptStatus = 'CREATED' | 'SENT' | 'SUCCEEDED' | 'FAILED';
export type PaymentTransactionType = 'AUTHORIZE' | 'CAPTURE' | 'REFUND' | 'VOID' | 'CHARGEBACK';
/**
 * `STAFF_REFUND` is never produced by `applyPaymentOutcome` (a provider
 * outcome is never a refund assertion — see `PaymentOutcomeStatus` below);
 * it exists only as a `PaymentTransaction.source` tag for refunds, which
 * have no provider callback of their own.
 */
export type PaymentOutcomeSource =
  'VERIFIED_WEBHOOK' | 'VERIFIED_RETURN' | 'RECONCILIATION' | 'STAFF_REFUND';
export type RefundStatus = 'REQUESTED' | 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/**
 * The subset of `PaymentStatus` a provider outcome may ever assert.
 * `REFUNDED` / `PARTIALLY_REFUNDED` are reached only through the refund
 * application service, never through `applyPaymentOutcome` — a provider
 * "create/verify/status" outcome is never a refund assertion.
 */
export type PaymentOutcomeStatus =
  'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

/** Provider-neutral, already-normalized result of create/verify/status calls. */
export type PaymentOutcome = Readonly<{
  providerRef: string;
  status: PaymentOutcomeStatus;
  amountMinor: bigint;
  currency: string;
  /** Provider's own transaction/reference id for this specific settlement event, when it has one. */
  providerTxnRef: string | null;
  occurredAt: Date;
  source: PaymentOutcomeSource;
  /** Redacted, safe-to-store summary. Never card data, never a signing secret. */
  raw: PaymentJsonObject;
}>;

export type ProviderCapabilities = Readonly<{
  redirect: boolean;
  capture: boolean;
  refund: boolean;
  partialRefund: boolean;
  webhooks: boolean;
  verifyReturn: boolean;
}>;

export type CreatePaymentInput = Readonly<{
  paymentId: string;
  orderNumber: string;
  amountMinor: bigint;
  currency: string;
  description: string;
  callbackUrl: string;
  customerEmail: string | null;
  customerMobile: string | null;
}>;

export type CreatePaymentResult = Readonly<{
  providerRef: string;
  redirectUrl: string | null;
  raw: PaymentJsonObject;
}>;

/**
 * Everything a provider's `verifyReturn` needs is already known to our
 * server from the `Payment` record. The browser's return query string is
 * deliberately never threaded into this type — ADR-0022 §1: a return is a
 * signal to verify, never a source of truth.
 */
export type ProviderReturnInput = Readonly<{
  providerRef: string;
  amountMinor: bigint;
  currency: string;
}>;

export type CaptureInput = Readonly<{
  providerRef: string;
  amountMinor: bigint;
  currency: string;
}>;

export type RefundInput = Readonly<{
  providerRef: string;
  amountMinor: bigint;
  originalAmountMinor: bigint;
  currency: string;
}>;

export type RefundOutcome = Readonly<{
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  providerRefundRef: string | null;
  amountMinor: bigint;
  occurredAt: Date;
  raw: PaymentJsonObject;
}>;

export type RawWebhook = Readonly<{
  rawBody: Uint8Array;
  headers: Readonly<Record<string, string>>;
}>;

export type VerifiedWebhookEvent = Readonly<{
  eventId: string;
  type: string;
  outcome: PaymentOutcome;
}>;

export type GetStatusInput = Readonly<{
  providerRef: string;
  amountMinor: bigint;
  currency: string;
}>;

/**
 * Provider-neutral payment gateway port (ADR-0013, corrected by ADR-0022).
 * `getStatus` is mandatory for every adapter; every other capability is
 * declared honestly in `capabilities` and may be absent.
 */
export interface PaymentProvider {
  readonly code: string;
  readonly capabilities: ProviderCapabilities;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /**
   * Pure, synchronous reconstruction of the redirect URL for an
   * already-created payment, used only to resume a still-pending payment
   * without ever calling `createPayment` (which is non-idempotent) a second
   * time. Optional — a provider may not support resuming without issuing a
   * fresh authority.
   */
  redirectUrlFor?(providerRef: string): string | null;
  verifyReturn?(input: ProviderReturnInput): Promise<PaymentOutcome>;
  capture?(input: CaptureInput): Promise<PaymentOutcome>;
  refund(input: RefundInput): Promise<RefundOutcome>;
  parseWebhook?(raw: RawWebhook): Promise<VerifiedWebhookEvent>;
  getStatus(input: GetStatusInput): Promise<PaymentOutcome>;
}

export type PayableOrder = Readonly<{
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  currency: string;
  grandTotalMinor: bigint;
  refundedTotalMinor: bigint;
  email: string;
  phone: string | null;
  localeAtPurchase: string;
}>;

export type PaymentRecord = Readonly<{
  id: string;
  orderId: string;
  provider: string;
  status: PaymentStatus;
  amountMinor: bigint;
  currency: string;
  providerRef: string | null;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
  authorizedAt: Date | null;
  paidAt: Date | null;
  failedAt: Date | null;
  failureCode: string | null;
}>;

export type PaymentAttemptRecord = Readonly<{
  id: string;
  paymentId: string;
  attemptNumber: number;
  status: PaymentAttemptStatus;
  providerRef: string | null;
}>;

export type RefundRecord = Readonly<{
  id: string;
  orderId: string;
  paymentId: string;
  amountMinor: bigint;
  reason: string;
  status: RefundStatus;
  requestedBy: string | null;
  providerRef: string | null;
  createdAt: Date;
  completedAt: Date | null;
}>;

export type ProviderEventRecord = Readonly<{
  id: string;
  provider: string;
  eventId: string;
  type: string;
  signatureValid: boolean;
  rawBody: PaymentJsonObject;
  processedAt: Date | null;
  processingError: string | null;
}>;

export type CreatePaymentRecordInput = Readonly<{
  id: string;
  orderId: string;
  provider: string;
  amountMinor: bigint;
  currency: string;
  idempotencyKey: string;
  actorUserId: string | null;
}>;

export type AppendAttemptInput = Readonly<{
  id: string;
  paymentId: string;
  status: PaymentAttemptStatus;
  providerRef: string | null;
  requestSummary: PaymentJsonObject | null;
  responseSummary: PaymentJsonObject | null;
  actorUserId: string | null;
}>;

export type UpdateAttemptInput = Readonly<{
  id: string;
  status: PaymentAttemptStatus;
  providerRef: string | null;
  responseSummary: PaymentJsonObject | null;
}>;

export type AppendTransactionInput = Readonly<{
  id: string;
  paymentId: string;
  type: PaymentTransactionType;
  source: PaymentOutcomeSource;
  amountMinor: bigint;
  providerTxnRef: string | null;
  occurredAt: Date;
  rawPayload: PaymentJsonObject | null;
  actorUserId: string | null;
}>;

export type ApplyOutcomeWrite = Readonly<{
  paymentId: string;
  nextStatus: PaymentStatus;
  authorizedAt: Date | null;
  paidAt: Date | null;
  failedAt: Date | null;
  failureCode: string | null;
}>;

export type MismatchAlertInput = Readonly<{
  paymentId: string;
  orderId: string;
  source: PaymentOutcomeSource;
  reason: 'AMOUNT_MISMATCH' | 'CURRENCY_MISMATCH' | 'PROVIDER_REF_MISMATCH' | 'UNKNOWN_PAYMENT';
  actorUserId: string | null;
  redactedEvidence: PaymentJsonObject;
}>;

export type ClaimProviderEventInput = Readonly<{
  id: string;
  provider: string;
  eventId: string;
  type: string;
  signatureValid: boolean;
  rawBody: PaymentJsonObject;
}>;

export type CreateRefundInput = Readonly<{
  id: string;
  orderId: string;
  paymentId: string;
  amountMinor: bigint;
  reason: string;
  requestedBy: string;
  actorUserId: string;
}>;

export type RefundLockSnapshot = Readonly<{
  payment: PaymentRecord;
  order: Readonly<{
    id: string;
    grandTotalMinor: bigint;
    refundedTotalMinor: bigint;
    currency: string;
  }>;
  completedRefundedMinor: bigint;
  pendingRefundedMinor: bigint;
}>;

export interface PaymentsRepository {
  findPayableOrder(orderNumber: string, owner: PaymentOwner): Promise<PayableOrder | null>;
  lockOrderForPayment(
    orderId: string,
    transaction: TransactionContext,
  ): Promise<PayableOrder | null>;
  findActivePaymentForOrder(
    orderId: string,
    transaction?: TransactionContext,
  ): Promise<PaymentRecord | null>;
  claimStartIdempotency(
    input: Readonly<{ key: string; scope: string; requestHash: string; expiresAt: Date }>,
    transaction: TransactionContext,
  ): Promise<Readonly<{ requestHash: string; paymentId: string | null }> | null>;
  completeStartIdempotency(
    input: Readonly<{ key: string; scope: string; paymentId: string }>,
    transaction: TransactionContext,
  ): Promise<void>;
  createPayment(
    input: CreatePaymentRecordInput,
    transaction: TransactionContext,
  ): Promise<PaymentRecord>;
  /**
   * Optimistically claims the right to call `provider.createPayment` for
   * this payment by moving `CREATED` -> `PENDING` while `providerRef` is
   * still null. Returns `false` if another caller already holds the claim
   * (or a creation already succeeded), so `PaymentsService` never issues two
   * concurrent, non-idempotent provider creates for the same payment.
   */
  markProviderCreateClaimed(paymentId: string, transaction: TransactionContext): Promise<boolean>;
  appendAttempt(
    input: AppendAttemptInput,
    transaction: TransactionContext,
  ): Promise<PaymentAttemptRecord>;
  updateAttempt(input: UpdateAttemptInput, transaction: TransactionContext): Promise<void>;
  nextAttemptNumber(paymentId: string, transaction: TransactionContext): Promise<number>;
  setProviderRef(
    paymentId: string,
    providerRef: string,
    transaction: TransactionContext,
  ): Promise<PaymentRecord>;
  markCreateFailed(
    paymentId: string,
    failureCode: string,
    transaction: TransactionContext,
  ): Promise<void>;

  findById(paymentId: string, transaction?: TransactionContext): Promise<PaymentRecord | null>;
  findOwnedPayment(paymentId: string, owner: PaymentOwner): Promise<PaymentRecord | null>;
  lockPayment(paymentId: string, transaction: TransactionContext): Promise<PaymentRecord | null>;
  lockPaymentByProviderRef(
    provider: string,
    providerRef: string,
    transaction: TransactionContext,
  ): Promise<PaymentRecord | null>;
  orderFor(paymentId: string, transaction?: TransactionContext): Promise<PayableOrder | null>;

  hasProviderTransaction(
    paymentId: string,
    providerTxnRef: string,
    transaction: TransactionContext,
  ): Promise<boolean>;
  appendTransaction(input: AppendTransactionInput, transaction: TransactionContext): Promise<void>;
  applyOutcomeWrite(
    write: ApplyOutcomeWrite,
    transaction: TransactionContext,
  ): Promise<PaymentRecord>;
  markOrderPaid(
    orderId: string,
    paidAt: Date,
    actorUserId: string | null,
    transaction: TransactionContext,
  ): Promise<void>;
  recordMismatchAlert(input: MismatchAlertInput, transaction: TransactionContext): Promise<void>;
  recordPaymentCreated(
    paymentId: string,
    orderId: string,
    transaction: TransactionContext,
  ): Promise<void>;
  recordPaymentFailed(
    paymentId: string,
    orderId: string,
    status: 'FAILED' | 'CANCELLED' | 'EXPIRED',
    transaction: TransactionContext,
  ): Promise<void>;

  claimProviderEvent(
    input: ClaimProviderEventInput,
    transaction: TransactionContext,
  ): Promise<Readonly<{ id: string; outcome: 'CLAIMED' | 'DUPLICATE' }>>;
  markProviderEventProcessed(
    id: string,
    processingError: string | null,
    transaction: TransactionContext,
  ): Promise<void>;
  findUnprocessedProviderEvents(
    provider: string,
    limit: number,
  ): Promise<readonly ProviderEventRecord[]>;
  findProviderEvent(id: string): Promise<ProviderEventRecord | null>;

  listEligibleForReconciliation(
    provider: string,
    olderThanMs: number,
    limit: number,
    now: Date,
  ): Promise<readonly PaymentRecord[]>;

  lockPaymentForRefund(
    paymentId: string,
    transaction: TransactionContext,
  ): Promise<RefundLockSnapshot | null>;
  createRefund(input: CreateRefundInput, transaction: TransactionContext): Promise<RefundRecord>;
  markRefundOutcome(
    input: Readonly<{
      refundId: string;
      status: RefundStatus;
      providerRef: string | null;
      completedAt: Date | null;
    }>,
    transaction: TransactionContext,
  ): Promise<RefundRecord>;
  syncOrderRefundTotals(
    orderId: string,
    paymentId: string,
    transaction: TransactionContext,
  ): Promise<void>;

  close(): Promise<void>;
}

const NEGATIVE_TERMINAL: ReadonlySet<PaymentStatus> = new Set(['FAILED', 'CANCELLED', 'EXPIRED']);
const NON_TERMINAL_RANK: Readonly<Record<'CREATED' | 'PENDING' | 'AUTHORIZED', number>> = {
  CREATED: 0,
  PENDING: 1,
  AUTHORIZED: 2,
};

function isNonTerminal(status: PaymentStatus): status is 'CREATED' | 'PENDING' | 'AUTHORIZED' {
  return status === 'CREATED' || status === 'PENDING' || status === 'AUTHORIZED';
}

/**
 * The one monotonic state-transition decision function behind
 * `applyPaymentOutcome`. Pure and framework-free so the full state-machine
 * matrix (docs/payments-development.md "Transition table") can be unit
 * tested without a database.
 *
 * - `PAID` is never walked back by a later `PENDING` / `FAILED` / `CANCELLED`.
 * - A late `PAID` recovers a payment previously marked `FAILED` /
 *   `CANCELLED` / `EXPIRED` — this is the entire point of reconciliation: a
 *   dropped webhook or an abandoned redirect must not strand money already
 *   captured by the provider.
 * - `REFUNDED` / `PARTIALLY_REFUNDED` are reached only by the refund service,
 *   never by this function, and once reached this function never overwrites them.
 * - Two non-terminal states only move forward (`CREATED` -> `PENDING` ->
 *   `AUTHORIZED`), never backward, and never no-op-vs-apply ambiguously.
 */
export function decideTransition(
  current: PaymentStatus,
  outcomeStatus: PaymentOutcomeStatus,
): 'APPLY' | 'NOOP' {
  if (current === 'REFUNDED' || current === 'PARTIALLY_REFUNDED') return 'NOOP';
  if (current === 'PAID') return 'NOOP';
  if (NEGATIVE_TERMINAL.has(current)) return outcomeStatus === 'PAID' ? 'APPLY' : 'NOOP';
  if (isNonTerminal(current)) {
    if (
      outcomeStatus === 'PAID' ||
      outcomeStatus === 'FAILED' ||
      outcomeStatus === 'CANCELLED' ||
      outcomeStatus === 'EXPIRED'
    ) {
      return 'APPLY';
    }
    // outcomeStatus is 'PENDING' | 'AUTHORIZED' — only apply if it moves the
    // non-terminal rank strictly forward.
    const outcomeRank = NON_TERMINAL_RANK[outcomeStatus as 'PENDING' | 'AUTHORIZED'];
    return outcomeRank > NON_TERMINAL_RANK[current] ? 'APPLY' : 'NOOP';
  }
  return 'NOOP';
}

export function timestampsFor(
  paymentId: string,
  status: PaymentStatus,
  occurredAt: Date,
): ApplyOutcomeWrite {
  return {
    paymentId,
    nextStatus: status,
    authorizedAt: status === 'AUTHORIZED' ? occurredAt : null,
    paidAt: status === 'PAID' ? occurredAt : null,
    failedAt:
      status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED' ? occurredAt : null,
    failureCode:
      status === 'FAILED'
        ? 'PROVIDER_DECLINED'
        : status === 'CANCELLED'
          ? 'CUSTOMER_CANCELLED'
          : status === 'EXPIRED'
            ? 'PAYMENT_EXPIRED'
            : null,
  };
}
