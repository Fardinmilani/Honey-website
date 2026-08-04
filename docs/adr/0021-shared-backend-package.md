# ADR-0021: Business logic lives in `packages/backend`, shared by API and worker

**Status:** Accepted · **Date:** 2026-08-05 · **Phase:** 1 (correction)
**Refines:** [ADR-0002](0002-modular-monolith.md), [ADR-0004](0004-nestjs-fastify.md), [ADR-0006](0006-redis-bullmq.md)

## Context

Phase 1 documentation placed the business modules under `apps/api/src/modules/`
while simultaneously requiring that `apps/worker`:

- reuse the same application services rather than re-implement business rules,
- **not** call `apps/api` over HTTP, and
- respect a dependency graph in which no app may import another app.

Those three statements cannot all be true. As written, the worker had no legal
way to reach the code it was required to reuse. Left unresolved until the
workspace exists, this gets settled by whoever writes the first job handler,
and the likely outcomes are all bad: the worker imports `apps/api` (breaking the
app boundary), the worker calls the API over HTTP (adding a network hop, an auth
problem, and a circular runtime dependency), or the worker duplicates the logic
(two implementations of the same rule, drifting apart).

This is cheap to fix now and expensive to fix after Phase 5.

## Decision

**Business logic moves out of `apps/*` into a shared library. Applications become
composition roots and nothing more.**

```
packages/backend/src/modules/<module>/
├── domain/            entities, value objects, policies, PORT interfaces
│                      pure TypeScript — no Nest, no Prisma, no HTTP, no BullMQ
├── application/       use cases; orchestrates domain + ports; owns transactions
├── infrastructure/    Prisma repositories, provider adapters, queue PRODUCERS
└── index.ts           the module's public surface
```

### Responsibilities

| Package / app | Owns | Must not |
|---|---|---|
| `packages/backend` | Every business rule, use case, repository, port, adapter, and transaction boundary | Bootstrap a process; know about HTTP or queue transport |
| `packages/db` | Prisma schema, migrations, generated client, transaction helper, seed harness | Contain business logic |
| `apps/api` | HTTP + NestJS composition root: `NestFactory.create()` with Fastify, controllers, guards, HTTP DTO mapping, REST + OpenAPI | Contain business logic; be imported by anything |
| `apps/worker` | BullMQ composition root: `NestFactory.createApplicationContext()`, queue processors, scheduling, retry and concurrency configuration | Duplicate business logic; import `apps/api`; call the API over HTTP |
| `apps/web` | Presentation and BFF | Import `packages/backend` or `packages/db`; touch PostgreSQL or Redis |

### Dependency direction

```
apps/web    ─▶ packages/{ui, i18n, contracts, core, utils}
apps/api    ─▶ packages/{backend, contracts, core, utils}
apps/worker ─▶ packages/{backend, core, utils}
packages/backend ─▶ packages/{db, core, utils}
packages/db      ─▶ (Prisma only)
packages/core    ─▶ (nothing)
```

No app imports another app. `packages/db` is reachable **only** through
`packages/backend`, so database credentials and Prisma access have exactly one
owner. `apps/api`'s readiness probe checks the database through a
`platform` health service, not by importing Prisma.

### Where the transport layers live

`http/` is no longer part of a module. Each transport keeps its own thin adapter
layer that maps to and from the shared application services:

```
apps/api/src/modules/<module>/       controller, DTOs, guards, OpenAPI decorators
apps/worker/src/processors/<queue>/  BullMQ processors → same application services
```

Enqueuing is infrastructure and stays in `packages/backend` (both apps need to
schedule work). **Consuming** is composition and lives only in `apps/worker`.

### Framework boundary

`domain/` stays pure TypeScript. `application/` and `infrastructure/` may carry
Nest DI decorators, and each backend module exports a Nest `@Module` from its
`index.ts`. Decorators are metadata, not a runtime host: `packages/backend`
never calls `NestFactory`. The API bootstraps it with an HTTP adapter, the worker
with a headless application context. There is one wiring definition and two
process shapes.

## Consequences

**Positive** — the contradiction is gone before any code exists; the worker
reuses the exact code path the API uses, so a rule cannot drift between the
synchronous and asynchronous execution of the same operation; application logic
becomes testable without booting an HTTP server; `packages/db` has a single
consumer; adding a third composition root later (a CLI for migrations, backfills,
or admin scripts) is a new thin app rather than a refactor.

**Negative / accepted** — one more package to configure, build, and cache;
`packages/backend` depends on `@nestjs/common` for DI decorators, so it is not
purely framework-free (the alternative was hand-rolled wiring in two places,
which is worse); a change to a shared service now rebuilds both apps, which
Turborepo's dependency graph handles but does lengthen a cold CI run; developers
must learn that "where does this code go" has a real answer — business rule to
`packages/backend`, transport concern to the app.

## Alternatives considered

| Option | Why not |
|---|---|
| Keep modules in `apps/api`; worker imports `apps/api` | Breaks the app boundary and makes the API's build output a library it was never designed to be |
| Worker calls the API over HTTP | A network hop, an authentication problem, and a circular runtime dependency for work that is already in-process |
| Duplicate the logic in the worker | Two implementations of every rule, guaranteed to diverge. This is the failure this ADR exists to prevent |
| Merge the worker into the API process | Loses independent scaling on queue depth and couples job execution to request traffic (ADR-0006) |
| Make `packages/backend` fully framework-free with a hand-written container | More boilerplate in two composition roots, and DI wiring duplicated exactly where duplication is dangerous |
