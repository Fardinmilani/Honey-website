import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { TransactionContext } from '../src/platform/domain/transaction.js';
import { PaymentsService } from '../src/modules/payments/application/payments.service.js';
import type {
  AppendAttemptInput,
  AppendTransactionInput,
  ApplyOutcomeWrite,
  ClaimProviderEventInput,
  CreatePaymentRecordInput,
  CreateRefundInput,
  MismatchAlertInput,
  PayableOrder,
  PaymentAttemptRecord,
  PaymentOutcome,
  PaymentOwner,
  PaymentRecord,
  PaymentsRepository,
  ProviderEventRecord,
  RefundLockSnapshot,
  RefundRecord,
  UpdateAttemptInput,
} from '../src/modules/payments/domain/payments.js';
import { FakePaymentProvider } from '../src/modules/payments/infrastructure/providers/fake-payment-provider.js';

class MemoryTransaction extends TransactionContext {}

class MemoryPaymentsRepository implements PaymentsRepository {
  readonly orders = new Map<string, PayableOrder & { owner: PaymentOwner }>();
  readonly payments = new Map<string, PaymentRecord>();
  readonly attempts: PaymentAttemptRecord[] = [];
  readonly transactions: AppendTransactionInput[] = [];
  readonly events = new Map<string, ProviderEventRecord>();
  readonly refunds = new Map<string, RefundRecord>();
  readonly alerts: MismatchAlertInput[] = [];
  readonly outbox: string[] = [];
  readonly idempotency = new Map<string, { requestHash: string; paymentId: string | null }>();
  paidOrders = new Set<string>();

  seedOrder(order: PayableOrder, owner: PaymentOwner): void {
    this.orders.set(order.id, { ...order, owner });
  }

  async findPayableOrder(orderNumber: string, owner: PaymentOwner): Promise<PayableOrder | null> {
    for (const order of this.orders.values()) {
      if (order.number !== orderNumber) continue;
      if (owner.userId !== undefined && order.owner.userId === owner.userId) return order;
      if (owner.anonymousId !== undefined && order.owner.anonymousId === owner.anonymousId)
        return order;
    }
    return null;
  }

  async lockOrderForPayment(
    orderId: string,
    _transaction: TransactionContext,
  ): Promise<PayableOrder | null> {
    return this.orders.get(orderId) ?? null;
  }

  async findActivePaymentForOrder(
    orderId: string,
    _transaction?: TransactionContext,
  ): Promise<PaymentRecord | null> {
    return (
      [...this.payments.values()].find(
        (payment) =>
          payment.orderId === orderId &&
          (payment.status === 'CREATED' ||
            payment.status === 'PENDING' ||
            payment.status === 'AUTHORIZED'),
      ) ?? null
    );
  }

  async claimStartIdempotency(
    input: Readonly<{ key: string; scope: string; requestHash: string; expiresAt: Date }>,
    _transaction: TransactionContext,
  ): Promise<Readonly<{ requestHash: string; paymentId: string | null }> | null> {
    const key = `${input.scope}:${input.key}`;
    const existing = this.idempotency.get(key);
    if (existing === undefined) {
      this.idempotency.set(key, { requestHash: input.requestHash, paymentId: null });
      return null;
    }
    return existing;
  }

  async completeStartIdempotency(
    input: Readonly<{ key: string; scope: string; paymentId: string }>,
    _transaction: TransactionContext,
  ): Promise<void> {
    const key = `${input.scope}:${input.key}`;
    const existing = this.idempotency.get(key);
    if (existing !== undefined)
      this.idempotency.set(key, { ...existing, paymentId: input.paymentId });
  }

  async createPayment(
    input: CreatePaymentRecordInput,
    _transaction: TransactionContext,
  ): Promise<PaymentRecord> {
    if (
      [...this.payments.values()].some(
        (payment) =>
          payment.provider === input.provider && payment.idempotencyKey === input.idempotencyKey,
      )
    ) {
      throw { code: 'P2002' };
    }
    const now = new Date();
    const payment: PaymentRecord = {
      id: input.id,
      orderId: input.orderId,
      provider: input.provider,
      status: 'CREATED',
      amountMinor: input.amountMinor,
      currency: input.currency,
      providerRef: null,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now,
      authorizedAt: null,
      paidAt: null,
      failedAt: null,
      failureCode: null,
    };
    this.payments.set(payment.id, payment);
    this.outbox.push('payment.created');
    return payment;
  }

