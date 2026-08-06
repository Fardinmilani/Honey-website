# Honey Website

Bilingual Persian/English commerce platform for one luxury honey brand. The
repository is a strict pnpm/Turborepo monorepo and is being delivered one
numbered phase at a time.

## Current state

Phase 5 provides the transport-independent backend platform library and the
NestJS/Fastify API composition root. The production API exposes only liveness
and PostgreSQL-backed readiness, with strict configuration, structured logging,
RFC 9457 errors, validation, security transport foundations, deterministic
OpenAPI 3.1 contracts, and a non-root API image. There is still no Next.js,
BullMQ, authentication, session, catalog, checkout, UI, or other business
implementation. The existing Hero media under `apps/web/public/media/hero/` is
protected and must remain byte-identical.

## Requirements

- Node.js `22.17.0` (LTS)
- pnpm `11.20.0`, activated through Corepack
- Docker Engine with Docker Compose v2 (Docker Desktop with WSL2 is recommended
  on Windows)

## Bootstrap

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-phase2.ps1
```

Linux/macOS:

```sh
sh ./scripts/bootstrap-phase2.sh
```

The bootstrap installs the pinned toolchain dependencies, generates
`pnpm-lock.yaml`, repeats the install with `--frozen-lockfile`, and runs every
Phase 2 quality gate. Commit the generated lockfile with the other Phase 2
files.

## Local infrastructure

Copy `.env.example` to the ignored `.env` file, start the infrastructure, and
run its bounded health/resource verification:

```sh
pnpm docker:up
pnpm docker:verify
```

The Compose stack contains infrastructure only. It does not build or run an
application container. See [`docs/local-development.md`](docs/local-development.md)
for ports, credentials policy, service-specific checks, reset safety, and
troubleshooting.

## API foundation

After PostgreSQL is healthy and `.env` contains the safe local configuration:

```sh
pnpm db:migrate
pnpm api:dev
```

The default URLs are `http://127.0.0.1:4000/healthz` and
`http://127.0.0.1:4000/readyz`. See
[`docs/api-development.md`](docs/api-development.md) for configuration,
OpenAPI, testing, Docker, shutdown, and troubleshooting.

## Commands

| Command                     | Purpose                                                 |
| --------------------------- | ------------------------------------------------------- |
| `pnpm build`                | Build every workspace package through Turborepo         |
| `pnpm lint`                 | Run ESLint in strict, zero-warning mode                 |
| `pnpm boundaries`           | Enforce the documented dependency graph and cycle ban   |
| `pnpm typecheck`            | Type-check every workspace package without emitting     |
| `pnpm test`                 | Run boundary tests and package test tasks               |
| `pnpm format`               | Format supported files with Prettier                    |
| `pnpm format:check`         | Verify formatting without writing                       |
| `pnpm clean`                | Remove generated build and Turborepo output             |
| `pnpm phase2:verify`        | Run the historical/manual Phase 2 scope verifier        |
| `pnpm phase4:verify`        | Verify the current database-foundation structure        |
| `pnpm phase5:verify`        | Verify the backend/API foundation scope and invariants  |
| `pnpm api:dev`              | Start the API in TypeScript watch mode                  |
| `pnpm api:start`            | Start the built API                                     |
| `pnpm api:test`             | Run the focused API test suite                          |
| `pnpm api:openapi:generate` | Regenerate OpenAPI and TypeScript contracts             |
| `pnpm api:openapi:check`    | Fail when committed API contracts have drifted          |
| `pnpm api:openapi:lint`     | Lint the OpenAPI 3.1 document                           |
| `pnpm api:openapi:breaking` | Compare with an explicit base contract                  |
| `pnpm api:docker:build`     | Build the non-root Phase 5 API image                    |
| `pnpm db:validate`          | Validate the Prisma schema and configuration            |
| `pnpm db:generate`          | Generate the typed ESM Prisma client                    |
| `pnpm db:migrate`           | Apply committed database migrations                     |
| `pnpm db:seed`              | Run the deterministic development seed                  |
| `pnpm db:test`              | Test a migrated, seeded disposable PostgreSQL database  |
| `pnpm docker:up`            | Validate Compose and start local services detached      |
| `pnpm docker:down`          | Stop services and preserve named volumes                |
| `pnpm docker:logs`          | Follow local service logs                               |
| `pnpm docker:status`        | Show all local service states                           |
| `pnpm docker:verify`        | Verify health, extensions, buckets, policies, and ports |
| `pnpm docker:reset`         | Confirm interactively before deleting local volumes     |

## Workspace

```text
apps/
  web/       future Next.js composition root
  api/       NestJS/Fastify HTTP composition root and transport policy
  worker/    future BullMQ composition root
packages/
  backend/   transport-independent platform foundation; future business logic
  core/      framework-free primitives
  db/        Prisma schema, migrations, typed client, seed, test harness
  contracts/ committed OpenAPI 3.1 and generated transport types
  i18n/      locale configuration and formatting
  ui/        future design-system package
  config-ts/ shared strict TypeScript bases
  config-eslint/ shared ESLint flat configuration
  utils/     dependency-free helpers
```

The allowed dependency direction is enforced twice: by ESLint restrictions and
by the zero-dependency checker in `tools/boundaries/`. See
`docs/module-boundaries.md` and `AGENTS.md` before making changes.
