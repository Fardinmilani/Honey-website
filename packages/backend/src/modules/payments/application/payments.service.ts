import { createHash, randomUUID } from 'node:crypto';

import {
  ConflictAppError,
  DependencyUnavailableAppError,
  NotFoundAppError,
  ValidationAppError,
} from '../../../errors/index.js';
import type { TransactionRunner } from '../../../platform/domain/transaction.js';
import {
  decideTransition,
  timestampsFor,
  type CreatePaymentResult,
  type PayableOrder,
  type PaymentJsonObject,
  type PaymentOutcome,
  type PaymentOwner,
  type PaymentProvider,
  type PaymentRecord,
  type PaymentsRepository,
  type RawWebhook,
  type RefundRecord,
} from '../domain/payments.js';

const ORDER_NUMBER = /^HNY-\d{4}-\d{6}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;
const START_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_RECONCILIATION_MIN_AGE_MS = 5 * 60 * 1_000;

/**
 * Narrow port a `PaymentsService` depends on to require a "recently proved
 * a factor" check for a sensitive operation (refunds). Implemented by an
 * adapter over `IdentityService` — payments never imports identity's
 * concrete types, only this one-method capability (docs/module-boundaries.md §1).
 */
export interface StepUpPort {
  requireStepUp(sessionId: string): Promise<void>;
}

export type PaymentActor = Readonly<{ userId: string; sessionId: string }>;

export type PaymentRequestContext = Readonly<{
  userId: string | null;
  anonymousId: string | null;
}>;

export type PaymentMoney = Readonly<{ amountMinor: string; currency: string }>;

export type PaymentProjection = Readonly<{
  id: string;
  orderNumber: string;
  status: PaymentRecord['status'];
  provider: string;
  amount: PaymentMoney;
  redirectUrl: string | null;
  createdAt: string;
  paidAt: string | null;
}>;

export type RefundProjection = Readonly<{
  id: string;
  paymentId: string;
  amount: PaymentMoney;
  reason: string;
  status: RefundRecord['status'];
  createdAt: string;
  completedAt: string | null;
}>;

function validation(path: string, code: string): ValidationAppError {
  return new ValidationAppError([{ path, code }]);
}

function orderNumber(value: string): string {
  if (!ORDER_NUMBER.test(value)) throw validation('orderNumber', 'ORDER_NUMBER_INVALID');
  return value;
}

function paymentId(value: string): string {
  if (!UUID.test(value)) throw validation('paymentId', 'PAYMENT_ID_INVALID');
  return value;
}

function idempotencyKey(value: string): string {
  if (!IDEMPOTENCY_KEY.test(value)) throw validation('idempotencyKey', 'IDEMPOTENCY_KEY_INVALID');
  return value;
}

function ownerFor(context: PaymentRequestContext): PaymentOwner {
  if (context.userId !== null) return { userId: context.userId };
  if (context.anonymousId !== null) return { anonymousId: context.anonymousId };
  throw validation('payment', 'PAYMENT_OWNER_REQUIRED');
}

function serializeMoney(amountMinor: bigint, currency: string): PaymentMoney {
  if (amountMinor < 0n) throw new TypeError('Payment money cannot be negative.');
  return { amountMinor: amountMinor.toString(), currency };
}

function startScope(orderId: string): string {
  return `payment.start:${orderId}`;
}

function requestHashFor(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

/**
 * `receiveWebhook` stores the exact signed bytes and headers (never a
 * summary) precisely so this can rebuild the original request and let the
 * provider re-verify its own signature during processing, instead of ever
 * trusting a previously extracted outcome.
 */
function reconstructRawWebhook(rawBody: PaymentJsonObject): RawWebhook | null {
  const body = rawBody['body'];
  const headers = rawBody['headers'];
  if (
    typeof body !== 'string' ||
    headers === null ||
    typeof headers !== 'object' ||
    Array.isArray(headers)
  ) {
    return null;
  }
  const headerEntries: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== 'string') return null;
    headerEntries[key] = value;
  }
  return { rawBody: Buffer.from(body, 'base64'), headers: headerEntries };
}