  async markProviderCreateClaimed(
    paymentId: string,
    _transaction: TransactionContext,
  ): Promise<boolean> {
    const payment = this.payments.get(paymentId);
    if (payment === undefined || payment.status !== 'CREATED' || payment.providerRef !== null)
      return false;
    this.payments.set(paymentId, { ...payment, status: 'PENDING' });
    return true;
  }

  async appendAttempt(
    input: AppendAttemptInput,
    _transaction: TransactionContext,
  ): Promise<PaymentAttemptRecord> {
    const attempt = {
      id: input.id,
      paymentId: input.paymentId,
      attemptNumber: this.attempts.filter((row) => row.paymentId === input.paymentId).length + 1,
      status: input.status,
      providerRef: input.providerRef,
    };
    this.attempts.push(attempt);
    return attempt;
  }

  async updateAttempt(input: UpdateAttemptInput, _transaction: TransactionContext): Promise<void> {
    const index = this.attempts.findIndex((row) => row.id === input.id);
    if (index >= 0) {
      this.attempts[index] = {
        ...this.attempts[index]!,
        status: input.status,
        providerRef: input.providerRef,
      };
    }
  }

  async nextAttemptNumber(paymentId: string, _transaction: TransactionContext): Promise<number> {
    return this.attempts.filter((row) => row.paymentId === paymentId).length + 1;
  }

  async setProviderRef(
    paymentId: string,
    providerRef: string,
    _transaction: TransactionContext,
  ): Promise<PaymentRecord> {
    const payment = this.payments.get(paymentId);
    if (payment === undefined) throw new Error('missing');
    const updated = { ...payment, providerRef, status: 'PENDING' as const };
    this.payments.set(paymentId, updated);
    return updated;
  }

  async markCreateFailed(
    paymentId: string,
    failureCode: string,
    _transaction: TransactionContext,
  ): Promise<void> {
    const payment = this.payments.get(paymentId);
    if (payment !== undefined) {
      this.payments.set(paymentId, {
        ...payment,
        status: 'FAILED',
        failureCode,
        failedAt: new Date(),
      });
    }
  }

  async findById(
    paymentId: string,
    _transaction?: TransactionContext,
  ): Promise<PaymentRecord | null> {
    return this.payments.get(paymentId) ?? null;
  }

  async findOwnedPayment(paymentId: string, owner: PaymentOwner): Promise<PaymentRecord | null> {
    const payment = this.payments.get(paymentId);
    if (payment === undefined) return null;
    const order = this.orders.get(payment.orderId);
    if (order === undefined) return null;
    if (owner.userId !== undefined && order.owner.userId === owner.userId) return payment;
    if (owner.anonymousId !== undefined && order.owner.anonymousId === owner.anonymousId)
      return payment;
    return null;
  }

  async lockPayment(
    paymentId: string,
    _transaction: TransactionContext,
  ): Promise<PaymentRecord | null> {
    return this.payments.get(paymentId) ?? null;
  }

  async lockPaymentByProviderRef(
    provider: string,
    providerRef: string,
    _transaction: TransactionContext,
  ): Promise<PaymentRecord | null> {
    return (
      [...this.payments.values()].find(
        (payment) => payment.provider === provider && payment.providerRef === providerRef,
      ) ?? null
    );
  }

  async orderFor(
    paymentId: string,
    _transaction?: TransactionContext,
  ): Promise<PayableOrder | null> {
    const payment = this.payments.get(paymentId);
    return payment === undefined ? null : (this.orders.get(payment.orderId) ?? null);
  }

  async hasProviderTransaction(
    paymentId: string,
    providerTxnRef: string,
    _transaction: TransactionContext,
  ): Promise<boolean> {
    return this.transactions.some(
      (row) => row.paymentId === paymentId && row.providerTxnRef === providerTxnRef,
    );
  }

