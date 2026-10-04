import { randomUUID } from 'node:crypto';

import { createPrismaClient, Prisma, type PrismaClient } from '@honey/db';

import { ConflictAppError } from '../../../errors/index.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import { asPrismaTransaction } from '../../../platform/infrastructure/prisma-platform.adapter.js';
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
  PaymentJsonObject,
  PaymentOwner,
  PaymentRecord,
  PaymentsRepository,
  ProviderEventRecord,
  RefundLockSnapshot,
  RefundRecord,
  UpdateAttemptInput,
} from '../domain/payments.js';

type Client = PrismaClient | ReturnType<typeof asPrismaTransaction>;

/**
 * Prisma's generated JSON types and the domain's readonly `PaymentJsonObject`
 * describe the same runtime shape. This is the one place that boundary is
 * crossed, per docs/module-boundaries.md §1.
 */
function toDomainJson(value: Prisma.JsonValue): PaymentJsonObject {
  return value as unknown as PaymentJsonObject;
}

function toPrismaJsonInput(value: PaymentJsonObject): Prisma.InputJsonObject {
  return value as unknown as Prisma.InputJsonObject;
}

function clientFor(client: PrismaClient, transaction: TransactionContext | undefined): Client {
  return transaction === undefined ? client : asPrismaTransaction(transaction);
}

function ownerOrderWhere(owner: PaymentOwner): Prisma.OrderWhereInput {
  return owner.userId === undefined
    ? { checkoutSession: { cart: { anonymousId: owner.anonymousId } } }
    : { userId: owner.userId };
}

const orderSelect = {
  id: true,
  number: true,
  status: true,
  paymentStatus: true,
  currency: true,
  grandTotalMinor: true,
  refundedTotalMinor: true,
  email: true,
  phone: true,
  localeAtPurchase: true,
} satisfies Prisma.OrderSelect;

type OrderRow = Readonly<{
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

function mapOrder(row: OrderRow): PayableOrder {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    paymentStatus: row.paymentStatus,
    currency: row.currency,
    grandTotalMinor: row.grandTotalMinor,
    refundedTotalMinor: row.refundedTotalMinor,
    email: row.email,
    phone: row.phone,
    localeAtPurchase: row.localeAtPurchase,
  };
}

function status(value: string): PaymentRecord['status'] {
  if (
    value === 'CREATED' ||
    value === 'PENDING' ||
    value === 'AUTHORIZED' ||
    value === 'PAID' ||
    value === 'FAILED' ||
    value === 'CANCELLED' ||
    value === 'EXPIRED' ||
    value === 'REFUNDED' ||
    value === 'PARTIALLY_REFUNDED'
  ) {
    return value;
  }
  throw new TypeError('Payment has an unknown status.');
}

function attemptStatus(value: string): PaymentAttemptRecord['status'] {
  if (value === 'CREATED' || value === 'SENT' || value === 'SUCCEEDED' || value === 'FAILED') {
    return value;
  }
  throw new TypeError('Payment attempt has an unknown status.');
}

function refundStatus(value: string): RefundRecord['status'] {
  if (
    value === 'REQUESTED' ||
    value === 'PENDING' ||
    value === 'COMPLETED' ||
    value === 'FAILED' ||
    value === 'CANCELLED'
  ) {
    return value;
  }
  throw new TypeError('Refund has an unknown status.');
}

const paymentSelect = {
  id: true,
  orderId: true,
  provider: true,
  status: true,
  amountMinor: true,
  currency: true,
  providerRef: true,
  idempotencyKey: true,
  createdAt: true,
  updatedAt: true,
  authorizedAt: true,
  paidAt: true,
  failedAt: true,
  failureCode: true,
} satisfies Prisma.PaymentSelect;

type PaymentRow = Readonly<{
  id: string;
  orderId: string;
  provider: string;
  status: string;
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

function mapPayment(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    provider: row.provider,
    status: status(row.status),
    amountMinor: row.amountMinor,
    currency: row.currency,
    providerRef: row.providerRef,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    authorizedAt: row.authorizedAt,
    paidAt: row.paidAt,
    failedAt: row.failedAt,
    failureCode: row.failureCode,
  };
}