type CreateClaim =
  | Readonly<{ state: 'DONE'; payment: PaymentRecord }>
  | Readonly<{ state: 'IN_PROGRESS' }>
  | Readonly<{ state: 'CLAIMED'; payment: PaymentRecord; attemptId: string }>;

/**
 * Orchestrates the provider-neutral payment lifecycle. Owns no order or
 * identity persistence directly — `applyOutcome` is the single, monotonic,
 * idempotent state-transition entry point reached by all three
 * server-verified paths (ADR-0022): customer return, webhook, reconciliation.
 */
export class PaymentsService {
  constructor(
    private readonly repository: PaymentsRepository,
    private readonly providers: ReadonlyMap<string, PaymentProvider>,
    private readonly defaultProviderCode: string,
    private readonly transactions: TransactionRunner,
    private readonly stepUp: StepUpPort,
    private readonly callbackBaseUrl: string,
    private readonly reconciliationMinAgeMs: number = DEFAULT_RECONCILIATION_MIN_AGE_MS,
  ) {}

  async start(
    contextInput: PaymentRequestContext,
    orderNumberInput: string,
    idempotencyKeyInput: string,
  ): Promise<Readonly<{ payment: PaymentProjection; replayed: boolean }>> {
    const owner = ownerFor(contextInput);
    const number = orderNumber(orderNumberInput);
    const key = idempotencyKey(idempotencyKeyInput);
    const hash = requestHashFor(number);
    const provider = this.#provider(this.defaultProviderCode);

    let outcome: Readonly<{
      state: 'RESUMED' | 'CREATED';
      payment: PaymentRecord;
      order: PayableOrder;
    }>;
    try {
      outcome = await this.transactions.run(async (transaction) => {
        const order = await this.repository.findPayableOrder(number, owner);
        if (order === null) throw new NotFoundAppError();
        const locked = await this.repository.lockOrderForPayment(order.id, transaction);
        if (locked === null) throw new NotFoundAppError();
        const scope = startScope(locked.id);
        const claim = await this.repository.claimStartIdempotency(
          {
            key,
            scope,
            requestHash: hash,
            expiresAt: new Date(Date.now() + START_IDEMPOTENCY_TTL_MS),
          },
          transaction,
        );
        if (claim !== null) {
          if (claim.requestHash !== hash)
            throw validation('idempotencyKey', 'IDEMPOTENCY_KEY_REUSE');
          if (claim.paymentId === null)
            throw new ConflictAppError({ code: 'IDEMPOTENCY_KEY_IN_PROGRESS' });
          const payment = await this.repository.findById(claim.paymentId, transaction);
          if (payment === null) throw new ConflictAppError({ code: 'IDEMPOTENCY_KEY_IN_PROGRESS' });
          return { state: 'RESUMED', payment, order: locked };
        }
        if (locked.paymentStatus === 'PAID')
          throw new ConflictAppError({ code: 'ORDER_ALREADY_PAID' });
        if (locked.status !== 'PENDING_PAYMENT')
          throw new ConflictAppError({ code: 'ORDER_NOT_PAYABLE' });
        const active = await this.repository.findActivePaymentForOrder(locked.id, transaction);
        if (active !== null) {
          await this.repository.completeStartIdempotency(
            { key, scope, paymentId: active.id },
            transaction,
          );
          return { state: 'RESUMED', payment: active, order: locked };
        }
        const created = await this.repository.createPayment(
          {
            id: randomUUID(),
            orderId: locked.id,
            provider: provider.code,
            amountMinor: locked.grandTotalMinor,
            currency: locked.currency,
            idempotencyKey: key,
            actorUserId: contextInput.userId,
          },
          transaction,
        );
        await this.repository.completeStartIdempotency(
          { key, scope, paymentId: created.id },
          transaction,
        );
        return { state: 'CREATED', payment: created, order: locked };
      });
    } catch (error) {
      if (isUniqueConstraint(error)) throw new ConflictAppError({ code: 'IDEMPOTENCY_KEY_REUSE' });
      throw error;
    }

    if (outcome.state === 'CREATED' || outcome.payment.providerRef === null) {
      const payment = await this.#createAtProvider(outcome.payment.id, outcome.order, provider);
      return { payment, replayed: outcome.state === 'RESUMED' };
    }
    const redirectUrl = provider.redirectUrlFor?.(outcome.payment.providerRef) ?? null;
    return {
      payment: this.#projection(outcome.payment, outcome.order.number, redirectUrl),
      replayed: true,
    };
  }