  async appendTransaction(
    input: AppendTransactionInput,
    _transaction: TransactionContext,
  ): Promise<void> {
    this.transactions.push(input);
  }

  async applyOutcomeWrite(
    write: ApplyOutcomeWrite,
    _transaction: TransactionContext,
  ): Promise<PaymentRecord> {
    const payment = this.payments.get(write.paymentId);
    if (payment === undefined) throw new Error('missing');
    const updated = {
      ...payment,
      status: write.nextStatus,
      authorizedAt: write.authorizedAt ?? payment.authorizedAt,
      paidAt: write.paidAt ?? payment.paidAt,
      failedAt: write.failedAt ?? payment.failedAt,
      failureCode: write.failureCode,
    };
    this.payments.set(write.paymentId, updated);
    return updated;
  }

  async markOrderPaid(
    orderId: string,
    _paidAt: Date,
    _actorUserId: string | null,
    _transaction: TransactionContext,
  ): Promise<void> {
    if (this.paidOrders.has(orderId)) return;
    this.paidOrders.add(orderId);
    const order = this.orders.get(orderId);
    if (order !== undefined)
      this.orders.set(orderId, { ...order, status: 'PAID', paymentStatus: 'PAID' });
    this.outbox.push('payment.paid');
  }

  async recordMismatchAlert(
    input: MismatchAlertInput,
    _transaction: TransactionContext,
  ): Promise<void> {
    this.alerts.push(input);
    this.outbox.push('payment.reconciliation_mismatch');
  }

  async recordPaymentCreated(
    _paymentId: string,
    _orderId: string,
    _transaction: TransactionContext,
  ): Promise<void> {
    this.outbox.push('payment.created');
  }

  async recordPaymentFailed(
    _paymentId: string,
    _orderId: string,
    _status: 'FAILED' | 'CANCELLED' | 'EXPIRED',
    _transaction: TransactionContext,
  ): Promise<void> {
    this.outbox.push('payment.failed');
  }

  async claimProviderEvent(
    input: ClaimProviderEventInput,
    _transaction: TransactionContext,
  ): Promise<Readonly<{ id: string; outcome: 'CLAIMED' | 'DUPLICATE' }>> {
    for (const event of this.events.values()) {
      if (event.provider === input.provider && event.eventId === input.eventId) {
        return { id: event.id, outcome: 'DUPLICATE' };
      }
    }
    this.events.set(input.id, {
      id: input.id,
      provider: input.provider,
      eventId: input.eventId,
      type: input.type,
      signatureValid: input.signatureValid,
      rawBody: input.rawBody,
      processedAt: null,
      processingError: null,
    });
    return { id: input.id, outcome: 'CLAIMED' };
  }

  async markProviderEventProcessed(
    id: string,
    processingError: string | null,
    _transaction: TransactionContext,
  ): Promise<void> {
    const event = this.events.get(id);
    if (event !== undefined) {
      this.events.set(id, { ...event, processedAt: new Date(), processingError });
    }
  }

  async findUnprocessedProviderEvents(
    _provider: string,
    _limit: number,
  ): Promise<readonly ProviderEventRecord[]> {
    return [...this.events.values()].filter((event) => event.processedAt === null);
  }

  async findProviderEvent(id: string): Promise<ProviderEventRecord | null> {
    return this.events.get(id) ?? null;
  }

  async listEligibleForReconciliation(
    provider: string,
    _olderThanMs: number,
    _limit: number,
    _now: Date,
  ): Promise<readonly PaymentRecord[]> {
    return [...this.payments.values()].filter(
      (payment) => payment.provider === provider && payment.status === 'PENDING',
    );
  }

