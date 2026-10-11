import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from 'pg';

export type AdminTestDatabase = Readonly<{
  adminUrl: string;
  databaseName: string;
  databaseUrl: string;
}>;
export async function createAdminTestDatabase(): Promise<AdminTestDatabase> {
  const base = new URL(
    process.env['DATABASE_URL'] ??
      'postgresql://honey_local:replace-with-local-development-password@127.0.0.1:5432/honey_local',
  );
  if (!['localhost', '127.0.0.1', 'postgres'].includes(base.hostname))
    throw new Error('Admin tests require a local database.');
  const databaseName = `honey_phase17_${randomUUID().replaceAll('-', '')}`;
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
  const database = { adminUrl: admin.toString(), databaseName, databaseUrl: target.toString() };
  try {
    await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(new URL('../../../db/node_modules/prisma/build/index.js', import.meta.url)),
        'migrate',
        'deploy',
        '--config',
        'prisma.config.ts',
      ],
      {
        cwd: fileURLToPath(new URL('../../../db/', import.meta.url)),
        env: { ...process.env, DATABASE_URL: database.databaseUrl },
        windowsHide: true,
        timeout: 120_000,
      },
    );
    return database;
  } catch {
    await dropAdminTestDatabase(database);
    throw new Error('Admin test migration failed.');
  }
}
export async function dropAdminTestDatabase(database: AdminTestDatabase): Promise<void> {
  if (!/^honey_phase17_[a-f0-9]{32}$/u.test(database.databaseName))
    throw new Error('Unsafe test database name.');
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
