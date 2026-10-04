import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createPrismaClient, type PrismaClient } from '@honey/db';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PaymentsService } from '../src/modules/payments/application/payments.service.js';
import { PrismaPaymentsRepository } from '../src/modules/payments/infrastructure/prisma-payments.repository.js';
import { FakePaymentProvider } from '../src/modules/payments/infrastructure/providers/fake-payment-provider.js';
import { PrismaPlatformAdapter } from '../src/platform/infrastructure/prisma-platform.adapter.js';

const execFileAsync = promisify(execFile);
const dbDirectory = fileURLToPath(new URL('../../db/', import.meta.url));
const prismaCli = fileURLToPath(
  new URL('../../db/node_modules/prisma/build/index.js', import.meta.url),
);

type TemporaryDatabase = Readonly<{ adminUrl: string; databaseName: string; databaseUrl: string }>;

async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const base = new URL(
    process.env['DATABASE_URL'] ??
      'postgresql://honey_local:replace-with-local-development-password@127.0.0.1:5432/honey_local',
  );
  const databaseName = `honey_phase14_${randomUUID().replaceAll('-', '')}`;
  if (!/^honey_phase14_[a-f0-9]{32}$/u.test(databaseName)) throw new Error('Unsafe database name.');
  const admin = new URL(base);
  admin.pathname = '/postgres';
  const target = new URL(base);
  target.pathname = `/${databaseName}`;
  const client = new Client({
    connectionString: admin.toString(),
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
  } finally {
    await client.end();
  }
  return { adminUrl: admin.toString(), databaseName, databaseUrl: target.toString() };
}

async function migrate(databaseUrl: string): Promise<void> {
  await execFileAsync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--config', 'prisma.config.ts'],
    {
      cwd: dbDirectory,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      windowsHide: true,
      timeout: 120_000,
    },
  );
}