  async lockPaymentForRefund(
    paymentId: string,
    _transaction: TransactionContext,
  ): Promise<RefundLockSnapshot | null> {
    const payment = this.payments.get(paymentId);
    const order = payment === undefined ? undefined : this.orders.get(payment.orderId);
    if (payment === undefined || order === undefined) return null;
    const completed = [...this.refunds.values()]
      .filter((refund) => refund.paymentId === paymentId && refund.status === 'COMPLETED')
      .reduce((sum, refund) => sum + refund.amountMinor, 0n);
    const pending = [...this.refunds.values()]
      .filter(
        (refund) =>
          refund.paymentId === paymentId &&
          (refund.status === 'REQUESTED' || refund.status === 'PENDING'),
      )
      .reduce((sum, refund) => sum + refund.amountMinor, 0n);
    return {
      payment,
      order: {
        id: order.id,
        grandTotalMinor: order.grandTotalMinor,
        refundedTotalMinor: order.refundedTotalMinor,
        currency: order.currency,
      },
      completedRefundedMinor: completed,
      pendingRefundedMinor: pending,
    };
  }

  async createRefund(
    input: CreateRefundInput,
    _transaction: TransactionContext,
  ): Promise<RefundRecord> {
    const refund: RefundRecord = {
      id: input.id,
      orderId: input.orderId,
      paymentId: input.paymentId,
      amountMinor: input.amountMinor,
      reason: input.reason,
      status: 'REQUESTED',
      requestedBy: input.requestedBy,
      providerRef: null,
      createdAt: new Date(),
      completedAt: null,
    };
    this.refunds.set(refund.id, refund);
    return refund;
  }

  async markRefundOutcome(
    input: {
      refundId: string;
      status: RefundRecord['status'];
      providerRef: string | null;
      completedAt: Date | null;
    },
    _transaction: TransactionContext,
  ): Promise<RefundRecord> {
    const refund = this.refunds.get(input.refundId);
    if (refund === undefined) throw new Error('missing');
    const updated = {
      ...refund,
      status: input.status,
      providerRef: input.providerRef,
      completedAt: input.completedAt,
    };
    this.refunds.set(input.refundId, updated);
    return updated;
  }

  async syncOrderRefundTotals(
    orderId: string,
    paymentId: string,
    _transaction: TransactionContext,
  ): Promise<void> {
    const completed = [...this.refunds.values()]
      .filter((refund) => refund.orderId === orderId && refund.status === 'COMPLETED')
      .reduce((sum, refund) => sum + refund.amountMinor, 0n);
    const order = this.orders.get(orderId);
    const payment = this.payments.get(paymentId);
    if (order === undefined || payment === undefined) return;
    const next =
      completed >= order.grandTotalMinor
        ? 'REFUNDED'
        : completed > 0n
          ? 'PARTIALLY_REFUNDED'
          : 'PAID';
    this.orders.set(orderId, {
      ...order,
      refundedTotalMinor: completed,
      paymentStatus: next,
      status: next === 'REFUNDED' ? 'REFUNDED' : order.status,
    });
    this.payments.set(paymentId, { ...payment, status: next });
    if (next !== 'PAID')
      this.outbox.push(next === 'REFUNDED' ? 'payment.refunded' : 'payment.partially_refunded');
  }

  async close(): Promise<void> {}
}

function order(owner: PaymentOwner, overrides: Partial<PayableOrder> = {}): PayableOrder {
  return {
    id: randomUUID(),
    number: 'HNY-2026-000401',
    status: 'PENDING_PAYMENT',
    paymentStatus: 'UNPAID',
    currency: 'IRR',
    grandTotalMinor: 50_000n,
    refundedTotalMinor: 0n,
    email: 'pay@example.invalid',
    phone: null,
    localeAtPurchase: 'en',
    ...overrides,
  };
}

