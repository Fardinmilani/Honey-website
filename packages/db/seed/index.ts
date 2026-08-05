import { createPrismaClient } from '../src/client.js';
import { seedDatabase } from './data.js';

function seedDatabaseUrl(): string {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('The development seed is disabled in production.');
  }
  const databaseUrl = process.env['DATABASE_URL'] ?? process.env['DATABASE_MIGRATION_URL'];
  if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL or DATABASE_MIGRATION_URL is required for seeding.');
  }
  const parsed = new URL(databaseUrl);
  const allowedHosts = new Set(['127.0.0.1', 'localhost', 'postgres']);
  if (!allowedHosts.has(parsed.hostname)) {
    throw new Error('The development seed may run only against an approved local database host.');
  }
  return databaseUrl;
}

const client = createPrismaClient({ databaseUrl: seedDatabaseUrl() });

try {
  const staffPasswordHash = process.env['SEED_STAFF_PASSWORD_HASH'];
  await seedDatabase(client, {
    staffEmail: process.env['SEED_STAFF_EMAIL'] ?? 'owner@example.invalid',
    ...(staffPasswordHash === undefined ? {} : { staffPasswordHash }),
  });
  console.log('Deterministic development seed completed.');
} finally {
  await client.$disconnect();
}
