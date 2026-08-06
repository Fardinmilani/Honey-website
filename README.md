# Honey Website

Bilingual Persian/English commerce platform for one luxury honey brand. The
repository is a strict pnpm/Turborepo monorepo and is being delivered one
numbered phase at a time.

## Current state

Phase 6 adds backend-owned registration, verification, login, password reset,
opaque sessions, mandatory staff TOTP, roles/permissions, ownership checks,
Redis lockout, append-only security audit, and fail-closed API authorization to
the Phase 5 NestJS/Fastify foundation. OpenAPI contracts and the non-root API
image include these routes. There is still no Next.js, BullMQ, identity UI,
catalog, checkout, or later business implementation. The existing Hero media
under `apps/web/public/media/hero/` is protected and remains byte-identical.

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
Identity flows and local Mailpit/TOTP/session behavior are documented in
[`docs/identity-development.md`](docs/identity-development.md).

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
| `pnpm phase6:verify`        | Verify identity, authorization, scope, and integrity    |
| `pnpm api:dev`              | Start the API in TypeScript watch mode                  |
| `pnpm api:start`            | Start the built API                                     |
| `pnpm api:test`             | Run the focused API test suite                          |
| `pnpm api:openapi:generate` | Regenerate OpenAPI and TypeScript contracts             |
| `pnpm api:openapi:check`    | Fail when committed API contracts have drifted          |
| `pnpm api:openapi:lint`     | Lint the OpenAPI 3.1 document                           |
| `pnpm api:openapi:breaking` | Compare with an explicit base contract                  |
| `pnpm api:docker:build`     | Build the non-root Phase 6 API image                    |
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
  backend/   platform foundation and transport-independent identity logic
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
