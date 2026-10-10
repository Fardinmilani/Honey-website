import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { Queue, QueueEvents, Worker, type Job } from 'bullmq';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  JOB_NAMES,
  QUEUE_NAMES,
  createJobEnvelope,
  decodeJobEnvelope,
  deterministicJobId,
} from '@honey/backend';

import { loadWorkerConfig } from './config.js';
import { RETRY_POLICY } from './failure-policy.js';
import { producerConnectionOptions, redisConnectionOptions } from './redis-connection.js';
import { WorkerRuntime } from './runtime.js';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379';
const stalledChild = fileURLToPath(new URL('./fixtures/stalled-worker-child.mjs', import.meta.url));
const execFileAsync = promisify(execFile);
const dbDirectory = fileURLToPath(new URL('../../../packages/db/', import.meta.url));
const prismaCli = fileURLToPath(
  new URL('../../../packages/db/node_modules/prisma/build/index.js', import.meta.url),
);
const connection = {
  ...redisConnectionOptions(redisUrl),
  connectTimeout: 1_000,
  retryStrategy: () => null,
};

async function withIsolatedRedis(
  test: (
    queue: Queue<unknown, unknown, string>,
    events: QueueEvents,
    prefix: string,
  ) => Promise<void>,
): Promise<void> {
  const prefix = `phase16-test-${randomUUID().replaceAll('-', '')}`;
  const queue = new Queue<unknown, unknown, string>('inventory', { connection, prefix });
  const events = new QueueEvents('inventory', { connection, prefix });
  try {
    await Promise.all([queue.waitUntilReady(), events.waitUntilReady()]);
    await test(queue, events, prefix);
  } finally {
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
  }
}

