import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { Queue, QueueEvents, Worker, type Job } from 'bullmq';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  JOB_NAMES,
  FakePaymentProvider,
  QUEUE_NAMES,
  PrismaJobFailureRepository,
  PrismaOutboxDispatchRepository,
  SitemapRevalidationService,
  decodeJobEnvelope,
  createJobEnvelope,
  deterministicJobId,
  type CatalogRevalidationInput,
  type SitemapRevalidationInput,
  type SitemapRevalidationPort,
} from '@honey/backend';

import { OutboxDispatcher, type JobEnqueuePort } from './outbox-dispatcher.js';
import { routeOutboxEvent } from './outbox-routing.js';
import { loadWorkerConfig } from './config.js';
import { producerConnectionOptions, redisConnectionOptions } from './redis-connection.js';
import { WorkerRuntime } from './runtime.js';

const execFileAsync = promisify(execFile);
const dbDirectory = fileURLToPath(new URL('../../../packages/db/', import.meta.url));
const prismaCli = fileURLToPath(
  new URL('../../../packages/db/node_modules/prisma/build/index.js', import.meta.url),
);
const redisUrl = process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379';

type TemporaryDatabase = Readonly<{ adminUrl: string; databaseName: string; databaseUrl: string }>;

async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const base = new URL(
    process.env['DATABASE_URL'] ??
      'postgresql://honey_local:replace-with-local-development-password@127.0.0.1:5432/honey_local',
  );
  if (!['localhost', '127.0.0.1'].includes(base.hostname)) {
    throw new Error('Phase 16 integration tests require local PostgreSQL.');
  }
  const databaseName = `honey_phase16_transport_${randomUUID().replaceAll('-', '')}`;
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

class CapturingRevalidationPort implements SitemapRevalidationPort {
  readonly catalog: CatalogRevalidationInput[] = [];
  revalidateSitemap(_input: SitemapRevalidationInput): Promise<void> {
    return Promise.resolve();
  }
  revalidateCatalog(input: CatalogRevalidationInput): Promise<void> {
    this.catalog.push(input);
    return Promise.resolve();
  }
}