describe('PaymentsService', () => {
  function setup(options: Readonly<{ webhooks?: boolean; partialRefund?: boolean }> = {}) {
    const repository = new MemoryPaymentsRepository();
    const provider = new FakePaymentProvider({
      webhooks: options.webhooks ?? true,
      partialRefund: options.partialRefund ?? true,
    });
    const service = new PaymentsService(
      repository,
      new Map([['mock', provider]]),
      'mock',
      { run: (work) => work(new MemoryTransaction()) },
      { requireStepUp: async () => undefined },
      'http://localhost:3000/en/checkout/payment-return',
    );
    return { repository, provider, service };
  }

  it('starts a payment from the immutable order total and reuses the same idempotency key', async () => {
    const { repository, service } = setup();
    const owner = { anonymousId: randomUUID() };
    const payable = order(owner);
    repository.seedOrder(payable, owner);
    const first = await service.start(
      { userId: null, anonymousId: owner.anonymousId },
      payable.number,
      'idempotency-key-aaaa',
    );
    const second = await service.start(
      { userId: null, anonymousId: owner.anonymousId },
      payable.number,
      'idempotency-key-aaaa',
    );
    expect(first.payment.amount.amountMinor).toBe('50000');
    expect(second.replayed).toBe(true);
    expect(second.payment.id).toBe(first.payment.id);
    expect(repository.payments.size).toBe(1);
  });

  it('rejects the same idempotency key with a different order', async () => {
    const { repository, service } = setup();
    const owner = { anonymousId: randomUUID() };
    const firstOrder = order(owner, { number: 'HNY-2026-000401' });
    const secondOrder = order(owner, { id: randomUUID(), number: 'HNY-2026-000402' });
    repository.seedOrder(firstOrder, owner);
    repository.seedOrder(secondOrder, owner);
    await service.start(
      { userId: null, anonymousId: owner.anonymousId },
      firstOrder.number,
      'idempotency-key-bbbb',
    );
    await expect(
      service.start(
        { userId: null, anonymousId: owner.anonymousId },
        secondOrder.number,
        'idempotency-key-bbbb',
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE' });
  });

  it('hides another guest order and payment', async () => {
    const { repository, service } = setup();
    const ownerA = { anonymousId: randomUUID() };
    const ownerB = { anonymousId: randomUUID() };
    const payable = order(ownerA);
    repository.seedOrder(payable, ownerA);
    const started = await service.start(
      { userId: null, anonymousId: ownerA.anonymousId },
      payable.number,
      'idempotency-key-cccc',
    );
    await expect(
      service.get({ userId: null, anonymousId: ownerB.anonymousId }, started.payment.id),
    ).rejects.toMatchObject({
      name: 'NotFoundAppError',
    });
    await expect(
      service.start(
        { userId: null, anonymousId: ownerB.anonymousId },
        payable.number,
        'idempotency-key-cccc-other',
      ),
    ).rejects.toMatchObject({ name: 'NotFoundAppError' });
  });

  it('hides another authenticated user order and payment', async () => {
    const { repository, service } = setup();
    const ownerA = { userId: randomUUID() };
    const ownerB = { userId: randomUUID() };
    const payable = order(ownerA);
    repository.seedOrder(payable, ownerA);
    const started = await service.start(
      { userId: ownerA.userId, anonymousId: null },
      payable.number,
      'idempotency-key-cccc-user',
    );
    await expect(
      service.get({ userId: ownerB.userId, anonymousId: null }, started.payment.id),
    ).rejects.toMatchObject({ name: 'NotFoundAppError' });
    await expect(
      service.start(
        { userId: ownerB.userId, anonymousId: null },
        payable.number,
        'idempotency-key-cccc-user-other',
      ),
    ).rejects.toMatchObject({ name: 'NotFoundAppError' });
  });

  it('does not mark paid when verifyReturn reports FAILED after a forged success hint', async () => {
    const { repository, provider, service } = setup();
    const owner = { anonymousId: randomUUID() };
    const payable = order(owner);
    repository.seedOrder(payable, owner);
    const started = await service.start(
      { userId: null, anonymousId: owner.anonymousId },
      payable.number,
      'idempotency-key-dddd',
    );
    provider.setOutcome(FakePaymentProvider.providerRefFor(started.payment.id), {
      status: 'FAILED',
    });
    const verified = await service.verifyReturn(
      { userId: null, anonymousId: owner.anonymousId },
      started.payment.id,
    );
    expect(verified.status).toBe('FAILED');
    expect(repository.paidOrders.has(payable.id)).toBe(false);
    expect(repository.transactions).toHaveLength(0);
    expect(repository.outbox).not.toContain('payment.paid');
  });

  it('converges verifyReturn, webhook, and getStatus on one PAID transition', async () => {
    const { repository, provider, service } = setup();
    const owner = { anonymousId: randomUUID() };
    const payable = order(owner);
    repository.seedOrder(payable, owner);
    const started = await service.start(
      { userId: null, anonymousId: owner.anonymousId },
      payable.number,
      'idempotency-key-eeee',
    );
    const providerRef = FakePaymentProvider.providerRefFor(started.payment.id);
    provider.setOutcome(providerRef, { status: 'PAID', providerTxnRef: 'txn-1' });
    await service.verifyReturn(
      { userId: null, anonymousId: owner.anonymousId },
      started.payment.id,
    );
    const webhook = provider.signedWebhook(providerRef, { eventId: 'evt-1', status: 'PAID' });
    const received = await service.receiveWebhook('mock', webhook);
    await service.processProviderEvent(received.id);
    await service.reconcile(started.payment.id);
    expect(repository.paidOrders.size).toBe(1);
    expect(repository.transactions.filter((row) => row.type === 'CAPTURE')).toHaveLength(1);
    expect(repository.outbox.filter((event) => event === 'payment.paid')).toHaveLength(1);
  });

  it('rejects amount, currency, and providerRef mismatches without paying', async () => {
    const { repository, provider, service } = setup();
    const owner = { anonymousId: randomUUID() };
    const payable = order(owner);
    repository.seedOrder(payable, owner);
    const started = await service.start(
      { userId: null, anonymousId: owner.anonymousId },
      payable.number,
      'idempotency-key-ffff',
    );
    const providerRef = FakePaymentProvider.providerRefFor(started.payment.id);
    provider.setOutcome(providerRef, { status: 'PAID', amountMinor: 1n });
    await service.verifyReturn(
      { userId: null, anonymousId: owner.anonymousId },
      started.payment.id,
    );
    expect(repository.paidOrders.size).toBe(0);
    expect(repository.alerts[0]?.reason).toBe('AMOUNT_MISMATCH');
    provider.setOutcome(providerRef, { status: 'PAID', currency: 'USD' });
    await service.reconcile(started.payment.id);
    expect(repository.alerts.some((alert) => alert.reason === 'CURRENCY_MISMATCH')).toBe(true);
    provider.setOutcome(providerRef, { status: 'PAID', providerRef: 'other-ref' });
    await service.verifyReturn(
      { userId: null, anonymousId: owner.anonymousId },
      started.payment.id,
    );
    expect(repository.alerts.some((alert) => alert.reason === 'PROVIDER_REF_MISMATCH')).toBe(true);
    expect(repository.outbox.filter((event) => event === 'payment.paid')).toHaveLength(0);
  });

  it('still reaches PAID through verifyReturn and getStatus when webhooks are disabled', async () => {
    const { repository, provider, service } = setup({ webhooks: false });
    const owner = { anonymousId: randomUUID() };
    const payable = order(owner);
    repository.seedOrder(payable, owner);
    const started = await service.start(
      { userId: null, anonymousId: owner.anonymousId },
      payable.number,
      'idempotency-key-gggg',
    );
    provider.setOutcome(FakePaymentProvider.providerRefFor(started.payment.id), {
      status: 'PAID',
      providerTxnRef: 'txn-2',
    });
    await service.verifyReturn(
      { userId: null, anonymousId: owner.anonymousId },
      started.payment.id,
    );
    expect(repository.paidOrders.size).toBe(1);
  });

  it('drops invalid and replayed webhooks and ignores late PENDING after PAID', async () => {
    const { repository, provider, service } = setup();
    const owner = { anonymousId: randomUUID() };
    const payable = order(owner);
    repository.seedOrder(payable, owner);
    const started = await service.start(
      { userId: null, anonymousId: owner.anonymousId },
      payable.number,
      'idempotency-key-hhhh',
    );
    const providerRef = FakePaymentProvider.providerRefFor(started.payment.id);
    provider.setOutcome(providerRef, { status: 'PAID', providerTxnRef: 'txn-3' });
    const valid = provider.signedWebhook(providerRef, { eventId: 'evt-2', status: 'PAID' });
    const first = await service.receiveWebhook('mock', valid);
    await service.processProviderEvent(first.id);
    const replay = await service.receiveWebhook('mock', valid);
    await service.processProviderEvent(replay.id);
    const invalid = provider.signedWebhook(providerRef, {
      eventId: 'evt-3',
      signature: 'deadbeef',
    });
    const rejected = await service.receiveWebhook('mock', invalid);
    await service.processProviderEvent(rejected.id);
    provider.setOutcome(providerRef, { status: 'PENDING' });
    const stale = provider.signedWebhook(providerRef, { eventId: 'evt-4', status: 'PENDING' });
    const late = await service.receiveWebhook('mock', stale);
    await service.processProviderEvent(late.id);
    expect(repository.paidOrders.size).toBe(1);
    expect(
      [...repository.events.values()].filter((event) => event.signatureValid).length,
    ).toBeGreaterThan(0);
  });

  it('caps refunds and rejects partial refunds when the capability is off', async () => {
    const { repository, provider, service } = setup({ partialRefund: false });
    const owner = { userId: randomUUID() };
    const payable = order(owner);
    repository.seedOrder(payable, owner);
    const started = await service.start(
      { userId: owner.userId ?? null, anonymousId: null },
      payable.number,
      'idempotency-key-iiii',
    );
    provider.setOutcome(FakePaymentProvider.providerRefFor(started.payment.id), {
      status: 'PAID',
      providerTxnRef: 'txn-4',
    });
    await service.verifyReturn(
      { userId: owner.userId ?? null, anonymousId: null },
      started.payment.id,
    );
    await expect(
      service.requestRefund(
        started.payment.id,
        { amountMinor: '1', reason: 'partial not allowed' },
        { userId: owner.userId!, sessionId: randomUUID() },
      ),
    ).rejects.toMatchObject({ code: 'REFUND_PARTIAL_UNSUPPORTED' });
    const refund = await service.requestRefund(
      started.payment.id,
      { amountMinor: null, reason: 'full refund now' },
      { userId: owner.userId!, sessionId: randomUUID() },
    );
    expect(refund.status).toBe('COMPLETED');
    expect(repository.outbox).toContain('payment.refunded');
  });

  it('requires step-up for refunds', async () => {
    const repository = new MemoryPaymentsRepository();
    const provider = new FakePaymentProvider();
    const service = new PaymentsService(
      repository,
      new Map([['mock', provider]]),
      'mock',
      { run: (work) => work(new MemoryTransaction()) },
      {
        requireStepUp: async () => {
          throw new Error('STEP_UP_REQUIRED');
        },
      },
      'http://localhost:3000/en/checkout/payment-return',
    );
    await expect(
      service.requestRefund(
        randomUUID(),
        { amountMinor: null, reason: 'no step up' },
        {
          userId: randomUUID(),
          sessionId: randomUUID(),
        },
      ),
    ).rejects.toThrow('STEP_UP_REQUIRED');
  });

  it('exposes applyPaymentOutcome as the single transition entry', async () => {
    const { repository, service } = setup();
    const owner = { anonymousId: randomUUID() };
    const payable = order(owner);
    repository.seedOrder(payable, owner);
    const started = await service.start(
      { userId: null, anonymousId: owner.anonymousId },
      payable.number,
      'idempotency-key-jjjj',
    );
    const outcome: PaymentOutcome = {
      providerRef: FakePaymentProvider.providerRefFor(started.payment.id),
      status: 'PAID',
      amountMinor: 50_000n,
      currency: 'IRR',
      providerTxnRef: 'direct',
      occurredAt: new Date(),
      source: 'RECONCILIATION',
      raw: { providerRef: FakePaymentProvider.providerRefFor(started.payment.id) },
    };
    await service.applyPaymentOutcome('mock', outcome, null);
    expect(repository.paidOrders.size).toBe(1);
  });
});
