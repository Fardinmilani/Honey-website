import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createPrismaClient, type PrismaClient } from '@honey/db';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SmtpFulfilmentNotificationAdapter } from '../src/modules/fulfilment/infrastructure/smtp-fulfilment-notification.adapter.js';

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
  const databaseName = `honey_phase15_mail_${randomUUID().replaceAll('-', '')}`;
  if (!/^honey_phase15_mail_[a-f0-9]{32}$/u.test(databaseName)) {
    throw new Error('Unsafe database name.');
  }
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
  #rejectNextData = false;

  constructor() {
    this.#server = createServer((socket) => {
      this.#sockets.add(socket);
      socket.on('close', () => this.#sockets.delete(socket));
      socket.write('220 local-phase15-smtp ESMTP\r\n');
      let pending = '';
      let data = '';
      let receivingData = false;
      socket.on('data', (chunk: Buffer) => {
        pending += chunk.toString('utf8');
        for (;;) {
          const lineEnd = pending.indexOf('\r\n');
          if (lineEnd < 0) break;
          const line = pending.slice(0, lineEnd);
          pending = pending.slice(lineEnd + 2);
          if (receivingData) {
            if (line === '.') {
              receivingData = false;
              if (this.#rejectNextData) {
                this.#rejectNextData = false;
                socket.write('451 temporary delivery failure\r\n');
              } else {
                this.messages.push(data);
                socket.write('250 accepted\r\n');
              }
              data = '';
            } else {
              data += `${line}\r\n`;
            }
            continue;
          }
          const command = line.toUpperCase();
          if (command.startsWith('EHLO ') || command.startsWith('HELO ')) {
            socket.write('250 local-phase15-smtp\r\n');
          } else if (command.startsWith('MAIL FROM:') || command.startsWith('RCPT TO:')) {
            socket.write('250 accepted\r\n');
          } else if (command === 'DATA') {
            receivingData = true;
            socket.write('354 end with <CRLF>.<CRLF>\r\n');
          } else if (command === 'RSET') {
            data = '';
            receivingData = false;
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

  rejectOneMessage(): void {
    this.#rejectNextData = true;
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

describe('Phase 15 direct fulfilment SMTP delivery', () => {
  let database: TemporaryDatabase;
  let prisma: PrismaClient;
  let smtp: LocalSmtpServer;
  let adapter: SmtpFulfilmentNotificationAdapter;
  let sequence = 900;

  async function shipment(): Promise<string> {
    sequence += 1;
    const anonymousId = randomUUID();
    const cartId = randomUUID();
    const checkoutId = randomUUID();
    const orderId = randomUUID();
    const shipmentId = randomUUID();
    await prisma.cart.create({
      data: {
        id: cartId,
        anonymousId,
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
        email: `phase15-mail-${anonymousId}@example.invalid`,
        status: 'AWAITING_PAYMENT',
        idempotencyKey: `checkout-${checkoutId}`,
      },
    });
    await prisma.order.create({
      data: {
        id: orderId,
        number: `HNY-2026-${String(sequence).padStart(6, '0')}`,
        checkoutSessionId: checkoutId,
        email: `phase15-mail-${anonymousId}@example.invalid`,
        localeAtPurchase: 'en',
        currency: 'IRR',
        status: 'PAID',
        paymentStatus: 'PAID',
        fulfilmentStatus: 'UNFULFILLED',
        subtotalMinor: 50_000n,
        grandTotalMinor: 50_000n,
        shippingMethodSnapshot: { code: 'STANDARD' },
        shippingAddressSnapshot: { country: 'IR' },
        billingAddressSnapshot: { country: 'IR' },
      },
    });
    await prisma.shipment.create({
      data: { id: shipmentId, orderId, provider: 'manual-flat', status: 'IN_TRANSIT' },
    });
    return shipmentId;
  }

  beforeAll(async () => {
    database = await createTemporaryDatabase();
    await migrate(database.databaseUrl);
    prisma = createPrismaClient({ databaseUrl: database.databaseUrl });
    smtp = new LocalSmtpServer();
    const port = await smtp.listen();
    adapter = new SmtpFulfilmentNotificationAdapter(database.databaseUrl, {
      host: '127.0.0.1',
      port,
      secure: false,
      from: 'orders@example.invalid',
      connectionTimeoutMs: 2_000,
    });
  }, 180_000);

  afterAll(async () => {
    if (adapter !== undefined) await adapter.close();
    if (smtp !== undefined) await smtp.close();
    if (prisma !== undefined) await prisma.$disconnect();
    if (database !== undefined) await dropTemporaryDatabase(database);
  }, 180_000);

  it('sends a localized shipped and delivered message once per event', async () => {
    const shipmentId = await shipment();
    const notification = {
      shipmentId,
      orderNumber: 'HNY-2026-000901',
      email: 'customer@example.invalid',
      locale: 'en',
      trackingNumber: 'HNY-TRACK-901',
      trackingUrl: 'https://example.invalid/track/901',
    };
    await adapter.sendShipped(notification);
    await adapter.sendShipped(notification);
    await adapter.sendDelivered({ ...notification, locale: 'fa' });
    await adapter.sendDelivered({ ...notification, locale: 'fa' });

    expect(smtp.messages).toHaveLength(2);
    expect(smtp.messages[0]).toContain('Your order HNY-2026-000901 has shipped');
    expect(smtp.messages[0]).toContain('Tracking number: HNY-TRACK-901');
    const deliveredMessage = smtp.messages[1];
    if (deliveredMessage === undefined) throw new Error('Delivered email is missing.');
    expect(textBody(deliveredMessage)).toContain('سفارش HNY-2026-000901 تحویل داده شده است.');
    expect(textBody(deliveredMessage)).toContain('شماره رهگیری: HNY-TRACK-901');
    const rows = await prisma.fulfilmentEmailDelivery.findMany({ where: { shipmentId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.sentAt !== null && row.leaseUntil === null)).toBe(true);
    expect(rows.map((row) => row.attemptCount)).toEqual([1, 1]);
  });

  it('claims concurrent replay once', async () => {
    const shipmentId = await shipment();
    const notification = {
      shipmentId,
      orderNumber: 'HNY-2026-000902',
      email: 'customer@example.invalid',
      locale: 'en',
      trackingNumber: null,
      trackingUrl: null,
    };
    const before = smtp.messages.length;
    await Promise.all([adapter.sendShipped(notification), adapter.sendShipped(notification)]);
    expect(smtp.messages).toHaveLength(before + 1);
    const row = await prisma.fulfilmentEmailDelivery.findUniqueOrThrow({
      where: { shipmentId_eventType: { shipmentId, eventType: 'SHIPPED' } },
    });
    expect(row.attemptCount).toBe(1);
    expect(row.sentAt).not.toBeNull();
  });

  it('keeps an SMTP failure unsent and allows an authorized replay', async () => {
    const shipmentId = await shipment();
    const notification = {
      shipmentId,
      orderNumber: 'HNY-2026-000903',
      email: 'customer@example.invalid',
      locale: 'en',
      trackingNumber: null,
      trackingUrl: null,
    };
    const before = smtp.messages.length;
    smtp.rejectOneMessage();
    await expect(adapter.sendShipped(notification)).rejects.toThrow(
      'Fulfilment email delivery failed.',
    );
    const failed = await prisma.fulfilmentEmailDelivery.findUniqueOrThrow({
      where: { shipmentId_eventType: { shipmentId, eventType: 'SHIPPED' } },
    });
    expect(failed.sentAt).toBeNull();
    expect(failed.leaseUntil).toBeNull();
    expect(failed.attemptCount).toBe(1);
    expect(smtp.messages).toHaveLength(before);

    await adapter.sendShipped(notification);
    expect(smtp.messages).toHaveLength(before + 1);
    const delivered = await prisma.fulfilmentEmailDelivery.findUniqueOrThrow({
      where: { shipmentId_eventType: { shipmentId, eventType: 'SHIPPED' } },
    });
    expect(delivered.sentAt).not.toBeNull();
    expect(delivered.attemptCount).toBe(2);
  });
});