describe('Phase 16 PostgreSQL outbox to real Redis', () => {
  let database: TemporaryDatabase;
  let sql: Client;
  let first: PrismaOutboxDispatchRepository;
  let second: PrismaOutboxDispatchRepository;
  let failures: PrismaJobFailureRepository;

  async function append(
    eventType = 'catalog.product.published',
    eventVersion = 1,
  ): Promise<string> {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO outbox_event
       (id, aggregate_type, aggregate_id, event_type, event_version, payload, occurred_at, next_attempt_at)
       VALUES ($1::uuid, 'product', $2::uuid, $3, $4, '{}'::jsonb, now(), now() - interval '1 second')`,
      [id, randomUUID(), eventType, eventVersion],
    );
    return id;
  }

  async function withQueue(
    work: (
      queue: Queue<unknown, unknown, string>,
      events: QueueEvents,
      prefix: string,
    ) => Promise<void>,
  ): Promise<void> {
    const prefix = `phase16-pg-redis-${randomUUID().replaceAll('-', '')}`;
    const queue = new Queue<unknown, unknown, string>('cache', {
      connection: {
        ...producerConnectionOptions(redisUrl),
        connectTimeout: 1_000,
        retryStrategy: () => null,
      },
      prefix,
    });
    const events = new QueueEvents('cache', {
      connection: {
        ...redisConnectionOptions(redisUrl),
        connectTimeout: 1_000,
        retryStrategy: () => null,
      },
      prefix,
    });
    try {
      await Promise.all([queue.waitUntilReady(), events.waitUntilReady()]);
      await work(queue, events, prefix);
    } finally {
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }

  function enqueuer(queue: Queue<unknown, unknown, string>): JobEnqueuePort {
    return {
      add: async ({ queue: target, name, data, jobId }) => {
        if (target !== 'cache') throw new Error('Unexpected queue in catalog integration test.');
        await queue.add(name, data, { jobId });
      },
    };
  }

  beforeAll(async () => {
    database = await createTemporaryDatabase();
    await migrate(database.databaseUrl);
    sql = new Client({ connectionString: database.databaseUrl, connectionTimeoutMillis: 10_000 });
    await sql.connect();
    first = new PrismaOutboxDispatchRepository(database.databaseUrl);
    second = new PrismaOutboxDispatchRepository(database.databaseUrl);
    failures = new PrismaJobFailureRepository(database.databaseUrl);
  }, 120_000);

  afterEach(async () => {
    await sql.query('DELETE FROM outbox_event');
    await sql.query('DELETE FROM job_failure');
  });

  afterAll(async () => {
    await Promise.all([first?.close(), second?.close(), failures?.close(), sql?.end()]);
    if (database !== undefined) await dropTemporaryDatabase(database);
  }, 60_000);

  it('two dispatchers claim disjoint committed rows and enqueue one job per event', async () => {
    await withQueue(async (queue) => {
      const ids: string[] = [];
      for (let index = 0; index < 6; index += 1) ids.push(await append());
      const left = new OutboxDispatcher(first, failures, enqueuer(queue));
      const right = new OutboxDispatcher(second, failures, enqueuer(queue));
      const results = await Promise.all([left.dispatch(3), right.dispatch(3)]);
      expect(results.reduce((count, result) => count + result.enqueued, 0)).toBe(6);
      const rows = await sql.query<{ id: string; published_at: Date | null }>(
        'SELECT id, published_at FROM outbox_event',
      );
      expect(new Set(rows.rows.map((row) => row.id))).toEqual(new Set(ids));
      expect(rows.rows.every((row) => row.published_at !== null)).toBe(true);
      expect((await queue.getJobCounts('waiting'))['waiting']).toBe(6);
    });
  }, 40_000);

  it('recovers enqueue-before-confirm crash with one logical queue job and one application call', async () => {
    await withQueue(async (queue, events, prefix) => {
      const id = await append();
      const claimed = (await first.claimBatch({ limit: 1, leaseMs: 1_000 }))[0];
      expect(claimed?.id).toBe(id);
      if (claimed === undefined) throw new Error('Missing claimed fixture.');
      const routed = routeOutboxEvent(claimed);
      if (routed.disposition !== 'ENQUEUE') throw new Error('Fixture did not route.');
      await queue.add(routed.route.name, routed.route.data, { jobId: routed.route.jobId });
      // Simulate dispatcher death before markDispatched: let the DB lease expire.
      await sql.query(
        "UPDATE outbox_event SET claim_expires_at = now() - interval '1 second' WHERE id = $1::uuid",
        [id],
      );
      expect(
        (await new OutboxDispatcher(second, failures, enqueuer(queue)).dispatch(10)).enqueued,
      ).toBe(1);
      expect((await queue.getJobCounts('waiting'))['waiting']).toBe(1);
      const port = new CapturingRevalidationPort();
      const service = new SitemapRevalidationService(port);
      const worker = new Worker<unknown, unknown, string>(
        'cache',
        async (job) => {
          const decoded = decodeJobEnvelope(job.data, JOB_NAMES.catalogRevalidate);
          if (decoded.type !== JOB_NAMES.catalogRevalidate) throw new Error('Wrong job type.');
          await service.revalidateCatalog({
            ...decoded.payload,
            correlationId: decoded.correlationId,
          });
        },
        { connection: redisConnectionOptions(redisUrl), prefix, concurrency: 1 },
      );
      try {
        await worker.waitUntilReady();
        const job: Job<unknown, unknown, string> | undefined = await queue.getJob(
          routed.route.jobId,
        );
        expect(job).toBeDefined();
        if (job === undefined) throw new Error('Lost logical job.');
        await job.waitUntilFinished(events, 10_000);
        expect(port.catalog).toHaveLength(1);
        expect(
          (
            await sql.query<{ published_at: Date | null }>(
              'SELECT published_at FROM outbox_event WHERE id = $1::uuid',
              [id],
            )
          ).rows[0]?.published_at,
        ).not.toBeNull();
      } finally {
        await worker.close();
      }
    });
  }, 40_000);

  it('keeps the DB event pending through Redis enqueue failure and dispatches after recovery', async () => {
    await withQueue(async (queue) => {
      const id = await append();
      const outageQueue = new Queue<unknown, unknown, string>('cache', {
        connection: {
          ...producerConnectionOptions(redisUrl),
          host: '127.0.0.1',
          port: 1,
          connectTimeout: 500,
          retryStrategy: () => null,
        },
        prefix: `phase16-outage-${randomUUID().replaceAll('-', '')}`,
      });
      outageQueue.on('error', () => undefined);
      try {
        expect(
          (await new OutboxDispatcher(first, failures, enqueuer(outageQueue)).dispatch(10))
            .deferred,
        ).toBe(1);
      } finally {
        await outageQueue.close();
      }
      expect(
        (
          await sql.query<{ published_at: Date | null }>(
            'SELECT published_at FROM outbox_event WHERE id = $1::uuid',
            [id],
          )
        ).rows[0]?.published_at,
      ).toBeNull();
      await sql.query(
        "UPDATE outbox_event SET next_attempt_at = now() - interval '1 second' WHERE id = $1::uuid",
        [id],
      );
      expect(
        (await new OutboxDispatcher(second, failures, enqueuer(queue)).dispatch(10)).enqueued,
      ).toBe(1);
      expect((await queue.getJobCounts('waiting'))['waiting']).toBe(1);
    });
  }, 40_000);

  it('quarantines known no-consumer and unknown-version events separately', async () => {
    await withQueue(async (queue) => {
      const known = await append('order.created');
      const unknown = await append('catalog.product.published', 99);
      const result = await new OutboxDispatcher(first, failures, enqueuer(queue)).dispatch(10);
      expect(result.quarantined).toBe(2);
      const rows = await sql.query<{ id: string; last_error: string; quarantined_at: Date | null }>(
        'SELECT id, last_error, quarantined_at FROM outbox_event',
      );
      expect(rows.rows.find((row) => row.id === known)?.last_error).toBe(
        'OUTBOX_NO_ACTIVE_CONSUMER',
      );
      expect(rows.rows.find((row) => row.id === unknown)?.last_error).toBe(
        'OUTBOX_UNSUPPORTED_EVENT',
      );
      expect(rows.rows.every((row) => row.quarantined_at !== null)).toBe(true);
      expect(await failures.countUnresolvedByQueue()).toMatchObject({ outbox: 1 });
    });
  }, 40_000);

  it('runs V1 jobs through the actual Nest worker and rejects malformed jobs before application effects', async () => {
    const secret = 'phase16-local-revalidation-secret';
    const web = createServer((request, response) => {
      if (
        request.url !== '/api/bff/revalidate' ||
        request.headers.authorization !== `Bearer ${secret}`
      ) {
        response.writeHead(401).end();
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
    await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
    const address = web.address();
    if (address === null || typeof address === 'string')
      throw new Error('Test web server did not listen.');
    const prefix = `p16-${randomUUID().slice(0, 18).replaceAll('-', '')}`;
    const config = loadWorkerConfig({
      NODE_ENV: 'test',
      DATABASE_URL: database.databaseUrl,
      REDIS_URL: redisUrl,
      WORKER_QUEUE_PREFIX: prefix,
      WORKER_WEB_ORIGIN: `http://127.0.0.1:${address.port}`,
      WEB_REVALIDATE_SECRET: secret,
      BACKUP_VERIFICATION_ENABLED: 'false',
      PAYMENT_PROVIDER: 'mock',
      PAYMENT_CALLBACK_URL: 'http://127.0.0.1:3000/fa/checkout/payment-return',
      IDENTITY_SMTP_HOST: '127.0.0.1',
      IDENTITY_SMTP_PORT: '1025',
      IDENTITY_SMTP_SECURE: 'false',
      IDENTITY_EMAIL_FROM: 'phase16@example.test',
      WORKER_OUTBOX_INTERVAL_MS: '300000',
      WORKER_RESERVATION_SWEEP_INTERVAL_MS: '3600000',
      WORKER_PAYMENT_RECONCILE_INTERVAL_MS: '3600000',
      WORKER_INVENTORY_RECONCILE_INTERVAL_MS: '604800000',
      WORKER_SITEMAP_REGENERATE_INTERVAL_MS: '86400000',
    });
    const runtime = new WorkerRuntime(config);
    const inventoryQueue = new Queue<unknown, unknown, string>('inventory', {
      connection: producerConnectionOptions(redisUrl),
      prefix,
    });
    const paymentsQueue = new Queue<unknown, unknown, string>('payments', {
      connection: producerConnectionOptions(redisUrl),
      prefix,
    });
    const maintenanceQueue = new Queue<unknown, unknown, string>('maintenance', {
      connection: producerConnectionOptions(redisUrl),
      prefix,
    });
    const inventoryEvents = new QueueEvents('inventory', {
      connection: redisConnectionOptions(redisUrl),
      prefix,
    });
    const paymentsEvents = new QueueEvents('payments', {
      connection: redisConnectionOptions(redisUrl),
      prefix,
    });
    const maintenanceEvents = new QueueEvents('maintenance', {
      connection: redisConnectionOptions(redisUrl),
      prefix,
    });
    try {
      await runtime.start();
      await Promise.all([
        inventoryEvents.waitUntilReady(),
        paymentsEvents.waitUntilReady(),
        maintenanceEvents.waitUntilReady(),
      ]);
      const oldV1 = {
        version: 1,
        type: JOB_NAMES.reservationSweep,
        correlationId: 'previous-release-v1',
        occurredAt: '2026-09-30T12:00:00.000Z',
        payload: {},
      };
      const reservation = await inventoryQueue.add(JOB_NAMES.reservationSweep, oldV1, {
        jobId: 'runtime-reservation',
      });
      const reservationDuplicate = await inventoryQueue.add(JOB_NAMES.reservationSweep, oldV1, {
        jobId: 'runtime-reservation',
      });
      expect(reservationDuplicate.id).toBe(reservation.id);
      expect(await reservation.waitUntilFinished(inventoryEvents, 10_000)).toEqual({ expired: 0 });

      const payment = await paymentsQueue.add(
        JOB_NAMES.paymentReconcile,
        createJobEnvelope(JOB_NAMES.paymentReconcile, {}, 'runtime-payment'),
        { jobId: 'runtime-payment' },
      );
      await paymentsQueue.add(JOB_NAMES.paymentReconcile, payment.data, {
        jobId: 'runtime-payment',
      });
      expect(await payment.waitUntilFinished(paymentsEvents, 10_000)).toBe(0);

      const paymentFixtures = new Map<
        string,
        Readonly<{ id: string; orderId: string; kind: string }>
      >();
      for (const kind of [
        'verified',
        'amount-mismatch',
        'currency-mismatch',
        'reference-mismatch',
        'already-paid',
      ]) {
        const id = randomUUID();
        const orderId = randomUUID();
        const alreadyPaid = kind === 'already-paid';
        const providerRef = FakePaymentProvider.providerRefFor(id);
        await sql.query(
          `INSERT INTO "order"
           (id, number, email, locale_at_purchase, currency, status, payment_status,
            fulfilment_status, subtotal_minor, grand_total_minor, shipping_method_snapshot,
            shipping_address_snapshot, billing_address_snapshot)
           VALUES ($1::uuid, $2, 'phase16-payment@example.invalid', 'en', 'IRR', $3, $4,
                   'UNFULFILLED', 50000, 50000, '{"code":"STANDARD"}'::jsonb,
                   '{"country":"IR"}'::jsonb, '{"country":"IR"}'::jsonb)`,
          [
            orderId,
            `HNY-P16-${orderId}`,
            alreadyPaid ? 'PAID' : 'PENDING_PAYMENT',
            alreadyPaid ? 'PAID' : 'UNPAID',
          ],
        );
        await sql.query(
          `INSERT INTO payment
           (id, order_id, provider, status, amount_minor, currency, provider_ref, idempotency_key,
            created_at, paid_at)
           VALUES ($1::uuid, $2::uuid, 'mock', $3, 50000, 'IRR', $4, $5,
                   now() - interval '10 minutes', CASE WHEN $6::boolean THEN now() ELSE NULL END)`,
          [id, orderId, alreadyPaid ? 'PAID' : 'PENDING', providerRef, `p16-${id}`, alreadyPaid],
        );
        paymentFixtures.set(providerRef, { id, orderId, kind });
      }
      const providerStatus = vi
        .spyOn(FakePaymentProvider.prototype, 'getStatus')
        .mockImplementation(async (input) => {
          const fixture = paymentFixtures.get(input.providerRef);
          if (fixture === undefined) throw new Error('Unexpected payment fixture reference.');
          return {
            providerRef:
              fixture.kind === 'reference-mismatch'
                ? 'wrong-provider-reference'
                : input.providerRef,
            status: fixture.kind === 'already-paid' ? 'PENDING' : 'PAID',
            amountMinor: fixture.kind === 'amount-mismatch' ? 1n : input.amountMinor,
            currency: fixture.kind === 'currency-mismatch' ? 'USD' : input.currency,
            providerTxnRef: `p16-capture-${fixture.id}`,
            occurredAt: new Date(),
            source: 'RECONCILIATION',
            raw: {},
          };
        });
      try {
        const populatedData = createJobEnvelope(
          JOB_NAMES.paymentReconcile,
          {},
          'runtime-payment-populated',
        );
        const populated = await paymentsQueue.add(JOB_NAMES.paymentReconcile, populatedData, {
          jobId: 'runtime-payment-populated',
        });
        const duplicate = await paymentsQueue.add(JOB_NAMES.paymentReconcile, populatedData, {
          jobId: 'runtime-payment-populated',
        });
        expect(duplicate.id).toBe(populated.id);
        expect(await populated.waitUntilFinished(paymentsEvents, 10_000)).toBe(4);
        const replay = await paymentsQueue.add(JOB_NAMES.paymentReconcile, populatedData, {
          jobId: 'runtime-payment-second-delivery',
        });
        expect(await replay.waitUntilFinished(paymentsEvents, 10_000)).toBe(3);
        for (const fixture of paymentFixtures.values()) {
          const expected =
            fixture.kind === 'verified' || fixture.kind === 'already-paid' ? 'PAID' : 'PENDING';
          const stored = await sql.query<{ status: string; payment_status: string }>(
            'SELECT p.status, o.payment_status FROM payment p JOIN "order" o ON o.id = p.order_id WHERE p.id = $1::uuid',
            [fixture.id],
          );
          expect(stored.rows[0]).toEqual({
            status: expected,
            payment_status: expected === 'PAID' ? 'PAID' : 'UNPAID',
          });
        }
        expect(providerStatus).toHaveBeenCalledTimes(7);
        const captures = await sql.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM payment_transaction WHERE type = 'CAPTURE'",
        );
        expect(captures.rows[0]?.count).toBe('1');
        const paidEvents = await sql.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM outbox_event WHERE event_type = 'payment.paid'",
        );
        expect(paidEvents.rows[0]?.count).toBe('1');
      } finally {
        providerStatus.mockRestore();
      }

      const reconciliation = await inventoryQueue.add(
        JOB_NAMES.inventoryReconcile,
        createJobEnvelope(JOB_NAMES.inventoryReconcile, { repair: false }, 'runtime-inventory'),
        { jobId: 'runtime-inventory' },
      );
      await inventoryQueue.add(JOB_NAMES.inventoryReconcile, reconciliation.data, {
        jobId: 'runtime-inventory',
      });
      expect(await reconciliation.waitUntilFinished(inventoryEvents, 10_000)).toMatchObject({
        drifted: false,
        repaired: false,
      });

      const productId = randomUUID();
      const stockLocationId = randomUUID();
      const variantIds = Array.from({ length: 105 }, () => randomUUID()).sort();
      const itemIds = variantIds.map(() => randomUUID());
      const lastVariantId = variantIds[104];
      const pageCursorVariantId = variantIds[99];
      if (lastVariantId === undefined || pageCursorVariantId === undefined) {
        throw new Error('Inventory page fixture is incomplete.');
      }
      await sql.query(
        "INSERT INTO product (id, sku, sourcing_type) VALUES ($1::uuid, $2, 'OWN_PRODUCTION')",
        [productId, `P16-PAGED-${productId}`],
      );
      await sql.query(
        "INSERT INTO stock_location (id, code, name, type) VALUES ($1::uuid, $2, 'Phase 16 page fixture', 'WAREHOUSE')",
        [stockLocationId, `P16-${stockLocationId}`],
      );
      await sql.query(
        `INSERT INTO product_variant
         (id, product_id, sku, net_weight_grams, jar_size_label_key,
          packaging_type_key, weight_grams_shipping, dimensions_mm)
         SELECT variant.id, $1::uuid, 'P16-V-' || variant.id::text, 450,
                'jar.450g', 'packaging.glass', 700, ARRAY[85, 85, 120]
         FROM unnest($2::uuid[]) AS variant(id)`,
        [productId, variantIds],
      );
      await sql.query(
        `INSERT INTO inventory_item (id, variant_id, stock_location_id, on_hand)
         SELECT item.id, item.variant_id, $3::uuid,
                CASE WHEN item.variant_id = $4::uuid THEN 1 ELSE 0 END
         FROM unnest($1::uuid[], $2::uuid[]) AS item(variant_id, id)`,
        [variantIds, itemIds, stockLocationId, lastVariantId],
      );
      const paged = await inventoryQueue.add(
        JOB_NAMES.inventoryReconcile,
        createJobEnvelope(
          JOB_NAMES.inventoryReconcile,
          { repair: false },
          'runtime-inventory-pages',
        ),
        { jobId: 'runtime-inventory-paged' },
      );
      expect(await paged.waitUntilFinished(inventoryEvents, 10_000)).toMatchObject({
        drifted: false,
        driftCount: 0,
        hasMore: true,
      });
      const continuationHash = createHash('sha256')
        .update(JSON.stringify([paged.id, pageCursorVariantId, stockLocationId]))
        .digest('hex')
        .slice(0, 32);
      const continuationId = deterministicJobId({
        type: JOB_NAMES.inventoryReconcile,
        key: `page-${continuationHash}`,
      });
      const continuation = await inventoryQueue.getJob(continuationId);
      expect(continuation).toBeDefined();
      if (continuation === undefined) throw new Error('Inventory continuation was not enqueued.');
      expect(await continuation.waitUntilFinished(inventoryEvents, 10_000)).toMatchObject({
        drifted: true,
        driftCount: 1,
        hasMore: false,
      });

      const malformed = await maintenanceQueue.add(
        JOB_NAMES.sitemapRegenerate,
        {
          ...createJobEnvelope(JOB_NAMES.sitemapRegenerate, { locale: 'fa' }, 'runtime-malformed'),
          payload: { locale: 'fa', url: 'https://arbitrary.example.test' },
        },
        { jobId: 'runtime-malformed' },
      );
      await expect(malformed.waitUntilFinished(maintenanceEvents, 10_000)).rejects.toThrow(
        'MALFORMED_JOB',
      );
      const backup = await maintenanceQueue.add(
        JOB_NAMES.backupVerify,
        createJobEnvelope(JOB_NAMES.backupVerify, {}, 'runtime-backup'),
        { jobId: 'runtime-backup' },
      );
      await expect(backup.waitUntilFinished(maintenanceEvents, 10_000)).rejects.toThrow(
        'BACKUP_CAPABILITY_DISABLED',
      );
      const schedulers = await maintenanceQueue.getJobSchedulers();
      expect(schedulers.some((scheduler) => scheduler.name === JOB_NAMES.backupVerify)).toBe(false);
      await runtime.close();
      const failedRows = await sql.query<{ error_code: string; payload: unknown }>(
        "SELECT error_code, payload FROM job_failure WHERE queue = 'maintenance' AND error_code IN ('MALFORMED_JOB', 'BACKUP_CAPABILITY_DISABLED')",
      );
      expect(new Set(failedRows.rows.map((row) => row.error_code))).toEqual(
        new Set(['MALFORMED_JOB', 'BACKUP_CAPABILITY_DISABLED']),
      );
      expect(failedRows.rows.every((row) => JSON.stringify(row.payload) === '{}')).toBe(true);
    } finally {
      await runtime.close();
      await Promise.all([
        inventoryEvents.close(),
        paymentsEvents.close(),
        maintenanceEvents.close(),
      ]);
      await Promise.all([inventoryQueue.close(), paymentsQueue.close(), maintenanceQueue.close()]);
      for (const name of QUEUE_NAMES) {
        const cleanup = new Queue(name, {
          connection: producerConnectionOptions(redisUrl),
          prefix,
        });
        try {
          await cleanup.obliterate({ force: true });
        } finally {
          await cleanup.close();
        }
      }
      await new Promise<void>((resolve) => web.close(() => resolve()));
    }
  }, 60_000);
});