async function dropTemporaryDatabase(database: TemporaryDatabase): Promise<void> {
  const client = new Client({
    connectionString: database.adminUrl,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    await client.query(`DROP DATABASE "${database.databaseName}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
}

describe('Phase 14 payments on PostgreSQL', () => {
  let database: TemporaryDatabase;
  let prisma: PrismaClient;
  let repository: PrismaPaymentsRepository;
  let platform: PrismaPlatformAdapter;
  let provider: FakePaymentProvider;
  let service: PaymentsService;
  let orderSeq = 500;

  function nextNumber(): string {
    orderSeq += 1;
    return `HNY-2026-${String(orderSeq).padStart(6, '0')}`;
  }

  async function seedGuestOrder(
    anonymousId: string,
    overrides: Readonly<{ amountMinor?: bigint; userId?: string }> = {},
  ): Promise<Readonly<{ orderId: string; number: string }>> {
    const cartId = randomUUID();
    const checkoutId = randomUUID();
    const orderId = randomUUID();
    const number = nextNumber();
    const amount = overrides.amountMinor ?? 50_000n;
    await prisma.cart.create({
      data: {
        id: cartId,
        ...(overrides.userId === undefined ? { anonymousId } : { userId: overrides.userId }),
        currency: 'IRR',
        locale: 'en',
        status: 'CONVERTED',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.checkoutSession.create({
      data: {
        id: checkoutId,
        cartId,
        ...(overrides.userId === undefined ? {} : { userId: overrides.userId }),
        email: `phase14-${anonymousId}@example.invalid`,
        status: 'AWAITING_PAYMENT',
        idempotencyKey: `checkout-${checkoutId}`,
      },
    });
    await prisma.order.create({
      data: {
        id: orderId,
        number,
        checkoutSessionId: checkoutId,
        ...(overrides.userId === undefined ? {} : { userId: overrides.userId }),
        email: `phase14-${anonymousId}@example.invalid`,
        localeAtPurchase: 'en',
        currency: 'IRR',
        status: 'PENDING_PAYMENT',
        paymentStatus: 'UNPAID',
        fulfilmentStatus: 'UNFULFILLED',
        subtotalMinor: amount,
        grandTotalMinor: amount,
        shippingMethodSnapshot: { code: 'STANDARD' },
        shippingAddressSnapshot: { country: 'IR' },
        billingAddressSnapshot: { country: 'IR' },
      },
    });
    return { orderId, number };
  }

  beforeAll(async () => {
    database = await createTemporaryDatabase();
    await migrate(database.databaseUrl);
    prisma = createPrismaClient({ databaseUrl: database.databaseUrl });
    repository = new PrismaPaymentsRepository(database.databaseUrl);
    platform = new PrismaPlatformAdapter(database.databaseUrl);
    provider = new FakePaymentProvider();
    service = new PaymentsService(
      repository,
      new Map([['mock', provider]]),
      'mock',
      platform,
      { requireStepUp: async () => undefined },
      'http://localhost:3000/en/checkout/payment-return',
      0,
    );
  }, 180_000);

  afterAll(async () => {
    await repository.close();
    await platform.close();
    await prisma.$disconnect();
    if (database !== undefined) await dropTemporaryDatabase(database);
  });

  it('replays the same start key and rejects the same key for a different order', async () => {
    const owner = { anonymousId: randomUUID() };
    const first = await seedGuestOrder(owner.anonymousId);
    const second = await seedGuestOrder(owner.anonymousId);
    const context = { userId: null, anonymousId: owner.anonymousId };
    const started = await service.start(context, first.number, 'idempotency-key-int-aaaa');
    const replayed = await service.start(context, first.number, 'idempotency-key-int-aaaa');
    expect(replayed.replayed).toBe(true);
    expect(replayed.payment.id).toBe(started.payment.id);
    await expect(
      service.start(context, second.number, 'idempotency-key-int-aaaa'),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSE',
    });
  });

  it('serializes concurrent starts of the same order onto one payment', async () => {
    const owner = { anonymousId: randomUUID() };
    const seeded = await seedGuestOrder(owner.anonymousId);
    const context = { userId: null, anonymousId: owner.anonymousId };
    const [left, right] = await Promise.allSettled([
      service.start(context, seeded.number, 'idempotency-key-int-bbbb'),
      service.start(context, seeded.number, 'idempotency-key-int-cccc'),
    ]);
    const succeeded = [left, right].filter((result) => result.status === 'fulfilled');
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    const payments = await prisma.payment.findMany({ where: { orderId: seeded.orderId } });
    expect(payments).toHaveLength(1);
  });

  it('does not pay a forged return when the provider reports FAILED', async () => {
    const owner = { anonymousId: randomUUID() };
    const seeded = await seedGuestOrder(owner.anonymousId);
    const context = { userId: null, anonymousId: owner.anonymousId };
    const started = await service.start(context, seeded.number, 'idempotency-key-int-dddd');
    provider.setOutcome(FakePaymentProvider.providerRefFor(started.payment.id), {
      status: 'FAILED',
    });
    const verified = await service.verifyReturn(context, started.payment.id);
    expect(verified.status).toBe('FAILED');
    const order = await prisma.order.findUniqueOrThrow({ where: { id: seeded.orderId } });
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.paymentStatus).toBe('UNPAID');
    expect(order.fulfilmentStatus).toBe('UNFULFILLED');
    expect(await prisma.stockReservation.count({ where: { orderId: seeded.orderId } })).toBe(0);
    expect(await prisma.stockLedgerEntry.count()).toBe(0);
    expect(
      await prisma.paymentTransaction.count({ where: { paymentId: started.payment.id } }),
    ).toBe(0);
    expect(
      await prisma.outboxEvent.count({
        where: { eventType: 'payment.paid', aggregateId: seeded.orderId },
      }),
    ).toBe(0);
  });

  it('lets concurrent return and reconciliation apply PAID only once', async () => {
    const owner = { anonymousId: randomUUID() };
    const seeded = await seedGuestOrder(owner.anonymousId);
    const context = { userId: null, anonymousId: owner.anonymousId };
    const started = await service.start(context, seeded.number, 'idempotency-key-int-eeee');
    const providerRef = FakePaymentProvider.providerRefFor(started.payment.id);
    provider.setOutcome(providerRef, { status: 'PAID', providerTxnRef: 'txn-int-1' });
    await Promise.all([
      service.verifyReturn(context, started.payment.id),
      service.reconcile(started.payment.id),
    ]);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: started.payment.id } });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: seeded.orderId } });
    expect(payment.status).toBe('PAID');
    expect(order.status).toBe('PAID');
    expect(order.paymentStatus).toBe('PAID');
    expect(order.fulfilmentStatus).toBe('UNFULFILLED');
    expect(order.grandTotalMinor).toBe(50_000n);
    expect(
      await prisma.paymentTransaction.count({
        where: { paymentId: started.payment.id, type: 'CAPTURE' },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { eventType: 'payment.paid', aggregateId: seeded.orderId },
      }),
    ).toBe(1);
  });

  it('deduplicates a provider transaction and ignores a late PENDING', async () => {
    const owner = { anonymousId: randomUUID() };
    const seeded = await seedGuestOrder(owner.anonymousId);
    const context = { userId: null, anonymousId: owner.anonymousId };
    const started = await service.start(context, seeded.number, 'idempotency-key-int-ffff');
    const providerRef = FakePaymentProvider.providerRefFor(started.payment.id);
    provider.setOutcome(providerRef, { status: 'PAID', providerTxnRef: 'txn-int-2' });
    await service.verifyReturn(context, started.payment.id);
    await service.reconcile(started.payment.id);
    provider.setOutcome(providerRef, { status: 'PENDING' });
    await service.reconcile(started.payment.id);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: started.payment.id } });
    expect(payment.status).toBe('PAID');
    expect(
      await prisma.paymentTransaction.count({ where: { paymentId: started.payment.id } }),
    ).toBe(1);
  });

  it('records mismatch alerts instead of paying', async () => {
    const owner = { anonymousId: randomUUID() };
    const seeded = await seedGuestOrder(owner.anonymousId);
    const context = { userId: null, anonymousId: owner.anonymousId };
    const started = await service.start(context, seeded.number, 'idempotency-key-int-gggg');
    const providerRef = FakePaymentProvider.providerRefFor(started.payment.id);
    provider.setOutcome(providerRef, { status: 'PAID', amountMinor: 1n });
    await service.verifyReturn(context, started.payment.id);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: seeded.orderId } });
    expect(order.paymentStatus).toBe('UNPAID');
    expect(
      await prisma.outboxEvent.count({ where: { eventType: 'payment.reconciliation_mismatch' } }),
    ).toBeGreaterThan(0);
    expect(
      await prisma.auditLog.count({ where: { action: 'payment.amount_mismatch' } }),
    ).toBeGreaterThan(0);
  });

  it('persists webhook events, rejects invalid signatures, and deduplicates event ids', async () => {
    const owner = { anonymousId: randomUUID() };
    const seeded = await seedGuestOrder(owner.anonymousId);
    const context = { userId: null, anonymousId: owner.anonymousId };
    const started = await service.start(context, seeded.number, 'idempotency-key-int-hhhh');
    const providerRef = FakePaymentProvider.providerRefFor(started.payment.id);
    provider.setOutcome(providerRef, { status: 'PAID', providerTxnRef: 'txn-int-3' });
    const valid = provider.signedWebhook(providerRef, { eventId: 'evt-int-1', status: 'PAID' });
    const first = await service.receiveWebhook('mock', valid);
    await service.processProviderEvent(first.id);
    const replay = await service.receiveWebhook('mock', valid);
    await service.processProviderEvent(replay.id);
    expect(replay.id).toBe(first.id);
    const invalid = provider.signedWebhook(providerRef, { eventId: 'evt-int-2', signature: '00' });
    const rejected = await service.receiveWebhook('mock', invalid);
    await service.processProviderEvent(rejected.id);
    const stored = await prisma.providerEvent.findUniqueOrThrow({ where: { id: rejected.id } });
    expect(stored.signatureValid).toBe(false);
    expect(await prisma.payment.count({ where: { orderId: seeded.orderId, status: 'PAID' } })).toBe(
      1,
    );
  });

  it('caps concurrent refunds at the remaining amount', async () => {
    const userId = randomUUID();
    await prisma.user.create({
      data: { id: userId, email: `phase14-staff-${userId}@example.invalid`, preferredLocale: 'en' },
    });
    const owner = { anonymousId: randomUUID() };
    const seeded = await seedGuestOrder(owner.anonymousId, { userId });
    const context = { userId, anonymousId: null };
    const started = await service.start(context, seeded.number, 'idempotency-key-int-iiii');
    provider.setOutcome(FakePaymentProvider.providerRefFor(started.payment.id), {
      status: 'PAID',
      providerTxnRef: 'txn-int-4',
    });
    await service.verifyReturn(context, started.payment.id);
    const actor = { userId, sessionId: randomUUID() };
    const [left, right] = await Promise.allSettled([
      service.requestRefund(
        started.payment.id,
        { amountMinor: null, reason: 'first concurrent refund' },
        actor,
      ),
      service.requestRefund(
        started.payment.id,
        { amountMinor: null, reason: 'second concurrent refund' },
        actor,
      ),
    ]);
    const completed = [left, right].filter((result) => result.status === 'fulfilled');
    const rejected = [left, right].filter((result) => result.status === 'rejected');
    expect(completed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: seeded.orderId } });
    expect(order.refundedTotalMinor).toBe(50_000n);
    expect(order.grandTotalMinor).toBe(50_000n);
    expect(order.status).toBe('REFUNDED');
    expect(await prisma.stockLedgerEntry.count()).toBe(0);
  });
});