describe('real Redis BullMQ behavior', () => {
  it('deduplicates a logical V1 job across two producer calls and two worker instances', async () => {
    await withIsolatedRedis(async (queue, events, prefix) => {
      let calls = 0;
      const workerA = new Worker<unknown, unknown, string>(
        'inventory',
        async (job) => {
          const decoded = decodeJobEnvelope(job.data, JOB_NAMES.reservationSweep);
          expect(decoded.type).toBe(JOB_NAMES.reservationSweep);
          calls += 1;
          return 'done';
        },
        { connection, prefix, concurrency: 1 },
      );
      const workerB = new Worker<unknown, unknown, string>(
        'inventory',
        async (job) => {
          decodeJobEnvelope(job.data, JOB_NAMES.reservationSweep);
          calls += 1;
          return 'done';
        },
        { connection, prefix, concurrency: 1 },
      );
      try {
        await Promise.all([workerA.waitUntilReady(), workerB.waitUntilReady()]);
        const data = createJobEnvelope(JOB_NAMES.reservationSweep, {}, 'old-release-v1');
        const jobId = deterministicJobId({ type: JOB_NAMES.reservationSweep, key: 'fixed-logic' });
        const first = await queue.add(JOB_NAMES.reservationSweep, data, { jobId, ...RETRY_POLICY });
        const duplicate = await queue.add(JOB_NAMES.reservationSweep, data, {
          jobId,
          ...RETRY_POLICY,
        });
        expect(duplicate.id).toBe(first.id);
        expect(await first.waitUntilFinished(events, 10_000)).toBe('done');
        expect(calls).toBe(1);
      } finally {
        await Promise.all([workerA.close(), workerB.close()]);
      }
    });
  }, 20_000);

  it('upserts one repeatable schedule after repeated registration', async () => {
    await withIsolatedRedis(async (queue) => {
      const template = {
        name: JOB_NAMES.reservationSweep,
        data: createJobEnvelope(JOB_NAMES.reservationSweep, {}, 'scheduler-test'),
        opts: RETRY_POLICY,
      };
      await queue.upsertJobScheduler('scheduler-fixed', { every: 60_000 }, template);
      await queue.upsertJobScheduler('scheduler-fixed', { every: 60_000 }, template);
      const schedulers = await queue.getJobSchedulers();
      expect(schedulers.map((scheduler) => scheduler.key)).toEqual(['scheduler-fixed']);
      await queue.removeJobScheduler('scheduler-fixed');
    });
  }, 20_000);

  it('honors bounded exponential retry and retains the terminal failed job', async () => {
    await withIsolatedRedis(async (queue, events, prefix) => {
      let attempts = 0;
      const worker = new Worker(
        'inventory',
        () => {
          attempts += 1;
          throw new Error('NETWORK_UNAVAILABLE');
        },
        { connection, prefix, concurrency: 1 },
      );
      try {
        await worker.waitUntilReady();
        const job = await queue.add(
          JOB_NAMES.reservationSweep,
          createJobEnvelope(JOB_NAMES.reservationSweep, {}, 'retry-test'),
          {
            jobId: 'retry-fixed',
            attempts: 3,
            backoff: { type: 'exponential', delay: 50, jitter: 0.25 },
            removeOnFail: false,
          },
        );
        await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow('NETWORK_UNAVAILABLE');
        expect(attempts).toBe(3);
        expect(await job.getState()).toBe('failed');
      } finally {
        await worker.close();
      }
    });
  }, 20_000);

  it('waits for active work during graceful close and leaves the job completed', async () => {
    await withIsolatedRedis(async (queue, events, prefix) => {
      let started: () => void = () => undefined;
      const startedPromise = new Promise<void>((resolve) => {
        started = resolve;
      });
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const worker = new Worker<unknown, unknown, string>(
        'inventory',
        async () => {
          started();
          await gate;
          return 'complete';
        },
        { connection, prefix, concurrency: 1 },
      );
      await worker.waitUntilReady();
      const job: Job<unknown, unknown, string> = await queue.add(
        JOB_NAMES.reservationSweep,
        createJobEnvelope(JOB_NAMES.reservationSweep, {}, 'shutdown-test'),
      );
      await startedPromise;
      const closing = worker.close();
      release();
      await closing;
      expect(await job.waitUntilFinished(events, 10_000)).toBe('complete');
      expect(await job.getState()).toBe('completed');
    });
  }, 20_000);

  it('redelivers an active job after process death and applies its idempotent effect once', async () => {
    await withIsolatedRedis(async (queue, events, prefix) => {
      const effectKey = `${prefix}:effect`;
      const deliveryKey = `${prefix}:deliveries`;
      const child = spawn(
        process.execPath,
        [stalledChild, redisUrl, prefix, effectKey, deliveryKey],
        {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      const childExited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.stderr.on('data', () => undefined);
      const active = new Promise<void>((resolve, reject) => {
        let output = '';
        const timer = setTimeout(
          () => reject(new Error('Fixture worker did not start its job.')),
          10_000,
        );
        const done = (): void => clearTimeout(timer);
        child.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes('ACTIVE\n')) {
            done();
            resolve();
          }
        });
        child.once('exit', () => {
          done();
          reject(new Error('Fixture worker exited before active job.'));
        });
      });
      let restarted: Worker<unknown, unknown, string> | undefined;
      try {
        const job = await queue.add(
          JOB_NAMES.reservationSweep,
          createJobEnvelope(JOB_NAMES.reservationSweep, {}, 'process-restart-test'),
          { jobId: 'process-restart-fixed', removeOnComplete: false },
        );
        await active;
        const client = await queue.client;
        expect(await client.get(effectKey)).toBe('applied');
        expect(await client.get(deliveryKey)).toBe('1');
        expect(child.kill('SIGKILL')).toBe(true);
        await childExited;

        restarted = new Worker<unknown, unknown, string>(
          'inventory',
          async (redelivered) => {
            decodeJobEnvelope(redelivered.data, JOB_NAMES.reservationSweep);
            client.defineCommand('phase16ApplyOnce', {
              numberOfKeys: 2,
              lua: "redis.call('INCR', KEYS[2]); return redis.call('SETNX', KEYS[1], 'applied')",
            });
            await client.runCommand('phase16ApplyOnce', [effectKey, deliveryKey]);
            return 'replayed';
          },
          {
            connection,
            prefix,
            concurrency: 1,
            lockDuration: 1_000,
            stalledInterval: 500,
            maxStalledCount: 2,
          },
        );
        await restarted.waitUntilReady();
        expect(await job.waitUntilFinished(events, 20_000)).toBe('replayed');
        expect(await job.getState()).toBe('completed');
        expect(await client.get(deliveryKey)).toBe('2');
        expect(await client.get(effectKey)).toBe('applied');
      } finally {
        if (child.exitCode === null) child.kill('SIGKILL');
        await childExited;
        if (restarted !== undefined) await restarted.close();
        const client = await queue.client;
        await client.del(effectKey, deliveryKey);
      }
    });
  }, 40_000);
});

