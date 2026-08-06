import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient, type PrismaClient } from '@honey/db';
import type { PersistedAssetInput } from '../src/modules/media/domain/media-repository.port.js';
import { PrismaMediaRepository } from '../src/modules/media/infrastructure/prisma-media.repository.js';
import { IdentityMediaAuditAdapter } from '../src/modules/media/infrastructure/identity-media-audit.adapter.js';

const execFileAsync = promisify(execFile);
const dbDirectory = fileURLToPath(new URL('../../db/', import.meta.url));
const prismaCli = fileURLToPath(
  new URL('../../db/node_modules/prisma/build/index.js', import.meta.url),
);

type TemporaryDatabase = Readonly<{
  adminUrl: string;
  databaseName: string;
  databaseUrl: string;
}>;

async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const base = new URL(
    process.env['DATABASE_URL'] ??
      'postgresql://honey_local:replace-with-local-development-password@127.0.0.1:5432/honey_local',
  );
  const databaseName = `honey_media_${randomUUID().replaceAll('-', '')}`;
  if (!/^honey_media_[a-f0-9]{32}$/u.test(databaseName)) {
    throw new Error('Unsafe test database name.');
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

async function dropTemporaryDatabase(value: TemporaryDatabase): Promise<void> {
  const client = new Client({ connectionString: value.adminUrl, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    await client.query(`DROP DATABASE "${value.databaseName}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
}

describe('Prisma media repository on full migration history', () => {
  let database: TemporaryDatabase;
  let client: PrismaClient;
  let repository: PrismaMediaRepository;
  let auditWriter: IdentityMediaAuditAdapter;
  const userId = '018f0000-0000-7000-8000-0000000000a1';

  beforeAll(async () => {
    database = await createTemporaryDatabase();
    await migrate(database.databaseUrl);
    client = createPrismaClient({ databaseUrl: database.databaseUrl });
    await client.user.create({
      data: {
        id: userId,
        email: 'media-owner@example.invalid',
        preferredLocale: 'fa',
        isStaff: true,
      },
    });
    repository = new PrismaMediaRepository(
      database.databaseUrl,
      'https://media.example.invalid/honey-media/',
    );
    auditWriter = new IdentityMediaAuditAdapter(database.databaseUrl);
  }, 120_000);

  afterAll(async () => {
    await repository?.close();
    await auditWriter?.close();
    await client?.$disconnect();
    if (database !== undefined) await dropTemporaryDatabase(database);
  });

  it('persists one trusted asset, unique derivatives, idempotent retry, and redacted audit data', async () => {
    const assetId = randomUUID();
    const input: PersistedAssetInput = {
      id: assetId,
      kind: 'IMAGE',
      visibility: 'PUBLIC',
      storageKey: `media/${assetId}/original.jpg`,
      mimeType: 'image/jpeg',
      bytes: 1_024,
      width: 400,
      height: 200,
      durationSeconds: null,
      checksum: 'a'.repeat(64),
      altTextByLocale: { fa: 'عسل', en: 'Honey' },
      createdBy: userId,
      derivatives: [
        {
          id: randomUUID(),
          variant: 'thumb',
          format: 'webp',
          mimeType: 'image/webp',
          width: 320,
          height: 160,
          bytes: 512,
          checksum: 'b'.repeat(64),
          storageKey: `media/${assetId}/thumb-320.webp`,
        },
      ],
    };
    const audit = {
      actorUserId: userId,
      action: 'media.upload.completed',
      assetId,
      requestId: 'media-repository-test',
      clientIp: '192.0.2.10',
    } as const;
    const created = await repository.createAsset(input);
    const retried = await repository.createAsset(input);
    await auditWriter.append(audit);
    expect(retried.id).toBe(created.id);
    expect(await client.mediaAsset.count({ where: { id: assetId } })).toBe(1);
    expect(await client.mediaDerivative.count({ where: { mediaAssetId: assetId } })).toBe(1);
    const audits = await client.auditLog.findMany({ where: { subjectId: assetId } });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toMatch(/https?:|X-Amz|credential|secret/iu);
  });

  it('lets PostgreSQL reject unsafe media storage keys', async () => {
    await expect(
      client.mediaAsset.create({
        data: {
          id: randomUUID(),
          kind: 'VIDEO',
          visibility: 'PRIVATE',
          storageKey: '../hero/honey-scroll.mp4',
          mimeType: 'video/mp4',
          bytes: 10,
          checksum: 'c'.repeat(64),
          altTextByLocale: {},
          createdBy: userId,
        },
      }),
    ).rejects.toThrow();
  });
});
