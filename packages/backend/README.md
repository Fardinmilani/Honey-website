# `@honey/backend`

Transport-independent backend foundation shared by the API and, in a later
phase, the worker. Phase 5 contains only platform capabilities; `src/modules/`
intentionally contains no business module.

## Public foundation

- stable `AppError` taxonomy with separate safe and internal metadata
- typed configuration, database-health, transaction, outbox, idempotency,
  request-context, and graceful-resource contracts
- bounded readiness service
- Prisma-backed platform adapter, with `@honey/db` kept behind this package
- Nest dependency-injection composition metadata without any HTTP bootstrap

The domain and application layers have no NestJS, Fastify, Prisma, database
driver, route, controller, or HTTP-server dependency. Unit tests run without an
HTTP process. No outbox dispatcher, Redis idempotency implementation, business
workflow, authentication, or business-specific error exists in Phase 5.

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
