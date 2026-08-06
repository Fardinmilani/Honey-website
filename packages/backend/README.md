# `@honey/backend`

Transport-independent backend shared by the API and, in a later phase, the
worker. Phase 6 adds the three-layer identity module, Phase 7 adds media, and
Phase 8 adds localized catalog and content modeling while keeping all HTTP
mapping in `apps/api`.

## Public foundation

- stable `AppError` taxonomy with separate safe and internal metadata
- typed configuration, database-health, transaction, outbox, idempotency,
  request-context, and graceful-resource contracts
- bounded readiness service
- Prisma-backed platform adapter, with `@honey/db` kept behind this package
- Nest dependency-injection composition metadata without any HTTP bootstrap

The identity domain and application layers have no NestJS, Fastify, Prisma,
database driver, route, controller, or HTTP-server dependency. Infrastructure
adapters implement PostgreSQL persistence, Redis lockout/challenges, Argon2id,
AES-256-GCM/RFC 6238 TOTP, privacy-preserving password screening, and narrow
SMTP delivery. Unit tests use deterministic fakes; integration tests use a
disposable PostgreSQL database and real Redis.

## Commands

```sh
pnpm --filter @honey/backend lint
pnpm --filter @honey/backend typecheck
pnpm --filter @honey/backend test
pnpm --filter @honey/backend build
```

Set `DATABASE_URL` to a local PostgreSQL database to include the transaction
seam integration test. Without it, that one test is intentionally skipped while
all transport-independent tests still run.

## Phase 7 media module

`src/modules/media` owns storage and media domain ports, direct-upload
orchestration, S3-compatible and in-memory storage adapters, Redis and in-memory
intent adapters, bounded Sharp processing, and Prisma persistence. The
application service is callable from the API now and from a later worker without
a transport dependency. See
[`docs/media-development.md`](../../docs/media-development.md).

## Phase 8 catalog module

`src/modules/catalog` owns products, variants, categories, collections,
translations, canonical slugs, publication rules, PostgreSQL search, stable
cursor pagination, and tagged Redis response caching. It consumes public media
references only through the media module's application service and keeps HTTP,
cookies, and OpenAPI concerns in `apps/api`. See
[`docs/catalog-development.md`](../../docs/catalog-development.md).
