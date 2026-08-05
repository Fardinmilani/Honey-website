import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

import { Client } from 'pg';

const execFileAsync = promisify(execFile);
const databaseNamePattern = /^honey_phase4_test_[a-z0-9_]+$/u;
const commandTimeoutMs = 60_000;

export type TemporaryDatabase = Readonly<{
  databaseName: string;
  databaseUrl: string;
  adminUrl: string;
}>;

function replaceDatabaseName(sourceUrl: string, databaseName: string): string {
  const parsed = new URL(sourceUrl);
  parsed.pathname = `/${databaseName}`;
  parsed.searchParams.delete('schema');
  return parsed.toString();
}

function adminDatabaseUrl(): string {
  const source =
    process.env['TEST_DATABASE_ADMIN_URL'] ??
    process.env['DATABASE_MIGRATION_URL'] ??
    process.env['DATABASE_URL'] ??
    'postgresql://honey_local:replace-with-local-development-password@localhost:5432/postgres';
  const parsed = new URL(source);
  const allowedHosts = new Set(['127.0.0.1', 'localhost', 'postgres']);
  if (!allowedHosts.has(parsed.hostname)) {
    throw new Error('Integration databases may be created only on an approved test host.');
  }
  return replaceDatabaseName(source, 'postgres');
}

export async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const databaseName = `honey_phase4_test_${process.pid}_${randomBytes(4).toString('hex')}`;
  if (!databaseNamePattern.test(databaseName)) throw new Error('Unsafe temporary database name.');
  const adminUrl = adminDatabaseUrl();
  const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
  } finally {
    await client.end();
  }
  return { databaseName, databaseUrl: replaceDatabaseName(adminUrl, databaseName), adminUrl };
}

export async function dropTemporaryDatabase(database: TemporaryDatabase): Promise<void> {
  if (!databaseNamePattern.test(database.databaseName))
    throw new Error('Refusing unsafe database deletion.');
  const client = new Client({
    connectionString: database.adminUrl,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [database.databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${database.databaseName}"`);
  } finally {
    await client.end();
  }
}

export async function runPrismaCommand(
  args: readonly string[],
  databaseUrl: string,
): Promise<string> {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const { stdout, stderr } = await execFileAsync(executable, ['exec', 'prisma', ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_MIGRATION_URL: databaseUrl,
      NODE_ENV: 'test',
    },
    timeout: commandTimeoutMs,
    maxBuffer: 2 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  return `${stdout}${stderr}`;
}