  async get(contextInput: PaymentRequestContext, idInput: string): Promise<PaymentProjection> {
    const owner = ownerFor(contextInput);
    const id = paymentId(idInput);
    const payment = await this.repository.findOwnedPayment(id, owner);
    if (payment === null) throw new NotFoundAppError();
    const order = await this.repository.orderFor(id);
    if (order === null) throw new NotFoundAppError();
    const provider = this.providers.get(payment.provider);
    const redirectUrl =
      payment.providerRef === null
        ? null
        : (provider?.redirectUrlFor?.(payment.providerRef) ?? null);
    return this.#projection(payment, order.number, redirectUrl);
  }

  /**
   * The customer's browser lands here after the gateway redirect. Nothing in
   * that request is trusted (ADR-0022) — only our own stored `providerRef`,
   * `amountMinor`, and `currency` for this payment are ever sent to the
   * provider's verification call. Safe to call more than once.
   */
  async verifyReturn(
    contextInput: PaymentRequestContext,
    idInput: string,
  ): Promise<PaymentProjection> {
    const owner = ownerFor(contextInput);
    const id = paymentId(idInput);
    const owned = await this.repository.findOwnedPayment(id, owner);
    if (owned === null) throw new NotFoundAppError();
    if (owned.providerRef === null) throw new ConflictAppError({ code: 'PAYMENT_NOT_STARTED' });
    const provider = this.#provider(owned.provider);
    if (provider.verifyReturn === undefined)
      throw new ConflictAppError({ code: 'PAYMENT_RETURN_UNSUPPORTED' });
    const outcome = await provider.verifyReturn({
      providerRef: owned.providerRef,
      amountMinor: owned.amountMinor,
      currency: owned.currency,
    });
    const applied = await this.applyPaymentOutcome(owned.provider, outcome, null, owned);
    const order = await this.repository.orderFor(id);
    if (order === null) throw new NotFoundAppError();
    const redirectUrl =
      applied.providerRef === null
        ? null
        : (provider.redirectUrlFor?.(applied.providerRef) ?? null);
    return this.#projection(applied, order.number, redirectUrl);
  }

  /**
   * Persists a signature-checked webhook event and returns immediately.
   * Deliberately does not run business logic inline — `processProviderEvent`
   * is the idempotent seam a future queue consumer (Phase 16) will invoke;
   * today, tests invoke it directly to prove the three paths converge. The
   * exact signed bytes are retained (never a summary) so re-processing calls
   * the provider's own signature check again rather than trusting a cache.
   */
  async receiveWebhook(
    providerCode: string,
    raw: Readonly<{ rawBody: Uint8Array; headers: Readonly<Record<string, string>> }>,
  ): Promise<Readonly<{ id: string }>> {
    const provider = this.#provider(providerCode);
    if (provider.parseWebhook === undefined)
      throw new ConflictAppError({ code: 'PAYMENT_WEBHOOK_UNSUPPORTED' });
    let eventId: string = randomUUID();
    let type = 'unknown';
    let signatureValid = true;
    try {
      const parsed = await provider.parseWebhook(raw);
      eventId = parsed.eventId;
      type = parsed.type;
    } catch {
      signatureValid = false;
    }
    const claim = await this.transactions.run((transaction) =>
      this.repository.claimProviderEvent(
        {
          id: randomUUID(),
          provider: providerCode,
          eventId,
          type,
          signatureValid,
          rawBody: {
            body: Buffer.from(raw.rawBody).toString('base64'),
            headers: raw.headers,
          },
        },
        transaction,
      ),
    );
    return { id: claim.id };
  }

