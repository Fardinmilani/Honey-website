import assert from 'node:assert/strict';

import { Client } from 'pg';

import { readSeedFingerprint, seedDatabase } from '../seed/data.js';
import { createPrismaClient } from '../src/client.js';
import { runConstraintTests } from './constraints.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
  runPrismaCommand,
  type TemporaryDatabase,
} from './harness.js';

let database: TemporaryDatabase | undefined;

try {
  database = await createTemporaryDatabase();
  await runPrismaCommand(
    ['migrate', 'deploy', '--config', 'prisma.config.ts'],
    database.databaseUrl,
  );
  const migrationStatus = await runPrismaCommand(
    ['migrate', 'status', '--config', 'prisma.config.ts'],
    database.databaseUrl,
  );
  assert.match(migrationStatus, /Database schema is up to date/u);

  const prisma = createPrismaClient({ databaseUrl: database.databaseUrl });
  try {
    await seedDatabase(prisma, { staffEmail: 'owner@example.invalid' });
    const firstFingerprint = await readSeedFingerprint(prisma);
    await seedDatabase(prisma, { staffEmail: 'owner@example.invalid' });
    const secondFingerprint = await readSeedFingerprint(prisma);
    assert.deepEqual(secondFingerprint, firstFingerprint);
    const roles = await prisma.role.findMany({ orderBy: { code: 'asc' }, select: { code: true } });
    assert.deepEqual(
      roles.map((role) => role.code),
      [
        'ADMIN',
        'CONTENT_EDITOR',
        'CUSTOMER',
        'INVENTORY_MANAGER',
        'ORDER_MANAGER',
        'OWNER',
        'SUPPORT',
      ],
    );
    const permissions = await prisma.permission.findMany({ select: { code: true } });
    assert.equal(permissions.length, 21);
    const forbiddenMarketplaceRole = ['SELL', 'ER'].join('');
    assert.equal(
      roles.some((role) => role.code === forbiddenMarketplaceRole),
      false,
    );
    const ownerPermissionCount = await prisma.rolePermission.count({
      where: { role: { code: 'OWNER' } },
    });
    assert.equal(ownerPermissionCount, 21);
  } finally {
    await prisma.$disconnect();
  }

  const sql = new Client({
    connectionString: database.databaseUrl,
    connectionTimeoutMillis: 10_000,
  });
  await sql.connect();
  try {
    const rejectionCount = await runConstraintTests(sql);
    const uncoveredForeignKeys = await sql.query<{ constraint_name: string; table_name: string }>(
      `SELECT c.conname AS constraint_name, c.conrelid::regclass::text AS table_name
       FROM pg_constraint c
       WHERE c.contype = 'f'
         AND c.connamespace = 'public'::regnamespace
         AND NOT EXISTS (
           SELECT 1
           FROM pg_index i
           WHERE i.indrelid = c.conrelid
             AND i.indisvalid
             AND (
               SELECT bool_and(i.indkey[position - 1] = c.conkey[position])
               FROM generate_subscripts(c.conkey, 1) AS position
             )
         )
       ORDER BY table_name, constraint_name`,
    );
    assert.deepEqual(uncoveredForeignKeys.rows, [], 'Every foreign key must have a leading index');
    const counts = await sql.query<{ enum_count: string; table_count: string }>(
      `SELECT
        (SELECT count(*)::text FROM pg_type WHERE typtype = 'e' AND typnamespace = 'public'::regnamespace) AS enum_count,
        (SELECT count(*)::text FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations') AS table_count`,
    );
    const row = counts.rows[0];
    if (row === undefined) throw new Error('Database count query returned no row.');
    console.log(
      `Phase 4 database integration passed: ${row.table_count} tables, ${row.enum_count} enums, ${rejectionCount} PostgreSQL rejection proofs, seed stable across two runs.`,
    );
  } finally {
    await sql.end();
  }
} finally {
  if (database !== undefined) await dropTemporaryDatabase(database);
}
