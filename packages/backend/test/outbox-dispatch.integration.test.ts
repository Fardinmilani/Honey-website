import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createPrismaClient, type PrismaClient } from '@honey/db';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaJobFailureRepository } from '../src/platform/infrastructure/prisma-job-failure.repository.js';
import { PrismaOutboxDispatchRepository } from '../src/platform/infrastructure/prisma-outbox-dispatch.repository.js';

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
  if (!['localhost', '127.0.0.1'].includes(base.hostname)) {
    throw new Error('Outbox integration tests require local PostgreSQL.');
  }
  const databaseName = `honey_phase16_outbox_${randomUUID().replaceAll('-', '')}`;
  if (!/^honey_phase16_outbox_[a-f0-9]{32}$/u.test(databaseName)) {
    throw new Error('Unsafe integration database name.');
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

describe('Phase 16 outbox dispatch persistence on PostgreSQL', () => {
  let database: TemporaryDatabase;
  let prisma: PrismaClient;
  let first: PrismaOutboxDispatchRepository;
  let second: PrismaOutboxDispatchRepository;
  let failures: PrismaJobFailureRepository;

  async function append(
    eventType = 'catalog.product.updated',
    occurredAt = new Date(),
  ): Promise<string> {
    const id = randomUUID();
    await prisma.outboxEvent.create({
      data: {
        id,
        aggregateType: 'product',
        aggregateId: randomUUID(),
        eventType,
        payload: { productId: randomUUID() },
        occurredAt,
        nextAttemptAt: new Date(Date.now() - 5_000),
      },
    });
    return id;
  }

  beforeAll(async () => {
    database = await createTemporaryDatabase();
    await migrate(database.databaseUrl);
    prisma = createPrismaClient({ databaseUrl: database.databaseUrl });
    first = new PrismaOutboxDispatchRepository(database.databaseUrl);
    second = new PrismaOutboxDispatchRepository(database.databaseUrl);
    failures = new PrismaJobFailureRepository(database.databaseUrl);
  }, 120_000);

  beforeEach(async () => {
    await prisma.outboxEvent.deleteMany();
    await prisma.jobFailure.deleteMany();
  });

  afterAll(async () => {
    await Promise.all([first?.close(), second?.close(), failures?.close(), prisma?.$disconnect()]);
    if (database !== undefined) await dropTemporaryDatabase(database);
  }, 60_000);

  it('claims bounded disjoint rows across two dispatchers and fences stale confirmation', async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => append()));
    const [left, right] = await Promise.all([
      first.claimBatch({ limit: 4, leaseMs: 30_000 }),
      second.claimBatch({ limit: 4, leaseMs: 30_000 }),
    ]);
    expect(left).toHaveLength(4);
    expect(right).toHaveLength(4);
    expect(new Set([...left, ...right].map((event) => event.id))).toEqual(new Set(ids));
    expect(left.every((event) => event.eventVersion === 1 && event.attempts === 1)).toBe(true);
    const claim = left[0];
    if (claim === undefined) throw new Error('Expected a claimed event.');
    expect(await second.markDispatched({ id: claim.id, claimToken: randomUUID() })).toBe(false);
    expect(await first.markDispatched({ id: claim.id, claimToken: claim.claimToken })).toBe(true);
    expect(await first.markDispatched({ id: claim.id, claimToken: claim.claimToken })).toBe(false);
    expect(
      (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: claim.id } })).publishedAt,
    ).not.toBeNull();
  });

  it('recovers the enqueue-success crash window using the same committed event ID', async () => {
    const id = await append();
    const start = new Date();
    const firstClaim = (await first.claimBatch({ limit: 1, leaseMs: 1_000, now: start }))[0];
    if (firstClaim === undefined) throw new Error('Expected the first claim.');
    // Simulate a successful deterministic enqueue followed by a process crash.
    const redisJobId = `outbox-${firstClaim.id}`;
    const recoveredAt = new Date(start.valueOf() + 1_001);
    const secondClaim = (
      await second.claimBatch({ limit: 1, leaseMs: 1_000, now: recoveredAt })
    )[0];
    if (secondClaim === undefined) throw new Error('Expected the recovered claim.');
    expect(secondClaim.id).toBe(id);
    expect(`outbox-${secondClaim.id}`).toBe(redisJobId);
    expect(secondClaim.claimToken).not.toBe(firstClaim.claimToken);
    expect(secondClaim.attempts).toBe(2);
    expect(
      await first.markDispatched({ id, claimToken: firstClaim.claimToken, now: recoveredAt }),
    ).toBe(false);
    expect(
      await second.markDispatched({ id, claimToken: secondClaim.claimToken, now: recoveredAt }),
    ).toBe(true);
  });

  it('keeps committed events eligible after a Redis failure and retries after recovery', async () => {
    const id = await append();
    const start = new Date();
    const claim = (await first.claimBatch({ limit: 1, leaseMs: 30_000, now: start }))[0];
    if (claim === undefined) throw new Error('Expected a claim.');
    const retryAt = new Date(start.valueOf() + 5_000);
    expect(
      await first.releaseClaim({
        id,
        claimToken: claim.claimToken,
        errorCode: 'REDIS_UNAVAILABLE',
        nextAttemptAt: retryAt,
        now: start,
      }),
    ).toBe(true);
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id } })).publishedAt).toBeNull();
    expect(await second.claimBatch({ limit: 1, leaseMs: 30_000, now: start })).toHaveLength(0);
    const recovered = (await second.claimBatch({ limit: 1, leaseMs: 30_000, now: retryAt }))[0];
    if (recovered === undefined) throw new Error('Expected the recovered event.');
    expect(recovered.id).toBe(id);
    expect(
      await second.markDispatched({ id, claimToken: recovered.claimToken, now: retryAt }),
    ).toBe(true);
    expect((await first.pendingMetrics()).pendingCount).toBe(0);
  });

  it('quarantines poison events without blocking later committed events', async () => {
    const poison = await append('unknown.event', new Date(Date.now() - 5_000));
    const valid = await append();
    expect(await prisma.outboxEvent.count()).toBe(2);
    const claim = (await first.claimBatch({ limit: 1, leaseMs: 30_000 }))[0];
    if (claim === undefined) throw new Error('Expected the poison event.');
    expect(claim.id).toBe(poison);
    expect(
      await first.releaseClaim({
        id: poison,
        claimToken: claim.claimToken,
        errorCode: 'OUTBOX_UNSUPPORTED_EVENT',
        quarantine: true,
      }),
    ).toBe(true);
    const next = (await second.claimBatch({ limit: 1, leaseMs: 30_000 }))[0];
    expect(next?.id).toBe(valid);
    const metrics = await first.pendingMetrics();
    expect(metrics.pendingCount).toBe(1);
    expect(metrics.quarantinedCount).toBe(1);
    expect(metrics.oldestPendingAt).toBeInstanceOf(Date);
  });

  it('stores one safe terminal record per cycle and rejects unsafe identifiers', async () => {
    const safe = {
      queue: 'outbox',
      jobId: `outbox-${randomUUID()}`,
      name: 'outbox.dispatch.v1',
      payloadVersion: 1,
      correlationId: randomUUID(),
      attemptsMade: 5,
      errorCode: 'OUTBOX_RETRY_EXHAUSTED',
      errorClass: 'EXHAUSTED' as const,
      terminalCycle: 'initial',
      payload: { recipientEmail: 'private@example.invalid' },
      error: 'private@example.invalid was rejected',
    };
    const firstRecord = await failures.recordTerminalFailure(safe);
    const duplicate = await failures.recordTerminalFailure(safe);
    expect(firstRecord.created).toBe(true);
    expect(duplicate).toEqual({ id: firstRecord.id, created: false });
    const stored = await prisma.jobFailure.findUniqueOrThrow({ where: { id: firstRecord.id } });
    expect(stored.payload).toEqual({});
    expect(stored.error).toBe('Job exhausted its bounded retry attempts.');
    expect(JSON.stringify(stored)).not.toContain('private@example.invalid');
    expect(stored.attemptsMade).toBe(5);
    expect(stored.payloadVersion).toBe(1);
    expect(stored.errorCode).toBe('OUTBOX_RETRY_EXHAUSTED');
    expect(stored.errorClass).toBe('EXHAUSTED');
    const laterCycle = await failures.recordTerminalFailure({
      ...safe,
      terminalCycle: 'manual-retry-1',
    });
    expect(laterCycle.created).toBe(true);
    expect(await prisma.jobFailure.count()).toBe(2);
    expect(await failures.countUnresolvedByQueue()).toEqual({ outbox: 2 });
    await prisma.jobFailure.update({
      where: { id: firstRecord.id },
      data: { resolvedAt: new Date(Date.now() + 1_000) },
    });
    expect(await failures.countUnresolvedByQueue()).toEqual({ outbox: 1 });
    await expect(
      failures.recordTerminalFailure({ ...safe, jobId: 'private@example.invalid' }),
    ).rejects.toThrow('Invalid safe job ID.');
    await expect(
      failures.recordTerminalFailure({ ...safe, errorCode: 'https://secret.invalid' }),
    ).rejects.toThrow('Invalid safe error code.');

    const bypassId = randomUUID();
    await prisma.jobFailure.create({
      data: {
        id: bypassId,
        queue: 'outbox',
        jobId: `outbox-${randomUUID()}`,
        name: 'outbox.dispatch.v1',
        terminalCycle: 'bypass',
        errorClass: 'PERMANENT',
        payload: { recipientEmail: 'private@example.invalid' },
        error: 'private@example.invalid was rejected',
      },
    });
    const bypassed = await prisma.jobFailure.findUniqueOrThrow({ where: { id: bypassId } });
    expect(bypassed.payload).toEqual({});
    expect(bypassed.error).toBe('Permanent job failure.');
    expect(JSON.stringify(bypassed)).not.toContain('private@example.invalid');
  });
});