  /** Idempotent event processing seam — see `receiveWebhook`. */
  async processProviderEvent(eventRowId: string): Promise<void> {
    const event = await this.repository.findProviderEvent(eventRowId);
    if (event === null) throw new NotFoundAppError();
    if (event.processedAt !== null) return;
    if (!event.signatureValid) {
      await this.transactions.run((transaction) =>
        this.repository.markProviderEventProcessed(eventRowId, 'SIGNATURE_INVALID', transaction),
      );
      return;
    }
    const provider = this.#provider(event.provider);
    if (provider.parseWebhook === undefined) {
      await this.transactions.run((transaction) =>
        this.repository.markProviderEventProcessed(eventRowId, 'PROVIDER_UNSUPPORTED', transaction),
      );
      return;
    }
    const reconstructed = reconstructRawWebhook(event.rawBody);
    if (reconstructed === null) {
      await this.transactions.run((transaction) =>
        this.repository.markProviderEventProcessed(eventRowId, 'MALFORMED_EVENT', transaction),
      );
      return;
    }
    try {
      const parsed = await provider.parseWebhook(reconstructed);
      await this.applyPaymentOutcome(
        event.provider,
        { ...parsed.outcome, source: 'VERIFIED_WEBHOOK' },
        null,
      );
      await this.transactions.run((transaction) =>
        this.repository.markProviderEventProcessed(eventRowId, null, transaction),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 200) : 'PROCESSING_FAILED';
      await this.transactions.run((transaction) =>
        this.repository.markProviderEventProcessed(eventRowId, message, transaction),
      );
    }
  }

  /** Mandatory reconciliation probe (ADR-0022) — one payment, called by tests or a future scheduler. */
  async reconcile(idInput: string): Promise<PaymentProjection> {
    const id = paymentId(idInput);
    const payment = await this.repository.findById(id);
    if (payment === null) throw new NotFoundAppError();
    if (payment.providerRef === null) throw new ConflictAppError({ code: 'PAYMENT_NOT_STARTED' });
    const provider = this.#provider(payment.provider);
    const outcome = await provider.getStatus({
      providerRef: payment.providerRef,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
    });
    const applied = await this.applyPaymentOutcome(payment.provider, outcome, null, payment);
    const order = await this.repository.orderFor(id);
    if (order === null) throw new NotFoundAppError();
    return this.#projection(applied, order.number, null);
  }

  /** Bulk reconciliation sweep for every non-terminal payment older than the configured threshold. */
  async reconcileEligible(
    providerCode: string,
    limit: number,
    now: Date = new Date(),
  ): Promise<number> {
    const eligible = await this.repository.listEligibleForReconciliation(
      providerCode,
      this.reconciliationMinAgeMs,
      limit,
      now,
    );
    let reconciled = 0;
    for (const payment of eligible) {
      if (payment.providerRef === null) continue;
      const provider = this.#provider(payment.provider);
      const outcome = await provider.getStatus({
        providerRef: payment.providerRef,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
      });
      await this.applyPaymentOutcome(payment.provider, outcome, null, payment);
      reconciled += 1;
    }
    return reconciled;
  }

  async requestRefund(
    idInput: string,
    input: Readonly<{ amountMinor: string | null; reason: string }>,
    actor: PaymentActor,
  ): Promise<RefundProjection> {
    await this.stepUp.requireStepUp(actor.sessionId);
    const id = paymentId(idInput);
    const reason = input.reason.normalize('NFC').trim();
    if (reason.length < 3 || reason.length > 500)
      throw validation('reason', 'REFUND_REASON_INVALID');
    const requestedAmount = this.#parseOptionalAmount(input.amountMinor);

    const claim = await this.transactions.run(async (transaction) => {
      const snapshot = await this.repository.lockPaymentForRefund(id, transaction);
      if (snapshot === null) throw new NotFoundAppError();
      if (snapshot.payment.status !== 'PAID' && snapshot.payment.status !== 'PARTIALLY_REFUNDED') {
        throw new ConflictAppError({ code: 'PAYMENT_NOT_REFUNDABLE' });
      }
      if (snapshot.payment.providerRef === null) {
        throw new ConflictAppError({ code: 'PAYMENT_NOT_REFUNDABLE' });
      }
      const provider = this.#provider(snapshot.payment.provider);
      const remaining =
        snapshot.payment.amountMinor -
        snapshot.completedRefundedMinor -
        snapshot.pendingRefundedMinor;
      const amount = this.#validateRefundAmount(
        requestedAmount,
        remaining,
        provider.capabilities.partialRefund,
      );
      const refund = await this.repository.createRefund(
        {
          id: randomUUID(),
          orderId: snapshot.order.id,
          paymentId: id,
          amountMinor: amount,
          reason,
          requestedBy: actor.userId,
          actorUserId: actor.userId,
        },
        transaction,
      );
      return {
        refund,
        paymentId: snapshot.payment.id,
        providerRef: snapshot.payment.providerRef,
        originalAmountMinor: snapshot.payment.amountMinor,
        currency: snapshot.payment.currency,
        orderId: snapshot.order.id,
        providerCode: provider.code,
      };
    });