describe('actual worker retry and terminal capture with PostgreSQL and Redis', () => {
  let databaseUrl: string;
  let databaseName: string;
  let adminUrl: string;
  let sql: Client;

  beforeAll(async () => {
    const base = new URL(
      process.env['DATABASE_URL'] ??
        'postgresql://honey_local:replace-with-local-development-password@127.0.0.1:5432/honey_local',
    );
    if (!['localhost', '127.0.0.1'].includes(base.hostname)) {
      throw new Error('Phase 16 integration tests require local PostgreSQL.');
    }
    databaseName = `honey_phase16_retry_${randomUUID().replaceAll('-', '')}`;
    const admin = new URL(base);
    admin.pathname = '/postgres';
    adminUrl = admin.toString();
    const target = new URL(base);
    target.pathname = `/${databaseName}`;
    databaseUrl = target.toString();
    const adminClient = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 10_000 });
    await adminClient.connect();
    try {
      await adminClient.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    } finally {
      await adminClient.end();
    }
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
    sql = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
    await sql.connect();
  }, 120_000);

  afterAll(async () => {
    await sql?.end();
    if (adminUrl === undefined || databaseName === undefined) return;
    const adminClient = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 10_000 });
    await adminClient.connect();
    try {
      await adminClient.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 60_000);

  async function withRuntime(
    catalogStatus: (attempt: number) => number,
    run: (scope: {
      cache: Queue<unknown, unknown, string>;
      maintenance: Queue<unknown, unknown, string>;
      cacheEvents: QueueEvents;
      maintenanceEvents: QueueEvents;
      catalogCalls: () => number;
      alertLines: () => string[];
    }) => Promise<void>,
  ): Promise<void> {
    let catalogCalls = 0;
    const web = createServer((request, response) => {
      if (request.url !== '/api/bff/revalidate') {
        response.writeHead(404).end();
        return;
      }
      let body = '';
      request.on('data', (part: Buffer) => {
        body += part.toString();
      });
      request.on('end', () => {
        const isCatalog = body.includes('"scope":"catalog"');
        const status = isCatalog ? catalogStatus(++catalogCalls) : 200;
        response.writeHead(status, { 'content-type': 'application/json' }).end('{}');
      });
    });
    await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
    const address = web.address();
    if (address === null || typeof address === 'string')
      throw new Error('Web fixture did not listen.');
    const prefix = `p16-${randomUUID().slice(0, 18).replaceAll('-', '')}`;
    const config = loadWorkerConfig({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      WORKER_QUEUE_PREFIX: prefix,
      WORKER_WEB_ORIGIN: `http://127.0.0.1:${address.port}`,
      WEB_REVALIDATE_SECRET: 'phase16-local-revalidation-secret',
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
    const cache = new Queue<unknown, unknown, string>('cache', {
      connection: producerConnectionOptions(redisUrl),
      prefix,
    });
    const maintenance = new Queue<unknown, unknown, string>('maintenance', {
      connection: producerConnectionOptions(redisUrl),
      prefix,
    });
    const cacheEvents = new QueueEvents('cache', { connection, prefix });
    const maintenanceEvents = new QueueEvents('maintenance', { connection, prefix });
    const write = vi.spyOn(process.stdout, 'write');
    try {
      await runtime.start();
      await Promise.all([cacheEvents.waitUntilReady(), maintenanceEvents.waitUntilReady()]);
      await run({
        cache,
        maintenance,
        cacheEvents,
        maintenanceEvents,
        catalogCalls: () => catalogCalls,
        alertLines: () =>
          write.mock.calls
            .map(([chunk]) => String(chunk))
            .filter((line) => line.includes('"event":"worker.dead_letter_alert"')),
      });
    } finally {
      await runtime.close();
      write.mockRestore();
      await Promise.all([cacheEvents.close(), maintenanceEvents.close()]);
      await Promise.all([cache.close(), maintenance.close()]);
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
  }

  it('retries a transient application-port failure and succeeds without a dead letter', async () => {
    await withRuntime(
      (attempt) => (attempt === 1 ? 503 : 200),
      async (scope) => {
        const job = await scope.cache.add(
          JOB_NAMES.catalogRevalidate,
          createJobEnvelope(JOB_NAMES.catalogRevalidate, { scope: 'catalog' }, 'retry-success'),
          { jobId: 'transient-success', attempts: 2, backoff: { type: 'exponential', delay: 50 } },
        );
        await expect(job.waitUntilFinished(scope.cacheEvents, 10_000)).resolves.toBeNull();
        expect(scope.catalogCalls()).toBe(2);
        expect(await job.getState()).toBe('completed');
        const rows = await sql.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM job_failure WHERE queue = 'cache' AND job_id = $1",
          [`opaque-${createHash('sha256').update('transient-success').digest('hex').slice(0, 32)}`],
        );
        expect(rows.rows[0]?.count).toBe('0');
        expect(scope.alertLines()).toHaveLength(0);
      },
    );
  }, 40_000);

  it('records one redacted PostgreSQL failure and one alert after transient retries exhaust', async () => {
    await withRuntime(
      () => 503,
      async (scope) => {
        const jobId = 'transient-exhausted';
        const job = await scope.cache.add(
          JOB_NAMES.catalogRevalidate,
          createJobEnvelope(JOB_NAMES.catalogRevalidate, { scope: 'catalog' }, 'retry-exhausted'),
          {
            jobId,
            attempts: 2,
            backoff: { type: 'exponential', delay: 50 },
            removeOnFail: false,
          },
        );
        await expect(job.waitUntilFinished(scope.cacheEvents, 10_000)).rejects.toThrow(
          'WEB_REVALIDATION_UNAVAILABLE',
        );
        expect(scope.catalogCalls()).toBe(2);
        expect(await job.getState()).toBe('failed');
        const safeId = `opaque-${createHash('sha256').update(jobId).digest('hex').slice(0, 32)}`;
        await scope.maintenance
          .add(
            JOB_NAMES.deadLetterReconcile,
            createJobEnvelope(JOB_NAMES.deadLetterReconcile, {}, 'retry-capture'),
            { jobId: 'retry-capture' },
          )
          .then((reconcile) => reconcile.waitUntilFinished(scope.maintenanceEvents, 10_000));
        const rows = await sql.query<{
          attempts_made: number;
          error_code: string;
          error_class: string;
          payload: unknown;
          error: string;
        }>(
          'SELECT attempts_made, error_code, error_class, payload, error FROM job_failure WHERE queue = $1 AND job_id = $2',
          ['cache', safeId],
        );
        expect(rows.rows).toHaveLength(1);
        expect(rows.rows[0]).toMatchObject({
          attempts_made: 2,
          error_code: 'WEB_REVALIDATION_UNAVAILABLE',
          error_class: 'EXHAUSTED',
          payload: {},
          error: 'Job exhausted its bounded retry attempts.',
        });
        expect(scope.alertLines().filter((line) => line.includes('"queue":"cache"'))).toHaveLength(
          1,
        );
      },
    );
  }, 40_000);

  it('deduplicates repeated disabled backup enqueue under one logical ID and one terminal record', async () => {
    await withRuntime(
      () => 200,
      async (scope) => {
        const data = createJobEnvelope(JOB_NAMES.backupVerify, {}, 'backup-dedupe');
        const jobId = deterministicJobId({ type: JOB_NAMES.backupVerify, key: 'same-logical-run' });
        const first = await scope.maintenance.add(JOB_NAMES.backupVerify, data, {
          jobId,
          removeOnFail: false,
        });
        const duplicate = await scope.maintenance.add(JOB_NAMES.backupVerify, data, {
          jobId,
          removeOnFail: false,
        });
        expect(duplicate.id).toBe(first.id);
        await expect(first.waitUntilFinished(scope.maintenanceEvents, 10_000)).rejects.toThrow(
          'BACKUP_CAPABILITY_DISABLED',
        );
        await scope.maintenance
          .add(
            JOB_NAMES.deadLetterReconcile,
            createJobEnvelope(JOB_NAMES.deadLetterReconcile, {}, 'backup-capture'),
            { jobId: 'backup-capture' },
          )
          .then((reconcile) => reconcile.waitUntilFinished(scope.maintenanceEvents, 10_000));
        const safeId = `opaque-${createHash('sha256').update(jobId).digest('hex').slice(0, 32)}`;
        const rows = await sql.query<{ error_code: string; error_class: string }>(
          'SELECT error_code, error_class FROM job_failure WHERE queue = $1 AND job_id = $2',
          ['maintenance', safeId],
        );
        expect(rows.rows).toEqual([
          { error_code: 'BACKUP_CAPABILITY_DISABLED', error_class: 'PERMANENT' },
        ]);
        expect(
          scope
            .alertLines()
            .filter((line) => line.includes('"queue":"maintenance"') && line.includes(safeId)),
        ).toHaveLength(1);
      },
    );
  }, 40_000);
});