type AttemptRow = Readonly<{
  id: string;
  paymentId: string;
  attemptNumber: number;
  status: string;
  providerRef: string | null;
}>;

function mapAttempt(row: AttemptRow): PaymentAttemptRecord {
  return {
    id: row.id,
    paymentId: row.paymentId,
    attemptNumber: row.attemptNumber,
    status: attemptStatus(row.status),
    providerRef: row.providerRef,
  };
}

type RefundRow = Readonly<{
  id: string;
  orderId: string;
  paymentId: string;
  amountMinor: bigint;
  reason: string;
  status: string;
  requestedBy: string | null;
  providerRef: string | null;
  createdAt: Date;
  completedAt: Date | null;
}>;

function mapRefund(row: RefundRow): RefundRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    paymentId: row.paymentId,
    amountMinor: row.amountMinor,
    reason: row.reason,
    status: refundStatus(row.status),
    requestedBy: row.requestedBy,
    providerRef: row.providerRef,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

type ProviderEventRow = Readonly<{
  id: string;
  provider: string;
  eventId: string;
  type: string;
  signatureValid: boolean;
  rawBody: Prisma.JsonValue;
  processedAt: Date | null;
  processingError: string | null;
}>;

function mapProviderEvent(row: ProviderEventRow): ProviderEventRecord {
  return {
    id: row.id,
    provider: row.provider,
    eventId: row.eventId,
    type: row.type,
    signatureValid: row.signatureValid,
    rawBody: toDomainJson(row.rawBody),
    processedAt: row.processedAt,
    processingError: row.processingError,
  };
}

function isPostgresError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function parsePaymentIdBody(value: Prisma.JsonValue | null): string | null {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('paymentId' in value) ||
    typeof value['paymentId'] !== 'string'
  ) {
    return null;
  }
  return value['paymentId'];
}