    const provider = this.#provider(claim.providerCode);
    let outcome;
    try {
      outcome = await provider.refund({
        providerRef: claim.providerRef,
        amountMinor: claim.refund.amountMinor,
        originalAmountMinor: claim.originalAmountMinor,
        currency: claim.currency,
      });
    } catch (error) {
      await this.transactions.run((transaction) =>
        this.repository.markRefundOutcome(
          { refundId: claim.refund.id, status: 'FAILED', providerRef: null, completedAt: null },
          transaction,
        ),
      );
      if (error instanceof DependencyUnavailableAppError) throw error;
      throw new DependencyUnavailableAppError({
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
        retryable: true,
      });
    }

    const finalRefund = await this.transactions.run(async (transaction) => {
      const updated = await this.repository.markRefundOutcome(
        {
          refundId: claim.refund.id,
          status: outcome.status,
          providerRef: outcome.providerRefundRef,
          completedAt: outcome.status === 'COMPLETED' ? outcome.occurredAt : null,
        },
        transaction,
      );
      if (outcome.status === 'COMPLETED') {
        await this.repository.appendTransaction(
          {
            id: randomUUID(),
            paymentId: claim.paymentId,
            type: 'REFUND',
            source: 'STAFF_REFUND',
            amountMinor: updated.amountMinor,
            providerTxnRef: outcome.providerRefundRef,
            occurredAt: outcome.occurredAt,
            rawPayload: outcome.raw,
            actorUserId: actor.userId,
          },
          transaction,
        );
        await this.repository.syncOrderRefundTotals(claim.orderId, claim.paymentId, transaction);
      }
      return updated;
    });
    return this.#refundProjection(finalRefund, claim.currency);
  }

  async #createAtProvider(
    id: string,
    order: PayableOrder,
    provider: PaymentProvider,
  ): Promise<PaymentProjection> {
    const claim = await this.transactions.run<CreateClaim>(async (transaction) => {
      const locked = await this.repository.lockPayment(id, transaction);
      if (locked === null) throw new NotFoundAppError();
      if (locked.providerRef !== null) return { state: 'DONE', payment: locked };
      if (locked.status === 'PENDING') return { state: 'IN_PROGRESS' };
      const claimed = await this.repository.markProviderCreateClaimed(id, transaction);
      if (!claimed) return { state: 'IN_PROGRESS' };
      const attempt = await this.repository.appendAttempt(
        {
          id: randomUUID(),
          paymentId: id,
          status: 'SENT',
          providerRef: null,
          requestSummary: { orderNumber: order.number },
          responseSummary: null,
          actorUserId: null,
        },
        transaction,
      );
      return { state: 'CLAIMED', payment: locked, attemptId: attempt.id };
    });

    if (claim.state === 'IN_PROGRESS') {
      throw new ConflictAppError({ code: 'PAYMENT_CREATE_IN_PROGRESS' });
    }
    if (claim.state === 'DONE') {
      const redirectUrl = provider.redirectUrlFor?.(claim.payment.providerRef ?? '') ?? null;
      return this.#projection(claim.payment, order.number, redirectUrl);
    }

    let result: CreatePaymentResult;
    try {
      result = await provider.createPayment({
        paymentId: id,
        orderNumber: order.number,
        amountMinor: claim.payment.amountMinor,
        currency: claim.payment.currency,
        description: `Order ${order.number}`,
        callbackUrl: this.#callbackUrl(id, order.localeAtPurchase),
        customerEmail: order.email,
        customerMobile: order.phone,
      });
    } catch (error) {
      await this.transactions.run(async (transaction) => {
        await this.repository.updateAttempt(
          { id: claim.attemptId, status: 'FAILED', providerRef: null, responseSummary: null },
          transaction,
        );
        await this.repository.markCreateFailed(id, 'PROVIDER_CREATE_FAILED', transaction);
      });
      if (error instanceof DependencyUnavailableAppError) throw error;
      throw new DependencyUnavailableAppError({
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
        retryable: true,
      });
    }

    const updated = await this.transactions.run(async (transaction) => {
      await this.repository.updateAttempt(
        {
          id: claim.attemptId,
          status: 'SUCCEEDED',
          providerRef: result.providerRef,
          responseSummary: result.raw,
        },
        transaction,
      );
      return this.repository.setProviderRef(id, result.providerRef, transaction);
    });
    return this.#projection(updated, order.number, result.redirectUrl);
  }

  /**
   * The single monotonic, idempotent state-transition entry point. All three
   * verification paths (customer return, webhook, reconciliation) call this
   * and only this — ADR-0022.
   */
  async applyPaymentOutcome(
    providerCode: string,
    outcome: PaymentOutcome,
    actorUserId: string | null,
    expected: PaymentRecord | null = null,
  ): Promise<PaymentRecord> {
    return this.transactions.run(async (transaction) => {
      const lookupRef = expected?.providerRef ?? outcome.providerRef;
      const locked = await this.repository.lockPaymentByProviderRef(
        providerCode,
        lookupRef,
        transaction,
      );
      if (locked === null) {
        await this.repository.recordMismatchAlert(
          {
            paymentId: expected?.id ?? randomUUID(),
            orderId: expected?.orderId ?? randomUUID(),
            source: outcome.source,
            reason: 'UNKNOWN_PAYMENT',
            actorUserId,
            redactedEvidence: { providerRef: outcome.providerRef },
          },
          transaction,
        );
        throw new NotFoundAppError();
      }
      const order = await this.repository.orderFor(locked.id, transaction);
      if (order === null) throw new NotFoundAppError();
      const mismatch = this.#mismatchReason(locked, order, outcome, expected);
      if (mismatch !== null) {
        await this.repository.recordMismatchAlert(
          {
            paymentId: locked.id,
            orderId: locked.orderId,
            source: outcome.source,
            reason: mismatch,
            actorUserId,
            redactedEvidence: {
              expectedAmountMinor: locked.amountMinor.toString(),
              receivedAmountMinor: outcome.amountMinor.toString(),
              expectedCurrency: locked.currency,
              receivedCurrency: outcome.currency,
              expectedProviderRef: locked.providerRef,
              receivedProviderRef: outcome.providerRef,
              orderGrandTotalMinor: order.grandTotalMinor.toString(),
            },
          },
          transaction,
        );
        return locked;
      }
      const decision = decideTransition(locked.status, outcome.status);
      if (decision === 'NOOP') return locked;
      if (
        outcome.providerTxnRef !== null &&
        (await this.repository.hasProviderTransaction(
          locked.id,
          outcome.providerTxnRef,
          transaction,
        ))
      ) {
        return locked;
      }
      const write = timestampsFor(locked.id, outcome.status, outcome.occurredAt);
      const updated = await this.repository.applyOutcomeWrite(write, transaction);
      if (outcome.status === 'PAID' || outcome.status === 'AUTHORIZED') {
        await this.repository.appendTransaction(
          {
            id: randomUUID(),
            paymentId: locked.id,
            type: outcome.status === 'AUTHORIZED' ? 'AUTHORIZE' : 'CAPTURE',
            source: outcome.source,
            amountMinor: outcome.amountMinor,
            providerTxnRef: outcome.providerTxnRef,
            occurredAt: outcome.occurredAt,
            rawPayload: outcome.raw,
            actorUserId,
          },
          transaction,
        );
      }
      if (outcome.status === 'PAID') {
        await this.repository.markOrderPaid(
          locked.orderId,
          outcome.occurredAt,
          actorUserId,
          transaction,
        );
      }
      if (
        outcome.status === 'FAILED' ||
        outcome.status === 'CANCELLED' ||
        outcome.status === 'EXPIRED'
      ) {
        await this.repository.recordPaymentFailed(
          locked.id,
          locked.orderId,
          outcome.status,
          transaction,
        );
      }
      return updated;
    });
  }

  #mismatchReason(
    payment: PaymentRecord,
    order: PayableOrder,
    outcome: PaymentOutcome,
    expected: PaymentRecord | null,
  ): 'AMOUNT_MISMATCH' | 'CURRENCY_MISMATCH' | 'PROVIDER_REF_MISMATCH' | null {
    if (
      expected !== null &&
      expected.providerRef !== null &&
      outcome.providerRef !== expected.providerRef
    ) {
      return 'PROVIDER_REF_MISMATCH';
    }
    if (payment.providerRef !== null && outcome.providerRef !== payment.providerRef) {
      return 'PROVIDER_REF_MISMATCH';
    }
    if (
      payment.amountMinor !== order.grandTotalMinor ||
      outcome.amountMinor !== payment.amountMinor
    ) {
      return 'AMOUNT_MISMATCH';
    }
    if (payment.currency !== order.currency || outcome.currency !== payment.currency) {
      return 'CURRENCY_MISMATCH';
    }
    return null;
  }

  #validateRefundAmount(
    requested: bigint | null,
    remaining: bigint,
    partialRefundSupported: boolean,
  ): bigint {
    if (remaining <= 0n) throw new ConflictAppError({ code: 'REFUND_NOTHING_REMAINING' });
    if (requested === null) return remaining;
    if (requested <= 0n) throw validation('amountMinor', 'REFUND_AMOUNT_INVALID');
    if (requested > remaining) throw new ConflictAppError({ code: 'REFUND_EXCEEDS_REMAINING' });
    if (!partialRefundSupported && requested !== remaining) {
      throw new ConflictAppError({ code: 'REFUND_PARTIAL_UNSUPPORTED' });
    }
    return requested;
  }

  #parseOptionalAmount(value: string | null): bigint | null {
    if (value === null) return null;
    if (!/^[1-9][0-9]*$/u.test(value)) throw validation('amountMinor', 'REFUND_AMOUNT_INVALID');
    return BigInt(value);
  }

  #provider(code: string): PaymentProvider {
    const provider = this.providers.get(code);
    if (provider === undefined)
      throw new DependencyUnavailableAppError({ code: 'PAYMENT_PROVIDER_UNCONFIGURED' });
    return provider;
  }

  #callbackUrl(paymentId: string, localeAtPurchase: string): string {
    const locale = localeAtPurchase === 'en' ? 'en' : 'fa';
    const url = new URL(this.callbackBaseUrl);
    url.pathname = url.pathname.replace(/^\/(fa|en)(?=\/|$)/u, `/${locale}`);
    url.searchParams.set('paymentId', paymentId);
    return url.toString();
  }

  #projection(
    payment: PaymentRecord,
    orderNumberValue: string,
    redirectUrl: string | null,
  ): PaymentProjection {
    return {
      id: payment.id,
      orderNumber: orderNumberValue,
      status: payment.status,
      provider: payment.provider,
      amount: serializeMoney(payment.amountMinor, payment.currency),
      redirectUrl,
      createdAt: payment.createdAt.toISOString(),
      paidAt: payment.paidAt === null ? null : payment.paidAt.toISOString(),
    };
  }

  #refundProjection(refund: RefundRecord, currency: string): RefundProjection {
    return {
      id: refund.id,
      paymentId: refund.paymentId,
      amount: serializeMoney(refund.amountMinor, currency),
      reason: refund.reason,
      status: refund.status,
      createdAt: refund.createdAt.toISOString(),
      completedAt: refund.completedAt === null ? null : refund.completedAt.toISOString(),
    };
  }
}
