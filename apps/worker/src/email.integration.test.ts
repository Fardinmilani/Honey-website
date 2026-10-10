import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { JOB_NAMES, QUEUE_NAMES, createJobEnvelope, deterministicJobId } from '@honey/backend';
import { Queue, QueueEvents } from 'bullmq';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
type ShipmentFixture = Readonly<{
  shipmentId: string;
  eventId: string;
  email: string;
  orderNumber: string;
}>;

async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const base = new URL(
    process.env['DATABASE_URL'] ??
      'postgresql://honey_local:replace-with-local-development-password@127.0.0.1:5432/honey_local',
  );
  if (!['localhost', '127.0.0.1'].includes(base.hostname)) {
    throw new Error('Phase 16 email integration requires local PostgreSQL.');
  }
  const databaseName = `honey_phase16_email_${randomUUID().replaceAll('-', '')}`;
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

class LocalSmtpServer {
  readonly messages: string[] = [];
  readonly #sockets = new Set<Socket>();
  readonly #server: Server;

  constructor() {
    this.#server = createServer((socket) => {
      this.#sockets.add(socket);
      socket.on('close', () => this.#sockets.delete(socket));
      socket.write('220 phase16-test-smtp ESMTP\r\n');
      let pending = '';
      let message = '';
      let receiving = false;
      socket.on('data', (chunk: Buffer) => {
        pending += chunk.toString('utf8');
        for (;;) {
          const end = pending.indexOf('\r\n');
          if (end < 0) break;
          const line = pending.slice(0, end);
          pending = pending.slice(end + 2);
          if (receiving) {
            if (line === '.') {
              this.messages.push(message);
              message = '';
              receiving = false;
              socket.write('250 accepted\r\n');
            } else {
              message += `${line}\r\n`;
            }
            continue;
          }
          const command = line.toUpperCase();
          if (command.startsWith('EHLO ') || command.startsWith('HELO ')) {
            socket.write('250 phase16-test-smtp\r\n');
          } else if (command.startsWith('MAIL FROM:') || command.startsWith('RCPT TO:')) {
            socket.write('250 accepted\r\n');
          } else if (command === 'DATA') {
            receiving = true;
            socket.write('354 end with <CRLF>.<CRLF>\r\n');
          } else if (command === 'RSET') {
            message = '';
            receiving = false;
            socket.write('250 reset\r\n');
          } else if (command === 'QUIT') {
            socket.end('221 bye\r\n');
          } else {
            socket.write('500 unsupported command\r\n');
          }
        }
      });
    });
  }

  async listen(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.#server.once('error', reject);
      this.#server.listen(0, '127.0.0.1', () => {
        this.#server.off('error', reject);
        resolve();
      });
    });
    const address = this.#server.address();
    if (address === null || typeof address === 'string') throw new Error('SMTP port unavailable.');
    return address.port;
  }

  async close(): Promise<void> {
    for (const socket of this.#sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => {
      this.#server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }
}

function textBody(message: string): string {
  const separator = message.indexOf('\r\n\r\n');
  if (separator < 0) throw new Error('SMTP message body is missing.');
  const headers = message.slice(0, separator);
  const body = message.slice(separator + 4);
  if (/^Content-Transfer-Encoding: base64$/imu.test(headers)) {
    return Buffer.from(body.replaceAll(/\s/gu, ''), 'base64').toString('utf8');
  }
  return body;
}

async function waitFor<T>(read: () => Promise<T | undefined>, timeoutMs = 10_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (Date.now() >= until) throw new Error('Timed out waiting for worker persistence.');
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
}

describe('Phase 16 committed shipment outbox to SMTP delivery', () => {
  let database: TemporaryDatabase;
  let sql: Client;
  let smtp: LocalSmtpServer;
  let smtpPort: number;

  async function shipmentFixture(
    locale: 'fa' | 'en',
    kind: 'SHIPPED' | 'DELIVERED',
  ): Promise<ShipmentFixture> {
    const orderId = randomUUID();
    const shipmentId = randomUUID();
    const eventId = randomUUID();
    const email = `phase16-${locale}-${shipmentId}@example.invalid`;
    const orderNumber = `HNY-2026-${orderId.slice(0, 12)}`;
    await sql.query('BEGIN');
    try {
      await sql.query(
        `INSERT INTO "order"
         (id, number, email, locale_at_purchase, currency, status, payment_status,
          fulfilment_status, subtotal_minor, grand_total_minor, shipping_method_snapshot,
          shipping_address_snapshot, billing_address_snapshot)
         VALUES ($1::uuid, $2, $3, $4, 'IRR', 'PAID', 'PAID', 'UNFULFILLED',
                 50000, 50000, '{"code":"STANDARD"}'::jsonb,
                 '{"country":"IR"}'::jsonb, '{"country":"IR"}'::jsonb)`,
        [orderId, orderNumber, email, locale],
      );
      await sql.query(
        `INSERT INTO shipment
         (id, order_id, provider, status, tracking_number, shipped_at, delivered_at)
         VALUES ($1::uuid, $2::uuid, 'manual-flat', $3, 'HNY-TRACK-16',
                 now() - interval '1 minute', CASE WHEN $4::boolean THEN now() ELSE NULL END)`,
        [
          shipmentId,
          orderId,
          kind === 'SHIPPED' ? 'IN_TRANSIT' : 'DELIVERED',
          kind === 'DELIVERED',
        ],
      );
      await sql.query(
        `INSERT INTO outbox_event
         (id, aggregate_type, aggregate_id, event_type, event_version, payload, occurred_at, next_attempt_at)
         VALUES ($1::uuid, 'shipment', $2::uuid, $3, 1,
                 jsonb_build_object('shipmentId', $2::text, 'version', 1), now(), now())`,
        [eventId, shipmentId, kind === 'SHIPPED' ? 'shipment.shipped' : 'shipment.delivered'],
      );
      await sql.query('COMMIT');
    } catch (error) {
      await sql.query('ROLLBACK');
      throw error;
    }
    return { shipmentId, eventId, email, orderNumber };
  }

  beforeAll(async () => {
    database = await createTemporaryDatabase();
    await migrate(database.databaseUrl);
    sql = new Client({ connectionString: database.databaseUrl, connectionTimeoutMillis: 10_000 });
    await sql.connect();
    smtp = new LocalSmtpServer();
    smtpPort = await smtp.listen();
  }, 180_000);

  afterAll(async () => {
    if (smtp !== undefined) await smtp.close();
    if (sql !== undefined) await sql.end();
    if (database !== undefined) await dropTemporaryDatabase(database);
  }, 180_000);

  it('routes committed events through the real worker, localizes mail, deduplicates replay, and redacts failures', async () => {
    const prefix = `p16-email-${randomUUID().slice(0, 20).replaceAll('-', '')}`;
    const config = loadWorkerConfig({
      NODE_ENV: 'test',
      DATABASE_URL: database.databaseUrl,
      REDIS_URL: redisUrl,
      WORKER_QUEUE_PREFIX: prefix,
      WORKER_WEB_ORIGIN: 'http://127.0.0.1:3000',
      WEB_REVALIDATE_SECRET: 'safe-test-placeholder-value',
      PAYMENT_PROVIDER: 'mock',
      PAYMENT_CALLBACK_URL: 'http://127.0.0.1:3000/fa/checkout/payment-return',
      IDENTITY_SMTP_HOST: '127.0.0.1',
      IDENTITY_SMTP_PORT: String(smtpPort),
      IDENTITY_SMTP_SECURE: 'false',
      IDENTITY_SMTP_TIMEOUT_MS: '2000',
      IDENTITY_EMAIL_FROM: 'orders@example.invalid',
      WORKER_OUTBOX_INTERVAL_MS: '300000',
      WORKER_RESERVATION_SWEEP_INTERVAL_MS: '3600000',
      WORKER_PAYMENT_RECONCILE_INTERVAL_MS: '3600000',
      WORKER_INVENTORY_RECONCILE_INTERVAL_MS: '604800000',
      WORKER_SITEMAP_REGENERATE_INTERVAL_MS: '86400000',
    });
    const runtime = new WorkerRuntime(config);
    const outbox = new Queue<unknown, unknown, string>('outbox', {
      connection: producerConnectionOptions(redisUrl),
      prefix,
    });
    const email = new Queue<unknown, unknown, string>('email', {
      connection: producerConnectionOptions(redisUrl),
      prefix,
    });
    const outboxEvents = new QueueEvents('outbox', {
      connection: redisConnectionOptions(redisUrl),
      prefix,
    });
    const emailEvents = new QueueEvents('email', {
      connection: redisConnectionOptions(redisUrl),
      prefix,
    });
    const output: string[] = [];
    const logSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    });
    try {
      await runtime.start();
      await Promise.all([outboxEvents.waitUntilReady(), emailEvents.waitUntilReady()]);
      const shipped = await shipmentFixture('fa', 'SHIPPED');
      const delivered = await shipmentFixture('en', 'DELIVERED');
      const dispatch = await outbox.add(
        JOB_NAMES.outboxDispatch,
        createJobEnvelope(JOB_NAMES.outboxDispatch, {}, 'email-outbox-dispatch'),
        { jobId: 'email-outbox-dispatch' },
      );
      // The scheduler can dispatch these committed rows before this explicit wakeup runs.
      expect(await dispatch.waitUntilFinished(outboxEvents, 15_000)).toMatchObject({
        deferred: 0,
        quarantined: 0,
      });

      for (const fixture of [shipped, delivered]) {
        const job = await waitFor(() =>
          email.getJob(
            deterministicJobId({ type: JOB_NAMES.fulfilmentEmail, key: fixture.eventId }),
          ),
        );
        expect(job.data).toMatchObject({
          version: 1,
          type: JOB_NAMES.fulfilmentEmail,
          eventId: fixture.eventId,
          payload: {
            shipmentId: fixture.shipmentId,
            kind: fixture === shipped ? 'SHIPPED' : 'DELIVERED',
          },
        });
        expect(JSON.stringify(job.data)).not.toContain(fixture.email);
        await job.waitUntilFinished(emailEvents, 15_000);
        const event = await sql.query<{ published_at: Date | null }>(
          'SELECT published_at FROM outbox_event WHERE id = $1::uuid',
          [fixture.eventId],
        );
        expect(event.rows[0]?.published_at).not.toBeNull();
        const delivery = await sql.query<{
          event_type: string;
          sent_at: Date | null;
          lease_until: Date | null;
          attempt_count: number;
        }>(
          'SELECT event_type, sent_at, lease_until, attempt_count FROM fulfilment_email_delivery WHERE shipment_id = $1::uuid',
          [fixture.shipmentId],
        );
        expect(delivery.rows).toEqual([
          expect.objectContaining({
            event_type: fixture === shipped ? 'SHIPPED' : 'DELIVERED',
            sent_at: expect.any(Date),
            lease_until: null,
            attempt_count: 1,
          }),
        ]);
      }
      expect(smtp.messages).toHaveLength(2);
      const persian = smtp.messages.find((message) => message.includes(shipped.email));
      const english = smtp.messages.find((message) => message.includes(delivered.email));
      expect(persian).toBeDefined();
      expect(english).toBeDefined();
      if (persian === undefined || english === undefined) throw new Error('SMTP message missing.');
      expect(textBody(persian)).toContain(`سفارش ${shipped.orderNumber} ارسال شده است.`);
      expect(textBody(english)).toContain(`Your order ${delivered.orderNumber} was delivered.`);

      const replay = await email.add(
        JOB_NAMES.fulfilmentEmail,
        createJobEnvelope(
          JOB_NAMES.fulfilmentEmail,
          { shipmentId: shipped.shipmentId, kind: 'SHIPPED' },
          'email-replay',
        ),
        { jobId: 'email-replay' },
      );
      await replay.waitUntilFinished(emailEvents, 15_000);
      expect(smtp.messages).toHaveLength(2);
      const replayDelivery = await sql.query<{ attempt_count: number }>(
        "SELECT attempt_count FROM fulfilment_email_delivery WHERE shipment_id = $1::uuid AND event_type = 'SHIPPED'",
        [shipped.shipmentId],
      );
      expect(replayDelivery.rows[0]?.attempt_count).toBe(1);

      const privateMarker = 'private-recipient@example.invalid';
      const malformed = await email.add(
        JOB_NAMES.fulfilmentEmail,
        {
          ...createJobEnvelope(
            JOB_NAMES.fulfilmentEmail,
            { shipmentId: shipped.shipmentId, kind: 'SHIPPED' },
            'email-malformed',
          ),
          payload: { shipmentId: shipped.shipmentId, kind: 'SHIPPED', email: privateMarker },
        },
        { jobId: 'email-malformed' },
      );
      await expect(malformed.waitUntilFinished(emailEvents, 15_000)).rejects.toThrow(
        'MALFORMED_JOB',
      );
      const failure = await waitFor(async () => {
        const rows = await sql.query<{ error_code: string; payload: unknown }>(
          "SELECT error_code, payload FROM job_failure WHERE queue = 'email' AND error_code = 'MALFORMED_JOB'",
        );
        return rows.rows[0];
      });
      expect(failure.error_code).toBe('MALFORMED_JOB');
      expect(failure.payload).toEqual({});
      expect(JSON.stringify(failure)).not.toContain(privateMarker);
      expect(output.join('')).toContain('"event":"worker.job_rejected"');
      expect(output.join('')).not.toContain(privateMarker);
      expect(output.join('')).not.toContain(shipped.email);
      expect(output.join('')).not.toContain(delivered.email);
    } finally {
      await runtime.close();
      await Promise.all([outboxEvents.close(), emailEvents.close()]);
      await Promise.all([outbox.close(), email.close()]);
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
      logSpy.mockRestore();
    }
  }, 120_000);
});