/** Payments owns payment*, refund and provider_event persistence (docs/module-boundaries.md). */
export class PrismaPaymentsRepository implements PaymentsRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  async findPayableOrder(orderNumber: string, owner: PaymentOwner): Promise<PayableOrder | null> {
    const row = await this.#client.order.findFirst({
      where: { number: orderNumber, ...ownerOrderWhere(owner) },
      select: orderSelect,
    });
    return row === null ? null : mapOrder(row);
  }

  async lockOrderForPayment(
    orderId: string,
    transaction: TransactionContext,
  ): Promise<PayableOrder | null> {
    const client = asPrismaTransaction(transaction);
    const rows = await client.$queryRaw<readonly Readonly<{ id: string }>[]>(
      Prisma.sql`SELECT "id" FROM "order" WHERE "id" = ${orderId}::uuid FOR UPDATE`,
    );
    if (rows.length === 0) return null;
    const row = await client.order.findUnique({ where: { id: orderId }, select: orderSelect });
    return row === null ? null : mapOrder(row);
  }

  async findActivePaymentForOrder(
    orderId: string,
    transaction?: TransactionContext,
  ): Promise<PaymentRecord | null> {
    const row = await clientFor(this.#client, transaction).payment.findFirst({
      where: { orderId, status: { in: ['CREATED', 'PENDING', 'AUTHORIZED'] } },
      orderBy: { createdAt: 'desc' },
      select: paymentSelect,
    });
    return row === null ? null : mapPayment(row);
  }

  async claimStartIdempotency(
    input: Readonly<{ key: string; scope: string; requestHash: string; expiresAt: Date }>,
    transaction: TransactionContext,
  ): Promise<Readonly<{ requestHash: string; paymentId: string | null }> | null> {
    const client = asPrismaTransaction(transaction);
    await client.idempotencyKey.deleteMany({
      where: { key: input.key, scope: input.scope, expiresAt: { lte: new Date() } },
    });
    const created = await client.$queryRaw<readonly Readonly<{ id: string }>[]>(Prisma.sql`
      INSERT INTO "idempotency_key" ("id", "key", "scope", "user_id", "request_hash", "expires_at")
      VALUES (${randomUUID()}::uuid, ${input.key}, ${input.scope}, NULL, ${input.requestHash}, ${input.expiresAt})
      ON CONFLICT ("key", "scope") DO NOTHING
      RETURNING "id"
    `);
    if (created.length === 1) return null;
    await client.$queryRaw(Prisma.sql`
      SELECT "id" FROM "idempotency_key" WHERE "key" = ${input.key} AND "scope" = ${input.scope} FOR UPDATE
    `);
    const existing = await client.idempotencyKey.findUnique({
      where: { key_scope: { key: input.key, scope: input.scope } },
    });
    if (existing === null) return null;
    const paymentId = parsePaymentIdBody(existing.responseBody);
    return { requestHash: existing.requestHash, paymentId };
  }

  async completeStartIdempotency(
    input: Readonly<{ key: string; scope: string; paymentId: string }>,
    transaction: TransactionContext,
  ): Promise<void> {
    await asPrismaTransaction(transaction).idempotencyKey.update({
      where: { key_scope: { key: input.key, scope: input.scope } },
      data: { responseStatus: 200, responseBody: { paymentId: input.paymentId } },
    });
  }

  async createPayment(
    input: CreatePaymentRecordInput,
    transaction: TransactionContext,
  ): Promise<PaymentRecord> {
    const row = await asPrismaTransaction(transaction).payment.create({
      data: {
        id: input.id,
        orderId: input.orderId,
        provider: input.provider,
        status: 'CREATED',
        amountMinor: input.amountMinor,
        currency: input.currency,
        idempotencyKey: input.idempotencyKey,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
      select: paymentSelect,
    });
    await asPrismaTransaction(transaction).outboxEvent.create({
      data: {
        id: randomUUID(),
        aggregateType: 'payment',
        aggregateId: input.id,
        eventType: 'payment.created',
        payload: { orderId: input.orderId, paymentId: input.id, version: 1 },
      },
    });
    return mapPayment(row);
  }

  async markProviderCreateClaimed(
    paymentId: string,
    transaction: TransactionContext,
  ): Promise<boolean> {
    const updated = await asPrismaTransaction(transaction).payment.updateMany({
      where: { id: paymentId, status: 'CREATED', providerRef: null },
      data: { status: 'PENDING' },
    });
    return updated.count === 1;
  }

  async appendAttempt(
    input: AppendAttemptInput,
    transaction: TransactionContext,
  ): Promise<PaymentAttemptRecord> {
    const number = await this.nextAttemptNumber(input.paymentId, transaction);
    const row = await asPrismaTransaction(transaction).paymentAttempt.create({
      data: {
        id: input.id,
        paymentId: input.paymentId,
        attemptNumber: number,
        status: input.status,
        providerRef: input.providerRef,
        requestSummary:
          input.requestSummary === null ? Prisma.JsonNull : toPrismaJsonInput(input.requestSummary),
        responseSummary:
          input.responseSummary === null
            ? Prisma.JsonNull
            : toPrismaJsonInput(input.responseSummary),
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
      select: { id: true, paymentId: true, attemptNumber: true, status: true, providerRef: true },
    });
    return mapAttempt(row);
  }

  async updateAttempt(input: UpdateAttemptInput, transaction: TransactionContext): Promise<void> {
    await asPrismaTransaction(transaction).paymentAttempt.update({
      where: { id: input.id },
      data: {
        status: input.status,
        providerRef: input.providerRef,
        responseSummary:
          input.responseSummary === null
            ? Prisma.JsonNull
            : toPrismaJsonInput(input.responseSummary),
      },
    });
  }

  async nextAttemptNumber(paymentId: string, transaction: TransactionContext): Promise<number> {
    const latest = await asPrismaTransaction(transaction).paymentAttempt.findFirst({
      where: { paymentId },
      orderBy: { attemptNumber: 'desc' },
      select: { attemptNumber: true },
    });
    return (latest?.attemptNumber ?? 0) + 1;
  }

  async setProviderRef(
    paymentId: string,
    providerRef: string,
    transaction: TransactionContext,
  ): Promise<PaymentRecord> {
    const client = asPrismaTransaction(transaction);
    await client.payment.updateMany({
      where: { id: paymentId, providerRef: null },
      data: { providerRef, status: 'PENDING' },
    });
    const row = await client.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: paymentSelect,
    });
    return mapPayment(row);
  }

  async markCreateFailed(
    paymentId: string,
    failureCode: string,
    transaction: TransactionContext,
  ): Promise<void> {
    await asPrismaTransaction(transaction).payment.updateMany({
      where: { id: paymentId, providerRef: null, status: { in: ['CREATED', 'PENDING'] } },
      data: { status: 'FAILED', failedAt: new Date(), failureCode },
    });
  }

  async findById(
    paymentId: string,
    transaction?: TransactionContext,
  ): Promise<PaymentRecord | null> {
    const row = await clientFor(this.#client, transaction).payment.findUnique({
      where: { id: paymentId },
      select: paymentSelect,
    });
    return row === null ? null : mapPayment(row);
  }

  async findOwnedPayment(paymentId: string, owner: PaymentOwner): Promise<PaymentRecord | null> {
    const row = await this.#client.payment.findFirst({
      where: { id: paymentId, order: ownerOrderWhere(owner) },
      select: paymentSelect,
    });
    return row === null ? null : mapPayment(row);
  }

  async lockPayment(
    paymentId: string,
    transaction: TransactionContext,
  ): Promise<PaymentRecord | null> {
    const client = asPrismaTransaction(transaction);
    const rows = await client.$queryRaw<readonly Readonly<{ id: string }>[]>(
      Prisma.sql`SELECT "id" FROM "payment" WHERE "id" = ${paymentId}::uuid FOR UPDATE`,
    );
    if (rows.length === 0) return null;
    const row = await client.payment.findUnique({
      where: { id: paymentId },
      select: paymentSelect,
    });
    return row === null ? null : mapPayment(row);
  }

  async lockPaymentByProviderRef(
    provider: string,
    providerRef: string,
    transaction: TransactionContext,
  ): Promise<PaymentRecord | null> {
    const client = asPrismaTransaction(transaction);
    const rows = await client.$queryRaw<readonly Readonly<{ id: string }>[]>(
      Prisma.sql`SELECT "id" FROM "payment" WHERE "provider" = ${provider} AND "provider_ref" = ${providerRef} FOR UPDATE`,
    );
    if (rows.length === 0) return null;
    const row = await client.payment.findFirst({
      where: { provider, providerRef },
      select: paymentSelect,
    });
    return row === null ? null : mapPayment(row);
  }

  async orderFor(
    paymentId: string,
    transaction?: TransactionContext,
  ): Promise<PayableOrder | null> {
    const row = await clientFor(this.#client, transaction).payment.findUnique({
      where: { id: paymentId },
      select: { order: { select: orderSelect } },
    });
    return row === null ? null : mapOrder(row.order);
  }

  async hasProviderTransaction(
    paymentId: string,
    providerTxnRef: string,
    transaction: TransactionContext,
  ): Promise<boolean> {
    const existing = await asPrismaTransaction(transaction).paymentTransaction.findFirst({
      where: { paymentId, providerTxnRef },
      select: { id: true },
    });
    return existing !== null;
  }

  async appendTransaction(
    input: AppendTransactionInput,
    transaction: TransactionContext,
  ): Promise<void> {
    await asPrismaTransaction(transaction).paymentTransaction.create({
      data: {
        id: input.id,
        paymentId: input.paymentId,
        type: input.type,
        source: input.source,
        amountMinor: input.amountMinor,
        providerTxnRef: input.providerTxnRef,
        occurredAt: input.occurredAt,
        rawPayload:
          input.rawPayload === null ? Prisma.JsonNull : toPrismaJsonInput(input.rawPayload),
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
  }

  async applyOutcomeWrite(
    write: ApplyOutcomeWrite,
    transaction: TransactionContext,
  ): Promise<PaymentRecord> {
    // A null `authorizedAt` / `paidAt` / `failedAt` on the write means "this
    // transition did not reach that milestone" (see `timestampsFor`), not
    // "erase a milestone reached earlier" — so the column is left untouched
    // (key omitted) rather than written as an explicit NULL.
    const row = await asPrismaTransaction(transaction).payment.update({
      where: { id: write.paymentId },
      data: {
        status: write.nextStatus,
        ...(write.authorizedAt !== null ? { authorizedAt: write.authorizedAt } : {}),
        ...(write.paidAt !== null ? { paidAt: write.paidAt } : {}),
        ...(write.failedAt !== null ? { failedAt: write.failedAt } : {}),
        failureCode: write.failureCode,
      },
      select: paymentSelect,
    });
    return mapPayment(row);
  }

  async markOrderPaid(
    orderId: string,
    paidAt: Date,
    actorUserId: string | null,
    transaction: TransactionContext,
  ): Promise<void> {
    const client = asPrismaTransaction(transaction);
    const updated = await client.order.updateMany({
      where: { id: orderId, paymentStatus: { not: 'PAID' } },
      data: { status: 'PAID', paymentStatus: 'PAID', updatedBy: actorUserId },
    });
    if (updated.count === 0) return;
    await client.orderStatusHistory.create({
      data: {
        id: randomUUID(),
        orderId,
        fromStatus: 'PENDING_PAYMENT',
        toStatus: 'PAID',
        reason: 'payment_verified',
        actorUserId,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    await client.auditLog.create({
      data: {
        id: randomUUID(),
        actorUserId,
        action: 'order.paid',
        subjectType: 'order',
        subjectId: orderId,
        beforeJson: { paymentStatus: 'UNPAID' },
        afterJson: { paymentStatus: 'PAID', paidAt: paidAt.toISOString() },
      },
    });
    await client.outboxEvent.create({
      data: {
        id: randomUUID(),
        aggregateType: 'order',
        aggregateId: orderId,
        eventType: 'payment.paid',
        payload: { orderId, version: 1 },
      },
    });
  }

  async recordPaymentCreated(
    paymentId: string,
    orderId: string,
    transaction: TransactionContext,
  ): Promise<void> {
    await asPrismaTransaction(transaction).outboxEvent.create({
      data: {
        id: randomUUID(),
        aggregateType: 'payment',
        aggregateId: paymentId,
        eventType: 'payment.created',
        payload: { orderId, paymentId, version: 1 },
      },
    });
  }

  async recordPaymentFailed(
    paymentId: string,
    orderId: string,
    status: 'FAILED' | 'CANCELLED' | 'EXPIRED',
    transaction: TransactionContext,
  ): Promise<void> {
    await asPrismaTransaction(transaction).outboxEvent.create({
      data: {
        id: randomUUID(),
        aggregateType: 'payment',
        aggregateId: paymentId,
        eventType: 'payment.failed',
        payload: { orderId, paymentId, status, version: 1 },
      },
    });
  }

  async recordMismatchAlert(
    input: MismatchAlertInput,
    transaction: TransactionContext,
  ): Promise<void> {
    const client = asPrismaTransaction(transaction);
    await client.auditLog.create({
      data: {
        id: randomUUID(),
        actorUserId: input.actorUserId,
        action: 'payment.amount_mismatch',
        subjectType: 'payment',
        subjectId: input.paymentId,
        beforeJson: { reason: input.reason },
        afterJson: toPrismaJsonInput(input.redactedEvidence) as Prisma.InputJsonObject,
      },
    });
    await client.outboxEvent.create({
      data: {
        id: randomUUID(),
        aggregateType: 'payment',
        aggregateId: input.paymentId,
        eventType: 'payment.reconciliation_mismatch',
        payload: {
          orderId: input.orderId,
          source: input.source,
          reason: input.reason,
          version: 1,
        },
      },
    });
  }

  async claimProviderEvent(
    input: ClaimProviderEventInput,
    transaction: TransactionContext,
  ): Promise<Readonly<{ id: string; outcome: 'CLAIMED' | 'DUPLICATE' }>> {
    const client = asPrismaTransaction(transaction);
    const created = await client.$queryRaw<readonly Readonly<{ id: string }>[]>(Prisma.sql`
      INSERT INTO "provider_event" ("id", "provider", "event_id", "type", "signature_valid", "raw_body")
      VALUES (
        ${input.id}::uuid,
        ${input.provider},
        ${input.eventId},
        ${input.type},
        ${input.signatureValid},
        ${JSON.stringify(input.rawBody)}::jsonb
      )
      ON CONFLICT ("provider", "event_id") DO NOTHING
      RETURNING "id"
    `);
    if (created.length === 1) return { id: created[0]!.id, outcome: 'CLAIMED' };
    const existing = await client.providerEvent.findUniqueOrThrow({
      where: { provider_eventId: { provider: input.provider, eventId: input.eventId } },
      select: { id: true },
    });
    return { id: existing.id, outcome: 'DUPLICATE' };
  }

  async markProviderEventProcessed(
    id: string,
    processingError: string | null,
    transaction: TransactionContext,
  ): Promise<void> {
    await asPrismaTransaction(transaction).providerEvent.update({
      where: { id },
      data: { processedAt: new Date(), processingError },
    });
  }

  async findUnprocessedProviderEvents(
    provider: string,
    limit: number,
  ): Promise<readonly ProviderEventRecord[]> {
    const rows = await this.#client.providerEvent.findMany({
      where: { provider, processedAt: null },
      orderBy: { receivedAt: 'asc' },
      take: limit,
    });
    return rows.map(mapProviderEvent);
  }

  async findProviderEvent(id: string): Promise<ProviderEventRecord | null> {
    const row = await this.#client.providerEvent.findUnique({ where: { id } });
    return row === null ? null : mapProviderEvent(row);
  }

  async listEligibleForReconciliation(
    provider: string,
    olderThanMs: number,
    limit: number,
    now: Date,
  ): Promise<readonly PaymentRecord[]> {
    const rows = await this.#client.payment.findMany({
      where: {
        provider,
        status: { in: ['CREATED', 'PENDING', 'AUTHORIZED'] },
        createdAt: { lte: new Date(now.getTime() - olderThanMs) },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: paymentSelect,
    });
    return rows.map(mapPayment);
  }

  async lockPaymentForRefund(
    paymentId: string,
    transaction: TransactionContext,
  ): Promise<RefundLockSnapshot | null> {
    const client = asPrismaTransaction(transaction);
    const rows = await client.$queryRaw<readonly Readonly<{ id: string }>[]>(
      Prisma.sql`SELECT "id" FROM "payment" WHERE "id" = ${paymentId}::uuid FOR UPDATE`,
    );
    if (rows.length === 0) return null;
    const payment = await client.payment.findUnique({
      where: { id: paymentId },
      select: paymentSelect,
    });
    if (payment === null) return null;
    const order = await client.order.findUnique({
      where: { id: payment.orderId },
      select: { id: true, grandTotalMinor: true, refundedTotalMinor: true, currency: true },
    });
    if (order === null) return null;
    const totals = await client.refund.groupBy({
      by: ['status'],
      where: { paymentId, status: { in: ['REQUESTED', 'PENDING', 'COMPLETED'] } },
      _sum: { amountMinor: true },
    });
    let completedRefundedMinor = 0n;
    let pendingRefundedMinor = 0n;
    for (const row of totals) {
      const sum = row._sum.amountMinor ?? 0n;
      if (row.status === 'COMPLETED') completedRefundedMinor += sum;
      else pendingRefundedMinor += sum;
    }
    return {
      payment: mapPayment(payment),
      order: {
        id: order.id,
        grandTotalMinor: order.grandTotalMinor,
        refundedTotalMinor: order.refundedTotalMinor,
        currency: order.currency,
      },
      completedRefundedMinor,
      pendingRefundedMinor,
    };
  }

  async createRefund(
    input: CreateRefundInput,
    transaction: TransactionContext,
  ): Promise<RefundRecord> {
    try {
      const row = await asPrismaTransaction(transaction).refund.create({
        data: {
          id: input.id,
          orderId: input.orderId,
          paymentId: input.paymentId,
          amountMinor: input.amountMinor,
          reason: input.reason,
          status: 'REQUESTED',
          requestedBy: input.requestedBy,
          createdBy: input.actorUserId,
          updatedBy: input.actorUserId,
        },
        select: {
          id: true,
          orderId: true,
          paymentId: true,
          amountMinor: true,
          reason: true,
          status: true,
          requestedBy: true,
          providerRef: true,
          createdAt: true,
          completedAt: true,
        },
      });
      return mapRefund(row);
    } catch (error) {
      if (isPostgresError(error, '23514')) {
        throw new ConflictAppError({ code: 'REFUND_EXCEEDS_REMAINING' });
      }
      throw error;
    }
  }

  async markRefundOutcome(
    input: Readonly<{
      refundId: string;
      status: 'REQUESTED' | 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
      providerRef: string | null;
      completedAt: Date | null;
    }>,
    transaction: TransactionContext,
  ): Promise<RefundRecord> {
    try {
      const row = await asPrismaTransaction(transaction).refund.update({
        where: { id: input.refundId },
        data: {
          status: input.status,
          providerRef: input.providerRef,
          completedAt: input.completedAt,
        },
        select: {
          id: true,
          orderId: true,
          paymentId: true,
          amountMinor: true,
          reason: true,
          status: true,
          requestedBy: true,
          providerRef: true,
          createdAt: true,
          completedAt: true,
        },
      });
      return mapRefund(row);
    } catch (error) {
      if (isPostgresError(error, '23514')) {
        throw new ConflictAppError({ code: 'REFUND_EXCEEDS_REMAINING' });
      }
      throw error;
    }
  }

  async syncOrderRefundTotals(
    orderId: string,
    paymentId: string,
    transaction: TransactionContext,
  ): Promise<void> {
    const client = asPrismaTransaction(transaction);
    const completed = await client.refund.aggregate({
      where: { orderId, status: 'COMPLETED' },
      _sum: { amountMinor: true },
    });
    const refundedTotalMinor = completed._sum.amountMinor ?? 0n;
    const order = await client.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { grandTotalMinor: true },
    });
    const nextStatus: 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' =
      refundedTotalMinor >= order.grandTotalMinor
        ? 'REFUNDED'
        : refundedTotalMinor > 0n
          ? 'PARTIALLY_REFUNDED'
          : 'PAID';
    await client.order.update({
      where: { id: orderId },
      data: {
        refundedTotalMinor,
        paymentStatus: nextStatus,
        ...(nextStatus === 'REFUNDED' ? { status: 'REFUNDED' as const } : {}),
      },
    });
    await client.payment.updateMany({
      where: { id: paymentId, status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
      data: { status: nextStatus },
    });
    if (nextStatus !== 'PAID') {
      await client.outboxEvent.create({
        data: {
          id: randomUUID(),
          aggregateType: 'order',
          aggregateId: orderId,
          eventType: nextStatus === 'REFUNDED' ? 'payment.refunded' : 'payment.partially_refunded',
          payload: { orderId, refundedTotalMinor: refundedTotalMinor.toString(), version: 1 },
        },
      });
    }
  }

  close(): Promise<void> {
    return this.#client.$disconnect();
  }
}
