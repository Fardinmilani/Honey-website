import 'dotenv/config';

import { defineConfig } from 'prisma/config';

const databaseUrl =
  process.env['DATABASE_MIGRATION_URL'] ??
  process.env['DATABASE_URL'] ??
  'postgresql://honey_local:replace-with-local-development-password@localhost:5432/honey_local';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx seed/index.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
