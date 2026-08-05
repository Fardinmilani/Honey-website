# `@honey/db`

The exclusive PostgreSQL and Prisma package for the Honey Website. It owns the
schema, migrations, generated client, connection construction, transaction
types, deterministic development seed, and disposable integration-test database.
Only `packages/backend` may import this package.

## Commands

Run from the repository root:

| Command                  | Purpose                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| `pnpm db:format`         | Format the Prisma schema                                         |
| `pnpm db:validate`       | Validate the schema and Prisma configuration                     |
| `pnpm db:generate`       | Generate the ESM TypeScript Prisma client                        |
| `pnpm db:migrate`        | Apply committed migrations to the configured database            |
| `pnpm db:migrate:status` | Report migration status for the configured database              |
| `pnpm db:seed`           | Apply deterministic local fixtures                               |
| `pnpm db:test`           | Create, migrate, seed twice, test, and drop a temporary database |
| `pnpm phase4:verify`     | Run the permanent Phase 4 structural gates                       |

`pnpm db:test` uses `TEST_DATABASE_ADMIN_URL` to connect to an administrative
database, creates a uniquely named `honey_phase4_test_*` database, and drops only
that validated name after success or failure. It never resets the database in
`DATABASE_URL`.

The seed refuses `NODE_ENV=production` and non-local hosts. Its identifiers and
timestamps are fixed, its writes are idempotent, and optional development staff
credentials are read only from environment variables.

Prisma-generated files under `src/generated/prisma/` are reproducible and
ignored by Git. `build`, `typecheck`, and tests regenerate them as needed.
