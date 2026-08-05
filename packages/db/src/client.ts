import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';

export type PrismaClientOptions = Readonly<{
  databaseUrl: string;
}>;

function assertPostgresUrl(databaseUrl: string): void {
  const parsed = new URL(databaseUrl);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new TypeError('The database URL must use the PostgreSQL protocol.');
  }
  if (parsed.hostname.length === 0 || parsed.pathname.length <= 1) {
    throw new TypeError('The database URL must include a host and database name.');
  }
}

export function createPrismaClient(options: PrismaClientOptions): PrismaClient {
  assertPostgresUrl(options.databaseUrl);
  const adapter = new PrismaPg({ connectionString: options.databaseUrl });
  return new PrismaClient({ adapter });
}
