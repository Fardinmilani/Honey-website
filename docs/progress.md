# Progress

Living record of what has been delivered, decided, and left open. Updated at the
end of **every** phase. See [`implementation-phases.md`](implementation-phases.md)
for phase definitions and [`AGENTS.md`](../AGENTS.md) for the working rules.

---

## Status

| # | Phase | Status | Completed |
|---|---|---|---|
| 1 | Architecture & Documentation | âœ… Complete (corrected 2026-08-05) | 2026-08-04 |
| 2 | Workspace Foundation | ✅ Complete | 2026-08-05 |
| 3 | Local Environment | ✅ Complete | 2026-08-05 |
| 4 | Database Foundation | ✅ Complete | 2026-08-06 |
| 5 | Backend Library & API Foundation | Complete | 2026-08-06 |
| 6 | Identity & Authorization | Complete | 2026-08-06 |
| 7 | Media & Storage | â¬œ Not started | â€” |
| 8 | Catalog & Content Model | â¬œ Not started | â€” |
| 9 | Web Foundation | â¬œ Not started | â€” |
| 10 | Storefront Catalog & SEO | â¬œ Not started | â€” |
| 11 | Sourcing, Procurement & Inventory | â¬œ Not started | â€” |
| 12 | Cart & Pricing | â¬œ Not started | â€” |
| 13 | Checkout, Reservations & Orders | â¬œ Not started | â€” |
| 14 | Payments | â¬œ Not started | â€” |
| 15 | Shipping & Fulfilment | â¬œ Not started | â€” |
| 16 | Background Jobs | â¬œ Not started | â€” |
| 17 | Admin Console | â¬œ Not started | â€” |
| 18 | Content, Reviews & Notifications | â¬œ Not started | â€” |
| 19 | Observability, Caching & Performance | â¬œ Not started | â€” |
| 20 | Hardening & Launch Readiness | â¬œ Not started | â€” |

**Current phase:** Phase 7 — Media & Storage (**not started**).
**Previous phase:** Phase 6 — Identity & Authorization (**complete 2026-08-06**).

---

## Phase 6 — Identity & Authorization

**Completed:** 2026-08-06 · **Status:** Complete

### Scope delivered

- transport-independent `identity` module in `@honey/backend`, composed by the
  Nest/Fastify API without moving business rules into controllers
- normalized-email registration with Unicode-aware password limits, Argon2id
  (`64 MiB`, time cost `3`, parallelism `1`), fail-closed breached-password
  lookup through the Pwned Passwords k-anonymity API, verification emails, and
  transactional persistence
- opaque 256-bit sessions: only SHA-256 hashes persist, absolute and idle expiry
  are server-enforced, rotation/revocation is immediate, and session material is
  returned only in secure `HttpOnly` cookies
- Redis-backed login lockout and password-reset limits; atomic Lua lockout
  transitions and encrypted, one-use staff challenges under concurrency
- staff RFC 6238 TOTP enrollment/challenge/confirmation with AES-256-GCM secret
  storage, bounded clock drift, replay prevention, and mandatory 2FA before a
  staff session can be issued
- exact seven-role, twenty-one-permission seed model, permission-based server
  checks, explicit owner-only role assignment, ownership primitives, immediate
  role-change session revocation, and append-only request-correlated audits
- fail-closed global permission guard and startup scanner: every route must
  declare exactly one public or protected policy
- routes for register, login, TOTP confirmation, logout, logout-all, verification,
  reset, `/v1/me`, own-session listing, and own-session revocation
- strict DTO tampering rejection, double-submit CSRF for unsafe cookie requests,
  safe responses, OpenAPI 3.1/types, real Redis/PostgreSQL tests, CI integration,
  and a dedicated Phase 6 verifier
- forward-only migration for encrypted credential shapes, credential uniqueness,
  absolute session expiry, and audit request IDs; the initial migration is intact
- successful `honey-api:phase6` image with one cached supply-chain-verified frozen
  install, offline production pruning, and a non-root runtime

### Dependency decisions

All additions are exact stable releases and limited to Phase 6.

| Dependency | Version | Reason |
|---|---:|---|
| `argon2` | `0.45.1` | Argon2id password hashing |
| `nodemailer` | `9.0.3` | narrow SMTP/Mailpit adapter |
| `otplib` | `13.4.1` | RFC 6238 TOTP |
| `redis` | `6.1.0` | atomic lockout, limits, and challenges |
| `pg` | `8.22.0` | disposable PostgreSQL integration harness |
| `@types/nodemailer` | `8.0.1` | strict SMTP types |
| `@types/pg` | `8.16.0` | strict PostgreSQL harness types |

Existing Nest/Fastify, Zod, Vitest, Prisma, DB, and contract tools were reused.
No JWT, Passport, OAuth/social login, authentication UI, media/storage adapter,
or Phase 7 scaffold was introduced.

### Files created

- `apps/api/src/http/auth/authorization.guard.ts`
- `apps/api/src/http/auth/authorization.ts`
- `apps/api/src/http/auth/request-principal.ts`
- `apps/api/src/http/auth/route-policy-verifier.ts`
- `apps/api/src/modules/identity/identity.controller.ts`
- `apps/api/test/identity.test.ts`
- `docs/identity-development.md`
- `packages/backend/src/modules/identity/application/identity.service.ts`
- `packages/backend/src/modules/identity/domain/identity.ts`
- `packages/backend/src/modules/identity/domain/ports.ts`
- `packages/backend/src/modules/identity/identity.module.ts`
- `packages/backend/src/modules/identity/index.ts`
- `packages/backend/src/modules/identity/infrastructure/identity-crypto.ts`
- `packages/backend/src/modules/identity/infrastructure/prisma-identity.repository.ts`
- `packages/backend/src/modules/identity/infrastructure/redis-auth-state.adapter.ts`
- `packages/backend/src/modules/identity/infrastructure/smtp-identity-email.adapter.ts`
- `packages/backend/src/modules/identity/module.meta.ts`
- `packages/backend/test/identity.integration.test.ts`
- `packages/backend/test/identity.test.ts`
- `packages/db/prisma/migrations/20260806120000_identity_authorization/migration.sql`
- `scripts/verify-phase6.mjs`

### Files modified

- `.env.example` — safe Phase 6 configuration placeholders
- `.github/workflows/ci.yml` — Redis, identity tests/verifier, and image gate
- `README.md` — Phase 6 status and commands
- `PLANS.md` — Phase 6 complete; Phase 7 current but not started
- `apps/api/package.json` — identity integration test coverage
- `apps/api/src/app.module.ts` — identity composition, guard, and policy scanner
- `apps/api/src/bootstrap/create-application.ts` — identity HTTP integration
- `apps/api/src/config/api-config.ts` — strict identity environment invariants
- `apps/api/src/http/security/security-hooks.ts` — session-cookie CSRF enforcement
- `apps/api/src/modules/platform/platform.controller.ts` — explicit public policy
- `apps/api/src/openapi/document.ts` — identity tag and cookie scheme
- `apps/api/src/openapi/generate.ts` — deterministic Phase 6 contract generation
- `apps/api/src/testing/validation-probe.controller.ts` — explicit test policy
- `apps/api/test/config.test.ts` — Phase 6 configuration matrix
- `docker/api.Dockerfile` — verified cached install and offline production pruning
- `docs/api-development.md` — identity API behavior
- `docs/local-development.md` — Redis, Mailpit, and TOTP runbook link
- `docs/progress.md` — this completion record
- `package.json` — Phase 6 verifier and image gate
- `packages/backend/README.md` — identity ownership and API
- `packages/backend/package.json` — exact identity dependencies
- `packages/backend/src/index.ts` — public identity export
- `packages/config-eslint/index.mjs` — identity layer restrictions
- `packages/contracts/README.md` — identity contract coverage
- `packages/contracts/openapi.json` — generated identity operations/schemas
- `packages/contracts/src/generated/api.ts` — generated identity types
- `packages/db/README.md` — migration and seed notes
- `packages/db/prisma/schema.prisma` — credential, session, and audit changes
- `packages/db/seed/data.ts` — idempotent roles and permissions
- `packages/db/test/constraints.ts` — Phase 6 database constraints
- `packages/db/test/run-integration.ts` — real PostgreSQL rejection proofs
- `packages/db/turbo.json` — serialized Prisma generation
- `pnpm-lock.yaml` — exact Phase 6 dependency graph
- `pnpm-workspace.yaml` — explicit Argon2 native build approval
- `scripts/verify-forbidden-vocabulary.mjs` — whole-word claim matching
- `scripts/verify-phase4.mjs` — immutable initial-migration lookup
- `scripts/verify-phase5.mjs` — assertions superseded only by Phase 6
- `tools/boundaries/checker.mjs` — identity dependency boundaries
- `tools/boundaries/checker.test.mjs` — Phase 6 boundary fixtures

### Decisions made

- No new ADR was required. The implementation follows
  [ADR-0004](adr/0004-modular-monolith.md),
  [ADR-0008](adr/0008-rest-openapi.md),
  [ADR-0010](adr/0010-security-baseline.md),
  [ADR-0015](adr/0015-session-strategy.md),
  [ADR-0017](adr/0017-testing-strategy.md),
  [ADR-0021](adr/0021-shared-backend-package.md), and
  [ADR-0023](adr/0023-docker-strategy.md).
- Session credentials are opaque random values, never JWTs. Only hashes persist;
  the raw value exists at the cookie boundary once.
- Permission strings are the authorization boundary. Owner role assignment also
  requires the explicit owner operation and is always audited.
- Staff sessions require non-replayed TOTP. Secrets are AES-256-GCM encrypted and
  production staff sessions use eight-hour idle/twelve-hour absolute limits.
- Pwned Passwords exposes only a SHA-1 prefix and fails closed within a bound.
- Migration history is immutable. Docker retains pnpm supply-chain verification;
  concurrency/timeouts were tuned instead of bypassing that verification.

### Unresolved decisions

No Phase 6 decision is unresolved and no deliverable is blocked. Existing later
business questions remain open. Phase 7 is current but explicitly not started.

### Risks

- Auth availability depends on Redis; fail-closed behavior prevents bypassing
  lockout, limits, or one-use challenge guarantees during an outage.
- Registration/reset intentionally fail closed if the bounded breached-password
  service request cannot complete; email delivery similarly requires SMTP.
- TOTP depends on synchronized clocks and secure operational storage/rotation of
  `IDENTITY_TOTP_ENCRYPTION_KEY`.
- No customer/admin auth UI exists; that is intentional Phase 6 scope.
- npm registry instability delayed Docker verification. Persistent cache and
  bounded retries reduce repeat work without weakening integrity checks.

### Acceptance checklist

- [x] Registration, login, logout, verification, reset, and identity module exist
- [x] Argon2id, Unicode password limits, and breached-password rejection are server-enforced
- [x] Opaque sessions rotate/revoke immediately and enforce idle/absolute expiry
- [x] Staff cannot authenticate without valid, non-replayed TOTP
- [x] Exact roles/permissions seed idempotently; checks use permissions
- [x] Missing/conflicting route policy prevents boot
- [x] Ownership prevents cross-customer access
- [x] Privileged/security operations append correlated audit events
- [x] Redis lockout, limits, and challenges are atomic under concurrency
- [x] `/v1/me` and own-session responses are safe
- [x] Negative authorization, PostgreSQL, Redis, HTTP, and contract tests pass
- [x] UI/social login are absent and Phase 7 is not scaffolded
- [x] Initial migration and all eight Hero assets are unchanged
- [x] No secrets, prohibited concepts/claims, test weakening, staging, commit, or push

### Verification performed

| Gate | Result |
|---|---|
| Install/frozen lockfile | passed; exact lockfile and approved native builds |
| Prisma format/validate/generate | passed |
| Migration deploy/status and seed twice | passed; database current and seed stable |
| Database integration | passed; 73 tables, 29 enums, 28 PostgreSQL rejection proofs |
| Backend tests | passed; 24/24, 0 skipped; real PostgreSQL/Redis |
| API tests | passed; 22/22, 0 skipped; real PostgreSQL readiness test executed |
| Boundary tests/graph | passed; 13/13 and clean scan |
| OpenAPI generate/drift/lint/forbidden/breaking | passed |
| API image build/inspection | passed; `honey-api:phase6`, non-root `node` |
| `docker compose config --quiet` | passed |
| `pnpm format:check` | passed |
| `pnpm lint` | passed |
| `pnpm boundaries` | passed |
| `pnpm typecheck` | passed; 17/17 workspace tasks |
| `pnpm test` | passed; 17/17 workspace tasks |
| `pnpm build` | passed; 10/10 build tasks |
| Phase 4/5/6 verifiers | passed |
| Hero integrity | passed; status and diff-stat empty for all eight files |

### Independent final verification (2026-08-06)

- Corrected one Phase 6 audit defect: `auth.login_succeeded` declared a session
  subject but the Prisma adapter persisted the user ID as `subjectId`. It now
  persists the actual session ID, with a disposable-PostgreSQL regression proof.
- Both environment-conditional platform tests executed with local PostgreSQL:
  the backend transaction seam and API readiness adapter passed; no test was
  skipped.
- PostgreSQL, Redis, MinIO, and Mailpit were healthy. The disposable migration
  harness applied both migrations, reported 73 tables and 29 enums, passed 28
  rejection proofs, and produced a stable double seed.
- The full requested workspace sequence passed: normal and frozen install,
  format/write and format check, lint, boundaries, typecheck (17/17), tests
  (17/17), build (10/10), Phase 4/5/6 verifiers, OpenAPI drift/type checks, and
  Compose validation.
- `honey-api:phase6` rebuilt successfully, runs as non-root `node`, contains no
  `.env` or Hero media, reached healthy database-backed readiness, and stopped
  cleanly with exit code 0.
- The accepted initial migration and all Hero assets remain unchanged. `.env`
  remains untracked, nothing is staged, and Phase 7 remains explicitly not
  started.

---

## Phase 5 — Backend Library & API Foundation

**Completed:** 2026-08-06 · **Status:** Complete

### Scope delivered

- `@honey/backend` transport-independent platform foundation with typed ports
  for database health, transactions, request context, outbox persistence,
  idempotency, graceful resources, and typed configuration
- stable transport-neutral `AppError` taxonomy with validation, not-found,
  conflict, unauthenticated, forbidden, rate-limited, dependency-unavailable,
  and internal categories; only explicitly safe metadata serializes
- bounded health service and Prisma infrastructure adapter; `@honey/backend` is
  the only workspace package outside `@honey/db` that consumes the database
  package, and the readiness query is table-free `SELECT 1`
- NestJS 11/Fastify 5 API composition root with strict boot configuration,
  explicit proxy/CORS policy, 1 MiB maximum body, DTO validation, JSON-only RFC
  9457 errors, request IDs, structured Pino logs, redaction, rate-limit and CSRF
  foundations, and API security headers
- only `GET /healthz` and `GET /readyz` in production; the validation probe is
  test-only and excluded from production composition and OpenAPI
- deterministic OpenAPI 3.1 and TypeScript generation, Spectral lint,
  forbidden-vocabulary scan, drift check, and OpenAPI 3.1 breaking-change tests
- API-only multi-stage Docker image pinned to the verified Node 22.17.0 Alpine
  digest, frozen pnpm installation, required workspace graph, production
  dependencies, `tini`, non-root runtime, and `/readyz` health check
- Nest shutdown hooks for SIGTERM/SIGINT with a first-signal watchdog, bounded
  Fastify draining, backend/Prisma closure, duplicate-signal safety, lifecycle
  logs, and forced exit only after the configured deadline
- expanded mechanical/ESLint boundaries and GitHub Actions v5 maintenance while
  preserving the Node 22.17.0 project pin, PostgreSQL 16, explicit pnpm cache,
  test database environment, Turborepo passthrough, and all prior gates

### Dependency decisions

All versions were queried from the registry, are stable exact releases, support
Node `22.17.0`, and are compatible with TypeScript `5.9.3`. Nest's adapter and
the direct Fastify dependency share Fastify `5.10.0` to avoid duplicate types.

| Dependency | Version | Reason |
|---|---:|---|
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-fastify` | `11.1.28` | Nest composition and Fastify adapter; no HTTP framework previously existed |
| `@nestjs/swagger` | `11.4.6` | OpenAPI generation from the API composition root |
| `fastify` | `5.10.0` | adapter-compatible runtime; Express was not added |
| `@fastify/cookie` | `11.1.2` | cookie parsing for the CSRF transport seam |
| `@fastify/helmet` | `13.1.0` | API security headers for Fastify 5 |
| `class-transformer` | `0.5.1` | explicit DTO transformation boundary |
| `class-validator` | `0.15.1` | strict global DTO validation |
| `reflect-metadata` | `0.2.2` | Nest decorator metadata runtime |
| `rxjs` | `7.8.2` | Nest peer/runtime requirement |
| `zod` | `4.4.3` | strict boot environment schema |
| `pino` | `10.3.1` | structured logging and redaction |
| `vitest` | `4.1.10` | existing workspace TS testing strategy |
| `tsx` | `4.20.6` | API development and contract generation |
| `@types/node` | `22.18.0` | Node 22 type definitions |
| `openapi-typescript` | `7.13.0` | TypeScript generation from OpenAPI 3.1 |
| `@stoplight/spectral-cli` | `6.16.3` | local OpenAPI linting |
| `@pb33f/openapi-changes` | `0.2.7` | OpenAPI 3.1 breaking reports; replaced an incompatible OpenAPI 3.0-only candidate |
| `prettier` | `3.9.0` | reused repository formatter for generated output |

pnpm explicitly allows the `@pb33f/openapi-changes` binary install and denies
the transitive Scarf telemetry hook. No preview release, range, Express
integration, duplicate logger, or separate rate-limit/CSRF framework was added.

### Files created

- `apps/api/src/app.module.ts`
- `apps/api/src/main.ts`
- `apps/api/src/bootstrap/create-application.ts`
- `apps/api/src/bootstrap/graceful-shutdown.ts`
- `apps/api/src/config/api-config.ts`
- `apps/api/src/http/errors/problem-details.ts`
- `apps/api/src/http/errors/problem.filter.ts`
- `apps/api/src/http/errors/problem-mapper.ts`
- `apps/api/src/http/logging/api-logger.ts`
- `apps/api/src/http/logging/request-id.ts`
- `apps/api/src/http/logging/request-logging.ts`
- `apps/api/src/http/security/csrf.ts`
- `apps/api/src/http/security/rate-limit.ts`
- `apps/api/src/http/security/security-hooks.ts`
- `apps/api/src/http/validation/global-validation.ts`
- `apps/api/src/modules/platform/platform.controller.ts`
- `apps/api/src/openapi/document.ts`
- `apps/api/src/openapi/generate.ts`
- `apps/api/src/testing/validation-probe.controller.ts`
- `apps/api/test/api.integration.test.ts`
- `apps/api/test/config.test.ts`
- `apps/api/test/graceful-shutdown.test.ts`
- `apps/api/test/security.test.ts`
- `apps/api/tsconfig.build.json`
- `docker/api.Dockerfile`
- `docs/api-development.md`
- `packages/backend/README.md`
- `packages/backend/src/errors/app-error.ts`
- `packages/backend/src/errors/foundation-errors.ts`
- `packages/backend/src/errors/index.ts`
- `packages/backend/src/modules/README.md`
- `packages/backend/src/platform/application/health.service.ts`
- `packages/backend/src/platform/domain/config.ts`
- `packages/backend/src/platform/domain/database-health.port.ts`
- `packages/backend/src/platform/domain/graceful-resource.ts`
- `packages/backend/src/platform/domain/health.ts`
- `packages/backend/src/platform/domain/idempotency.ts`
- `packages/backend/src/platform/domain/outbox.ts`
- `packages/backend/src/platform/domain/request-context.ts`
- `packages/backend/src/platform/domain/tokens.ts`
- `packages/backend/src/platform/domain/transaction.ts`
- `packages/backend/src/platform/infrastructure/prisma-platform.adapter.ts`
- `packages/backend/src/platform/infrastructure/request-context.storage.ts`
- `packages/backend/src/platform/index.ts`
- `packages/backend/src/platform/platform.module.ts`
- `packages/backend/test/app-error.test.ts`
- `packages/backend/test/platform.test.ts`
- `packages/backend/tsconfig.build.json`
- `packages/contracts/.spectral.yaml`
- `packages/contracts/README.md`
- `packages/contracts/openapi.json`
- `packages/contracts/scripts/check-breaking.mjs`
- `packages/contracts/scripts/check-forbidden.mjs`
- `packages/contracts/scripts/generate-types.mjs`
- `packages/contracts/src/generated/api.ts`
- `packages/contracts/src/problem-details.ts`
- `packages/contracts/test/breaking.test.mjs`
- `scripts/verify-phase5.mjs`

### Files modified

- `.env.example` — safe API, readiness, rate-limit, and CSRF transport configuration
- `.github/workflows/ci.yml` — official action v5 maintenance and Phase 5/OpenAPI gates
- `README.md` — Phase 5 state, quick start, commands, and workspace roles
- `PLANS.md` — Phase 5 complete; Phase 6 current but not started
- `apps/api/package.json` — exact API dependencies and safe local scripts
- `apps/api/src/index.ts` — API public exports
- `apps/api/tsconfig.json` — strict API source/test checking
- `docs/local-development.md` — API status and runbook link
- `docs/progress.md` — this completion record
- `package.json` — API, OpenAPI, image, and Phase 5 commands
- `packages/backend/package.json` — exact backend dependencies and scripts
- `packages/backend/src/index.ts` — backend public exports
- `packages/backend/tsconfig.json` — strict backend source/test checking
- `packages/config-eslint/index.mjs` — new package/layer import restrictions
- `packages/contracts/package.json` — contract generation, lint, breaking, and tests
- `packages/contracts/src/index.ts` — problem-detail/generated exports
- `pnpm-lock.yaml` — approved exact Phase 5 dependency graph
- `pnpm-workspace.yaml` — binary approval and telemetry denial
- `scripts/verify-forbidden-vocabulary.mjs` — excludes dependency trees and avoids the `secure`/prohibited-term false positive without relaxing prohibited vocabulary
- `scripts/verify-phase4.mjs` — retains its database/CI checks while removing the obsolete assertion that Phase 5 dependencies cannot exist
- `tools/boundaries/checker.mjs` — Phase 5 boundary enforcement
- `tools/boundaries/checker.test.mjs` — negative and valid graph fixtures
- `turbo.json` — dependency builds precede public-type checking and database test URLs pass through to package tests

### Decisions made

- No new ADR was required. The implementation follows
  [ADR-0004](adr/0004-modular-monolith.md),
  [ADR-0008](adr/0008-rest-openapi.md),
  [ADR-0017](adr/0017-testing-strategy.md),
  [ADR-0021](adr/0021-shared-backend-package.md), and
  [ADR-0023](adr/0023-docker-strategy.md).
- Pino is integrated through a small Nest logger adapter and Fastify hooks,
  avoiding another logger and keeping bodies, credentials, cookies, and raw
  query strings outside request log events.
- Rate limiting exposes a replaceable store and uses a single-process Phase 5
  baseline. Redis-backed multi-replica behavior remains deferred and is not
  represented as production-distributed limiting.
- CSRF provides only comparison and exemption transport primitives. Session
  binding/issuance remains Phase 6 work.
- CI breaking comparison is pull-request-only and uses the base branch contract;
  pushes still run generation, drift, lint, and vocabulary checks.

### Unresolved decisions

No Phase 5 decision is unresolved. Redis-backed rate-limit state and
authenticated CSRF/session integration are intentional later-phase work, not
blockers and not pre-wired. Existing later business questions remain open.
Phase 6 is current but explicitly not started.

### Risks

- The in-memory rate-limit store is process-local and must be replaced through
  its port before multi-replica production deployment.
- Readiness fails closed when PostgreSQL is unreachable or slow, so an
  orchestrator may remove the instance until recovery.
- The first contract-introducing pull request has no historical OpenAPI to
  compare; it still runs generation, drift, lint, and vocabulary checks.
- Worker/web images and production Compose remain intentionally absent.

### Acceptance checklist

- [x] Backend is transport-independent and unit-testable without HTTP
- [x] AppError has stable safe output and hidden causes/internal metadata
- [x] Platform ports include only Phase 5 config, health, transaction, outbox, idempotency, context, and shutdown seams
- [x] API is NestJS/Fastify with strict startup validation and no business rules
- [x] Health is database-free; readiness uses the backend/database seam and timeout
- [x] Logging, validation, RFC 9457, rate limit, CSRF, headers, and CORS are tested
- [x] Only health/readiness production endpoints exist
- [x] OpenAPI/types are deterministic, linted, drift/vocabulary/breaking checked
- [x] API/backend/contracts boundaries are mechanically enforced
- [x] API image builds, contains no dev/test/Hero artifacts, runs non-root, and shuts down gracefully
- [x] CI actions use v5; setup-node cache is disabled; prior pins/gates remain
- [x] Dedicated Phase 5 verifier exists; historical verifiers are not substitutes
- [x] No Phase 6 code, later image/Compose, forbidden claim, marketplace, or invented feature added
- [x] Hero unchanged; no secrets, staging, commit, or push

### Verification performed

| Gate | Result |
|---|---|
| Install and frozen lockfile | passed; approved build scripts only |
| Backend with PostgreSQL | passed; 9/9 including transaction seam |
| API focused suite | passed; 16/16 with the PostgreSQL URL passed through by Turborepo |
| API PostgreSQL integration | passed; 7/7 |
| Contract breaking suite | passed; 2/2 including rejected operation removal |
| OpenAPI generate/drift/lint/forbidden/breaking | passed |
| Boundary tests and clean graph | passed; 10/10 and clean scan |
| API image build/inspection | passed; non-root production graph, no tests/Hero |
| Container health/readiness | passed against PostgreSQL 16 |
| SIGTERM | passed; start/completion logs observed within grace |
| `pnpm format:check` | passed |
| `pnpm lint` | passed |
| `pnpm boundaries` | passed |
| `pnpm typecheck` | passed |
| `pnpm test` | passed |
| `pnpm build` | passed |
| `pnpm phase4:verify` | passed |
| `pnpm phase5:verify` | passed |
| CI workflow check | passed; Node 20 action majors absent, all gates wired |
| Hero integrity | passed; status and diff-stat empty for all eight files |

---

## Phase 4 — Database Foundation

**Completed:** 2026-08-06 · **Status:** ✅ Complete

### Scope delivered

- `@honey/db` as the exclusive Prisma/PostgreSQL package, using the current
  Prisma ESM generator and configuration pattern
- 73 mapped Prisma models and 29 PostgreSQL enums across identity, catalog,
  media records needed by catalog, sourcing, procurement, inventory, pricing,
  cart, checkout, orders, payments, shipping, content, and platform
- first migration `20260805231327_initial_foundation`, including all extensions,
  foreign keys, checks, custom partial/specialized indexes, immutable-order
  triggers, append-only triggers, and cross-row payment/refund enforcement
- typed Prisma client construction, transaction handle/work types, transaction
  helper, and UUID v7 identifier helper
- deterministic, idempotent development seed with Persian and English records,
  own-production and selected-supplier sourcing examples, internal-only supplier
  data, roles and permissions, inventory, pricing, shipping, content, locale, and
  currency fixtures
- disposable integration harness that creates a unique database, applies the
  complete migration history, verifies migration status, runs the seed twice,
  proves database rejection behaviour, checks every foreign key has a leading
  index, and drops the temporary database on success or failure
- permanent forbidden-vocabulary verification and expanded boundary enforcement
  for both `@honey/db` and direct Prisma imports
- PostgreSQL 16 CI service isolated from developer data; obsolete permanent
  Phase 2 scope verification removed while the historical script remains intact
- database commands and local-development documentation

### Dependency decisions

| Dependency | Version | Need and repository check |
|---|---:|---|
| `prisma` | `7.9.0` | Stable CLI and migration engine; no existing schema/migration tool was present |
| `@prisma/client` | `7.9.0` | Matching generated type-safe client required by ADR-0005 |
| `@prisma/adapter-pg` | `7.9.0` | Mandatory PostgreSQL driver adapter for Prisma 7 direct connections |
| `pg` | `8.22.0` | PostgreSQL driver used by the adapter and disposable test harness |
| `dotenv` | `17.4.2` | Loads the documented local environment for Prisma configuration |
| `tsx` | `4.20.6` | Runs TypeScript seed and integration harness without adding an application framework |
| `@types/node` | `22.18.0` | Node 22 types for database package source and tooling |
| `@types/pg` | `8.16.0` | Strict types for direct harness diagnostics and database setup/teardown |

Prisma `7.9.0` declares Node `^22.12` support and TypeScript `>=5.4`; the
repository pins Node `22.17.0` and TypeScript `5.9.3`. PostgreSQL 16 is supported
by the PostgreSQL connector. The new packages were registry-resolved and the
lockfile changed only for this approved Phase 4 dependency set. pnpm build-script
approval is limited to Prisma's engine/CLI and esbuild.

### Files created

- `packages/db/README.md`
- `packages/db/prisma.config.ts`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/migration_lock.toml`
- `packages/db/prisma/migrations/20260805231327_initial_foundation/migration.sql`
- `packages/db/seed/data.ts`
- `packages/db/seed/index.ts`
- `packages/db/src/client.ts`
- `packages/db/src/transaction.ts`
- `packages/db/src/uuid-v7.ts`
- `packages/db/test/constraints.ts`
- `packages/db/test/harness.ts`
- `packages/db/test/run-integration.ts`
- `packages/db/tsconfig.build.json`
- `scripts/verify-forbidden-vocabulary.mjs`
- `scripts/verify-phase4.mjs`

### Files modified

- `.env.example` — test-administration URL and optional deterministic staff-seed inputs
- `.github/workflows/ci.yml` — isolated PostgreSQL 16 service, Phase 4 gate, obsolete Phase 2 step removed
- `.gitignore` — generated Prisma ESM client output ignored above the protected guard
- `README.md` — Phase 4 state and database commands
- `PLANS.md` — Phase 4 complete; Phase 5 current but explicitly not started
- `docs/local-development.md` — migration, seed, test database, and safety workflow
- `docs/progress.md` — this completion record
- `package.json` — root database and Phase 4 verification scripts
- `packages/config-eslint/index.mjs` — direct Prisma import restriction outside `packages/db`
- `packages/db/package.json` — pinned Prisma/runtime/tooling dependencies and package scripts
- `packages/db/src/index.ts` — typed public exports
- `packages/db/tsconfig.json` — strict checking for source, config, seed, and tests
- `pnpm-lock.yaml` — approved, pinned Phase 4 dependencies
- `pnpm-workspace.yaml` — narrow build-script approvals for Prisma and esbuild
- `tools/boundaries/checker.mjs` — direct Prisma import enforcement outside `packages/db`
- `tools/boundaries/checker.test.mjs` — direct Prisma negative-boundary test

### Decisions made

- No new ADR was required. The implementation follows accepted
  [ADR-0005](adr/0005-postgresql-prisma.md),
  [ADR-0009](adr/0009-locale-prefixed-routing.md),
  [ADR-0010](adr/0010-single-seller-no-marketplace.md),
  [ADR-0011](adr/0011-immutable-order-snapshots.md),
  [ADR-0012](adr/0012-stock-reservation-strategy.md),
  [ADR-0016](adr/0016-money-minor-units.md),
  [ADR-0017](adr/0017-testing-strategy.md),
  [ADR-0020](adr/0020-no-lab-moisture-medical-claims.md),
  [ADR-0021](adr/0021-shared-backend-package.md), and
  [ADR-0022](adr/0022-payment-verification-sources.md).
- Prisma-generated TypeScript is reproducible and untracked; each build and test
  regenerates it from the committed schema.
- The test harness uses a unique database on an explicit local/CI PostgreSQL
  administration connection, never the normal development database.
- `scripts/verify-phase2.mjs` remains unchanged as a historical/manual verifier;
  only its obsolete permanent CI invocation was removed.

### Unresolved decisions

No Phase 4 decision is unresolved. The existing business questions below remain
open for their documented later phases. Phase 5 is current but explicitly not
started.

### Risks

- Prisma-generated code increases cold build time and remains a required
  generation step before direct package consumption.
- The integration harness requires PostgreSQL 16 and database-creation
  privileges on an approved local/CI host; it intentionally refuses remote hosts.
- The schema is deliberately broad because Phase 4 establishes later bounded
  contexts. Later schema changes remain forward-only migrations; this initial
  applied migration must not be edited after human acceptance.
- `SEED_STAFF_PASSWORD_HASH` is optional. Without it, the development staff row
  is intentionally not usable for authentication until Phase 6 supplies a hash.

### Acceptance checklist

- [x] Complete Phase 4 schema: 73 models, singular mapped tables, 29 enums
- [x] First migration applies from an empty PostgreSQL 16 database
- [x] Required checks, partial/specialized indexes, and explicit foreign-key behavior exist
- [x] Every foreign key has a leading index, verified against PostgreSQL catalogs
- [x] Orders/order lines immutable; stock ledger, audit log, and order status history append-only
- [x] Typed Prisma client, transaction types/helper, and UUID v7 helper exported
- [x] Deterministic seed runs twice with an identical logical fingerprint
- [x] 24 PostgreSQL rejection proofs cover the required database invariants
- [x] Forbidden-vocabulary gate passes
- [x] `@honey/db`/Prisma boundary gate passes and a temporary violation was rejected then removed
- [x] Permanent CI no longer runs the obsolete Phase 2 scope verifier
- [x] CI retains frozen install, format, lint, boundaries, typecheck, tests, and build
- [x] CI database work uses an isolated PostgreSQL 16 service and disposable database
- [x] No Phase 5 dependencies, endpoints, controllers, services, or processors added
- [x] Hero assets unchanged; no secrets, Git staging, commit, or push

### Verification performed

| Gate | Result |
|---|---|
| Prisma format / validate / generate | passed with Prisma `7.9.0` ESM output |
| Empty migration + migration status | passed in a unique disposable PostgreSQL 16 database |
| Seed twice | passed; identical logical fingerprint and no duplicate rows |
| Database integration | passed; 73 domain tables, 29 enums, 24 rejection proofs |
| Foreign-key index catalog audit | passed; no uncovered foreign key |
| Forbidden vocabulary | passed across 37 scoped schema/API/contract/i18n/SEO files |
| Temporary boundary violation | correctly failed for `apps/web` importing `@honey/db`; proof file removed |
| Clean boundary check | passed; no forbidden edge, direct Prisma import, or cycle |
| `pnpm install` | passed |
| `pnpm install --frozen-lockfile` | passed |
| `pnpm format` / `pnpm format:check` | passed |
| `pnpm lint` | passed; all 10 applicable workspace tasks successful |
| `pnpm typecheck` | passed; all 10 applicable workspace tasks successful |
| `pnpm test` | passed; boundary tests 7/7 and all 17 workspace tasks successful |
| `pnpm build` | passed; all 10 applicable workspace tasks successful |
| `pnpm phase4:verify` | passed |
| CI YAML parse and scope check | passed; obsolete Phase 2 step absent, required gates retained |
| Phase 5+ scope scan | passed; no Next.js, NestJS, BullMQ, endpoint, controller, service, or processor |
| Hero integrity | passed; Git status and diff-stat empty for all eight files |

---

## Phase 3 — Local Environment

**Completed:** 2026-08-05 · **Status:** ✅ Complete

### Scope delivered

- infrastructure-only `docker-compose.yml` with PostgreSQL 16, Redis 7, MinIO,
  an idempotent MinIO client initializer, and Mailpit
- health checks for every long-running service and health-gated MinIO bucket
  initialization
- one explicitly named bridge network and named persistent volumes for all
  stateful services
- loopback-only, environment-configurable host ports
- idempotent PostgreSQL extension initialization for `citext`, `pg_trgm`,
  `unaccent`, and `pgcrypto`
- idempotent MinIO creation of `honey-media` and `honey-private`, with anonymous
  read-only access on the public bucket, no anonymous writes, and no anonymous
  access on the private bucket
- Redis append-only persistence with `appendfsync everysec` and no local
  authentication, as required by the active architecture
- persistent Mailpit storage, SMTP capture, and UI/readiness verification
- safe cross-platform root commands for start, stop, status, logs, verification,
  and explicitly confirmed destructive reset
- root `.dockerignore`, required `.gitignore` tracking correction, safe
  environment placeholders, README commands, and the full local-development
  runbook
- no application Dockerfiles, production Compose, Prisma, framework packages,
  endpoints, application containers, or business logic

### Container images

All selected tags are stable, published, non-floating tags from the official
image publishers. Their manifests and pulls were verified on 2026-08-05.

| Service | Image |
|---|---|
| PostgreSQL | `postgres:16.14-alpine3.23` |
| Redis | `redis:7.4.10-alpine3.21` |
| MinIO server | `minio/minio:RELEASE.2025-09-07T16-13-09Z` |
| MinIO client | `minio/mc:RELEASE.2025-08-13T08-35-41Z` |
| Mailpit | `axllent/mailpit:v1.30.6` |

### Decisions made

- The documented public bucket name remains `honey-media`; the private bucket
  is `honey-private`. No third bucket or Hero-media migration was introduced.
- Host ports bind only to `127.0.0.1`. The network is explicitly named
  `honey-local-internal`; production ingress rules remain deferred to Phase 20.
- Mailpit persistence is enabled because it is useful across ordinary local
  container restarts.
- The destructive reset is implemented in Node and refuses non-interactive use;
  it runs `docker compose down --volumes` only after the exact confirmation
  phrase is entered.
- No ADR was required. These implement the existing Docker, storage, database,
  and VPS decisions without changing architecture.

### Files created

- `.dockerignore`
- `docker-compose.yml`
- `docker/local/postgres/init-extensions.sql`
- `docker/local/minio/init-buckets.sh`
- `docs/local-development.md`
- `scripts/docker-reset.mjs`
- `scripts/docker-verify.mjs`

### Files modified

- `.env.example` — local service ports, credentials placeholders, URLs, buckets,
  database migration URL, and Mailpit variables
- `.gitignore` — narrow `docker/local/**` re-inclusion above the permanent guard
  block so the tracked extension SQL is not hidden by the dump rule
- `package.json` — six root Docker lifecycle and verification scripts
- `README.md` — infrastructure-only local startup and command summary
- `PLANS.md` — Phase 3 complete and Phase 4 current but explicitly not started
- `docs/progress.md` — this Phase 3 completion record

### Verification performed

| Gate | Result |
|---|---|
| `docker version` | passed — client/server 29.0.1, Linux containers through Docker Desktop 4.53.0 |
| `docker compose version` | passed — v2.40.3-desktop.1 |
| five `docker manifest inspect` checks | passed for every exact tag |
| `docker compose config` | passed |
| `docker compose pull` | passed for all five images |
| `docker compose up -d` | passed |
| `pnpm docker:down` | passed; all four named volumes remained present |
| `pnpm docker:up` | passed; configuration validated before detached start |
| `pnpm docker:status` | passed; four long-running services healthy and `minio-init` exited 0 |
| `pnpm docker:verify` | passed after a bounded health wait and all resource checks |
| PostgreSQL connection | passed — `pg_isready` reported accepting connections |
| PostgreSQL extensions | passed — `citext`, `pg_trgm`, `pgcrypto`, `unaccent` present |
| Redis | passed — `PONG` |
| MinIO live endpoint | passed — HTTP 200 |
| MinIO authentication and buckets | passed — both configured buckets listed |
| MinIO initializer idempotency | passed — repeated execution exited 0 |
| MinIO anonymous policy | passed — public `download` with no `PutObject`; private policy `{}` / `private` |
| Mailpit readiness/UI | passed — HTTP 200 |
| Mailpit SMTP | passed — TCP connection accepted on host port 1025 |
| `pnpm format` | passed |
| `pnpm format:check` | passed |
| `pnpm lint` | passed — all workspace lint tasks successful |
| `pnpm boundaries` | passed — no forbidden edges or cycles |
| `pnpm typecheck` | passed — all workspace type-check tasks successful |
| `pnpm test` | passed — boundary suite 6 / 6 and all package tasks successful |
| `pnpm build` | passed — all workspace build tasks successful |
| `.gitignore` matrix | passed — 8 local-data cases ignored; all 6 Phase 3 deliverable paths visible |
| MinIO script line endings/syntax | passed — LF, zero CR bytes, `/bin/sh -n` successful |
| Hero integrity | passed — Git status and diff-stat both empty for all eight files |
| Scope scan | passed — no application Dockerfile, production Compose, Prisma file/migration/framework dependency, changed app source, API endpoint, business logic, or app Compose service |

The first registry pull attempts encountered transient Docker Hub TLS handshake
timeouts. Serial and platform-specific retries succeeded, followed by a clean
exact `docker compose pull`. The first live start also found host port 9001
reserved by Windows System; an ignored local `.env` override used host port
19001 for verification while `.env.example` retains the required default 9001.

### Risks

- Local placeholder credentials are intentionally weak and must never be reused
  outside a developer workstation.
- Developer volumes are not backups; confirmed reset permanently deletes local
  PostgreSQL, Redis, MinIO, and Mailpit data.
- Port 9001 is reserved on the verification workstation, so its local MinIO
  console used 19001. Other machines use the documented default unless they
  override it.
- The MinIO public bucket is anonymously readable in local development by
  design. Anonymous write is denied and the private bucket has no anonymous
  policy.

### Unresolved decisions

No Phase 3 decision is unresolved and no later phase is blocked by this work.
The existing business decisions tracked below remain open for their documented
later phases. Phase 4 has not started.

### Acceptance checklist

- [x] Exact five-service infrastructure-only Compose stack created
- [x] Official stable non-floating image tags selected, documented, and verified
- [x] PostgreSQL 16 and Redis 7 majors preserved
- [x] Every long-running service healthy; `minio-init` exited 0
- [x] Named volumes and one explicitly named Docker network created
- [x] Host ports configurable and loopback-only
- [x] Four PostgreSQL extensions installed idempotently and proven present
- [x] Redis AOF enabled and `PONG` verified
- [x] MinIO buckets, authentication, policy safety, and initializer idempotency verified
- [x] Mailpit UI, readiness, SMTP, and persistence verified
- [x] Destructive reset requires exact interactive confirmation
- [x] `.dockerignore`, `.gitignore`, environment placeholders, README, and runbook complete
- [x] Workspace format, lint, boundaries, typecheck, test, and build gates pass
- [x] All Phase 3 out-of-scope artifacts remain absent
- [x] Hero assets unchanged and absent from MinIO
- [x] No secrets introduced and no Git staging, commit, or push performed
- [x] Phase 4 marked current but explicitly not started

---

## Phase 2 — Workspace Foundation

**Completed:** 2026-08-05 · **Status:** ✅ Complete

### Scope delivered

- pnpm workspace and Turborepo task graph for build, lint, type-check, and test
- pinned Node.js `22.17.0` LTS and pnpm `11.20.0`
- strict shared TypeScript bases under `packages/config-ts`
- shared ESLint flat configuration under `packages/config-eslint`
- a zero-dependency architecture checker that enforces forbidden workspace edges, backend public-entry imports, and cycle detection
- empty skeletons for `apps/web`, `apps/api`, `apps/worker`, and all planned shared packages
- Prettier, EditorConfig, line-ending rules, binary Hero media attributes, safe environment placeholders, VS Code recommendations, and CI
- one-command bootstrap scripts for PowerShell and POSIX shells
- no application framework, business logic, Docker, Prisma, or later-phase implementation

### Toolchain decisions

| Dependency | Version | Purpose |
|---|---:|---|
| Node.js | `22.17.0` | Current production LTS runtime selected for the workspace |
| pnpm | `11.20.0` | Pinned workspace package manager |
| Turborepo | `2.10.0` | Deterministic workspace task orchestration and caching |
| TypeScript | `5.9.3` | Strict compilation and declaration output |
| ESLint | `10.7.0` | Flat-config static analysis with zero warnings |
| `@eslint/js` | `10.0.1` | Official JavaScript recommended rules |
| `typescript-eslint` | `8.65.0` | TypeScript parsing and strict TypeScript lint rules |
| Prettier | `3.9.0` | Deterministic formatting |

`dependency-cruiser` was not added. The documented equivalent is implemented in
`tools/boundaries/checker.mjs` without runtime dependencies. It understands both
`@honey/*` aliases and relative imports, validates the allowed workspace graph,
rejects deep imports into backend modules, and detects cycles. Keeping the
checker dependency-free lets the boundary gate run before packages are
installed and makes the architecture contract independently testable.

### Boundary proof

The checker was run against four temporary violations required by the Phase 2
contract. Every probe exited with status `1`, named the exact forbidden edge,
and was then deleted:

| Temporary violation | Result |
|---|---|
| `apps/worker` â†’ `@honey/api` | rejected |
| `apps/web` â†’ `@honey/db` | rejected |
| `apps/api` â†’ `@honey/db` | rejected |
| `packages/ui` â†’ `@honey/backend` | rejected |

After removing the probes, the repository check passed with no forbidden edges
or cycles. The Node test suite for the checker passed **6 / 6** tests, including
all four required violations, one allowed graph, and one cycle case.

### Final verification (2026-08-05)

All required Phase 2 gates passed on the pinned local toolchain and committed
lockfile. The GitHub Actions CI workflow also completed successfully.

| Gate | Result |
|---|---|
| `pnpm install` | passed |
| `pnpm install --frozen-lockfile` | passed |
| `pnpm format:check` | passed |
| `pnpm lint` | passed — all workspace lint tasks successful |
| `pnpm boundaries` | passed — no forbidden edges or workspace cycles |
| `pnpm typecheck` | passed — all workspace type-check tasks successful |
| `pnpm test` | passed — boundary suite 6 / 6 and all package test tasks successful |
| `pnpm build` | passed — all workspace build tasks successful |
| `node scripts/verify-phase2.mjs` | passed — structural verification successful |
| GitHub Actions CI | passed |
| Hero assets | unchanged and outside the Phase 2 documentation closeout diff |

The generated `pnpm-lock.yaml` is present and records TypeScript `5.9.3`,
ESLint `10.7.0`, `@eslint/js` `10.0.1`, `typescript-eslint` `8.65.0`,
Prettier `3.9.0`, Turborepo `2.10.0`, and pnpm `11.20.0`.

### Known limitations

- No browser, API, worker, database, queue, or Docker process exists yet by
  design; those belong to later phases.
- Phase 3 has not started. Its local Docker environment requires a separate,
  explicit instruction.

### Acceptance checklist

- [x] Workspace structure and package manifests created
- [x] Strict TypeScript bases created
- [x] ESLint flat configuration and mechanical boundary enforcement created
- [x] Four mandatory forbidden-edge probes proven to fail and removed
- [x] Turborepo task graph created with no false outputs for non-emitting tasks
- [x] CI workflow created with frozen installation and all quality gates
- [x] Hero paths untouched by the diff
- [x] No Docker, Prisma, or application framework added
- [x] No business logic or fake UI/API added
- [x] Registry-backed `pnpm install` completed
- [x] `pnpm-lock.yaml` generated and reviewed
- [x] Pinned-tool `format:check`, `lint`, `boundaries`, `typecheck`, `test`, and `build` all green
- [x] CI green


## Phase 1 â€” Architecture & Documentation

**Completed:** 2026-08-04 Â· **Status:** âœ…

### Starting state

The repository contained a single commit (`5802ece media added.`) with eight
files and nothing else: no `.gitignore`, no `package.json`, no source, no
documentation.

```
apps/web/public/media/hero/
â”œâ”€â”€ desktop/  honey-poster.webp Â· honey-scroll.mp4 Â· honey-scroll.webm
â”œâ”€â”€ mobile/   honey-poster.webp Â· honey-scroll.mp4 Â· honey-scroll.webm
â””â”€â”€ stills/   hero-start.webp Â· hero-end.webp
```

### Files created (36)

**Root**
- `.gitignore` â€” verified with a 78-case `git check-ignore` matrix
- `AGENTS.md` â€” permanent operating rules for all contributors
- `PLANS.md` â€” delivery plan, roadmap, working agreement, open business questions

**Documentation**
- `docs/product-scope.md`
- `docs/architecture.md`
- `docs/domain-model.md`
- `docs/module-boundaries.md`
- `docs/database-strategy.md`
- `docs/api-strategy.md`
- `docs/security-model.md`
- `docs/docker-strategy.md`
- `docs/i18n-strategy.md`
- `docs/seo-strategy.md`
- `docs/implementation-phases.md`
- `docs/progress.md`

**Architecture Decision Records**
- `docs/adr/README.md` (index + template)
- `docs/adr/0001-pnpm-turborepo-monorepo.md`
- `docs/adr/0002-modular-monolith.md`
- `docs/adr/0003-nextjs-app-router.md`
- `docs/adr/0004-nestjs-fastify.md`
- `docs/adr/0005-postgresql-prisma.md`
- `docs/adr/0006-redis-bullmq.md`
- `docs/adr/0007-s3-storage-abstraction.md`
- `docs/adr/0008-rest-openapi.md`
- `docs/adr/0009-locale-prefixed-routing.md`
- `docs/adr/0010-single-seller-no-marketplace.md`
- `docs/adr/0011-immutable-order-snapshots.md`
- `docs/adr/0012-stock-reservation-strategy.md`
- `docs/adr/0013-payment-provider-abstraction.md`
- `docs/adr/0014-shipping-provider-abstraction.md`
- `docs/adr/0015-session-auth.md`
- `docs/adr/0016-money-minor-units.md`
- `docs/adr/0017-testing-strategy.md`
- `docs/adr/0018-caching-and-invalidation.md`
- `docs/adr/0019-hero-media-preservation.md`
- `docs/adr/0020-no-lab-moisture-medical-claims.md`

### Files modified

None. No existing file was changed. The Hero assets were read only.

### Decisions made

Twenty ADRs, indexed in [`docs/adr/README.md`](adr/README.md). The ones that
constrain the most future work:

| Decision | ADR |
|---|---|
| Modular monolith; extraction criteria written down in advance | [0002](adr/0002-modular-monolith.md) |
| Locale-prefixed routes for *every* locale; sidecar translation tables; `locale` as `text` | [0009](adr/0009-locale-prefixed-routing.md) |
| Single-seller domain, with marketplace vocabulary blocked by a CI contract test | [0010](adr/0010-single-seller-no-marketplace.md) |
| Orders are immutable snapshots, enforced by a database trigger | [0011](adr/0011-immutable-order-snapshots.md) |
| Reserve stock at checkout, not at add-to-cart; ordered row locks; `CHECK` as last defence | [0012](adr/0012-stock-reservation-strategy.md) |
| Payment webhook is the source of truth; the browser is never believed | [0013](adr/0013-payment-provider-abstraction.md) â€” *superseded by [0022](adr/0022-payment-verification-sources.md) on 2026-08-05* |
| Opaque server-side sessions rather than JWTs, chosen for instant revocation | [0015](adr/0015-session-auth.md) |
| Money as integer minor units + currency; single-point rounding | [0016](adr/0016-money-minor-units.md) |
| Hero media is immutable and in-repo, protected by a `.gitignore` guard block | [0019](adr/0019-hero-media-preservation.md) |
| No laboratory, moisture, or medical claims, enforced by a repo-wide CI regex | [0020](adr/0020-no-lab-moisture-medical-claims.md) |

### Verification performed

**`.gitignore`** â€” 78 probe files created at realistic paths, each checked with
`git check-ignore -q`, then all probes and the empty directories they created
removed. **78 / 78 passed, 0 failures.**

Notable cases proven:

| Case | Expected | Result |
|---|---|---|
| `dump.sql`, `db-dumps/honey.sql.gz`, `backups/nightly.dump` | ignored | âœ… |
| `packages/db/prisma/migrations/â€¦/migration.sql` | **tracked** despite the `*.sql` rule | âœ… |
| `.env`, `.env.local`, `apps/api/.env.production` | ignored | âœ… |
| `.env.example`, `apps/api/.env.example` | **tracked** | âœ… |
| `.cursor/probe-scratch.txt`, `.cursor/tmp/probe.json` | ignored | âœ… |
| `.cursor/rules/probe.mdc` | **tracked** | âœ… |
| `assets/raw/â€¦`, `*.mov`, `*.psd`, `*.fig` | ignored | âœ… |
| All eight Hero files, plus `apps/web/public/media/probe-delivery.mp4` | **tracked** | âœ… |
| `docker-compose.override.yml` | ignored | âœ… |
| `docker-compose.prod.yml`, `docker/prod/api/Dockerfile`, `.dockerignore` | **tracked** | âœ… |
| `pnpm-lock.yaml`, `AGENTS.md`, `docs/**` | **tracked** | âœ… |

**Hero assets** â€” `git diff --stat HEAD -- apps/web/public/media/hero` empty;
`git status --porcelain apps/web/public/media/hero` empty. All eight files
byte-identical to `HEAD`.

**Working tree** â€” `git status --porcelain` showed only untracked new files. No
`git add`, `git commit`, or `git push` was run.

**Not run:** `lint`, `typecheck`, `test`, `build`. These scripts do not exist yet;
Phase 1 creates no code. They arrive in Phase 2.

### Risks identified

| Risk | Severity | Mitigation |
|---|---|---|
| Payment provider unchosen; Iranian PSP flows differ from international ones | **High** | The `PaymentProvider` port is capability-flagged and no longer assumes webhooks exist ([ADR-0022](adr/0022-payment-verification-sources.md)). Blocks Phase 14 |
| Documented boundaries erode without the lint rules that enforce them | **High** | The boundary rules are a Phase 2 deliverable, CI-blocking from the start |
| Persian text handling (ZWNJ, Yeh/Kaf variants, digit forms) is easy to get subtly wrong in search and input | Medium | One shared normalizer in `packages/core` used on both write and read; unit tests in Phase 8 |
| RTL layout regressions are visual and invisible to functional tests | Medium | Stylelint bans physical CSS properties; per-direction visual snapshots from Phase 9 |
| ~13 MB of binary Hero media in git | Low | Bounded and immutable; documented in ADR-0019. Not worth Git LFS for eight static files |
| Ambitious Core Web Vitals target alongside a video hero | Medium | Poster-as-LCP with `preload="none"` video; budget enforced in CI from Phase 10 |
| Twenty phases is a long runway; documentation can drift from code | Medium | `docs/progress.md` is a per-phase exit criterion; ADRs are append-only |

### Unresolved decisions

Business decisions needed before the phases they block. Also listed in
[`PLANS.md Â§6`](../PLANS.md).

| # | Question | Blocks | Needed by |
|---|---|---|---|
| 1 | Which payment provider first (Zarinpal / IDPay / direct Shaparak IPG)? Is an international provider needed at launch? | Phase 14 | Before Phase 13 completes |
| 2 | Currency display: store IRR, show Toman on the Persian storefront? A second currency for English? | Phases 12â€“14 | Before Phase 12 |
| 3 | Shipping: flat-rate and manual only at launch, or an integrated carrier? | Phase 15 | Before Phase 15 |
| 4 | VAT applicability, rate, and whether prices are tax-inclusive | Phase 12 | Before Phase 12 |
| 5 | Guest checkout allowed, or is an account required? | Phase 13 | Before Phase 13 |
| 6 | Invoice format, numbering scheme, and any statutory fields | Phase 13 | Before Phase 13 |
| 7 | Are customer reviews in scope for launch? | Phase 18 | Before Phase 18 |
| ~~8~~ | ~~Hosting target~~ | â€” | **âœ… Resolved 2026-08-05** |
| 9 | Production domain, and whether the canonical host is apex or `www` | Phase 10 | Before Phase 10 |
| 10 | Licensed Persian and Latin webfonts for the brand | Phase 9 | Before Phase 9 |

**Resolved â€” #8 Hosting target (2026-08-05).** Self-hosted Linux VPS running
Docker Compose behind a reverse proxy with TLS. Provider-neutral, with the
architecture kept portable to managed services later
([ADR-0023](adr/0023-self-hosted-vps-deployment.md)). Phase 3 is unblocked.
Questions 1â€“7, 9, and 10 remain open and are **not** affected by this decision.

**Technical decisions deliberately deferred**, with a default recorded so nothing
is blocked: Tailwind vs. CSS Modules for `packages/ui` (Phase 9 â€” either
satisfies the logical-properties
requirement); search engine beyond Postgres (Phase 19, only if measurement
demands it); CDN provider (Phase 20 â€” now an optional layer in front of the
self-hosted proxy rather than a hosting decision); VPS provider and sizing
(Phase 20 â€” deliberately interchangeable, which is the point of ADR-0023).

### Notes for the next phase

Phase 3 is the **Local Environment** phase and is not started. Its scope is the
local Docker Compose topology for PostgreSQL, Redis, MinIO, and a mail catcher,
plus health checks, safe example environment variables, and local-development
documentation.

Phase 3 must not add application frameworks, Prisma schemas or migrations,
business logic, application Dockerfiles, or production deployment configuration.
The existing Hero media under `apps/web/public/media/hero/` remains read-only.

Phase 3 requires a separate explicit instruction before any Docker file or local
service configuration is created.

---

## Phase 1 â€” Correction 1 (2026-08-05)

**Scope:** documentation only. No packages installed, no application source code,
no Phase 2 work, no git staging or commits. Hero assets untouched.

### Why

Three problems in the Phase 1 set, all cheaper to fix before the workspace exists
than after.

**1. The API and the worker could not share application logic.** The documents
placed business modules under `apps/api/src/modules/` while also requiring that
`apps/worker` reuse the same application services, not call the API over HTTP,
and respect a dependency graph in which no app imports another app. Those
statements cannot all hold. Whoever wrote the first job handler would have had to
break one of them, and every available way of breaking it is bad: importing
`apps/api`, adding a network hop with an authentication problem attached, or
duplicating the rules so they can drift.

**2. "The webhook is the source of truth" is false for our likely first
provider.** Several Iranian PSPs use redirect-then-server-verify and offer no
reliable webhook. Written as it was, the first domestic integration would have
been a documented exception to a security-critical rule on day one.

**3. The hosting target was open while documents quietly assumed managed
services.** That assumption leaked into backup, pooling, replica, and Docker
decisions, and it blocked Phase 3.

### Files created (3)

- `docs/adr/0021-shared-backend-package.md`
- `docs/adr/0022-payment-verification-sources.md`
- `docs/adr/0023-self-hosted-vps-deployment.md`

### Files modified (11)

| File | Change |
|---|---|
| `PLANS.md` | System shape rewritten around `packages/backend`; Phase 5 and 16 renamed; two fixed constraints added (code placement, payment state) plus hosting; question 8 marked resolved |
| `docs/architecture.md` | System diagram, application boundaries (Â§3.2â€“3.5), workspace layout and dependency direction (Â§4), request lifecycles (Â§5), integrations (Â§9), background processing (Â§10), deployment topology (Â§11), testing (Â§13), non-goals (Â§14) |
| `docs/module-boundaries.md` | Module anatomy moved to `packages/backend` (Â§1); forbidden edges expanded (Â§3); Â§6 now covers all three composition roots; enforcement rules extended (Â§7); adding-a-module steps updated (Â§8) |
| `docs/database-strategy.md` | Owner is now `packages/backend`; pooling, backup, and monitoring adjusted for single-node self-hosting |
| `docs/api-strategy.md` | Â§10 rewritten as three provider-verified inbound paths instead of a webhook-only section |
| `docs/security-model.md` | Trust-boundary diagram splits composition roots from `packages/backend`; Â§8 payment security rewritten around server-verified outcomes |
| `docs/domain-model.md` | `PaymentProvider` port: `getStatus` mandatory, `verifyReturn`/`parseWebhook` optional and capability-declared; Â§11 rules rewritten |
| `docs/docker-strategy.md` | Â§7 production topology rewritten for the self-hosted VPS; deployment sequence and backup section updated; image notes for the shared package |
| `docs/implementation-phases.md` | Module terminology note; Phase 2, 3, 4, 5, 14, 16, 20 updated; universal exit criteria and sequencing rationale extended |
| `docs/adr/README.md` | ADRs 0021â€“0023 indexed; supersession chain section added |
| `docs/progress.md` | This section; status table; hosting question resolved |

### ADRs added

| ADR | Decision |
|---|---|
| [0021](adr/0021-shared-backend-package.md) | All business logic lives in `packages/backend`. `apps/api` is the HTTP composition root, `apps/worker` the BullMQ composition root. Neither imports the other; `packages/db` is reachable only through `packages/backend`; `apps/web` reaches neither |
| [0022](adr/0022-payment-verification-sources.md) | Payment state changes only on a server-to-server provider-verified outcome. Verified webhook, server-side `verifyReturn`, and `getStatus` reconciliation are equally authoritative and converge on one idempotent state machine. No provider must support webhooks; `providerRef`, amount, and currency are always verified. **Supersedes [0013](adr/0013-payment-provider-abstraction.md)** |
| [0023](adr/0023-self-hosted-vps-deployment.md) | Initial deployment is a self-hosted Linux VPS with Docker Compose behind a TLS reverse proxy, provider-neutral and portable to managed hosting later |

### On ADR-0013

ADR-0013 was **not modified**, per the instruction and the append-only rule in
[`docs/adr/README.md`](adr/README.md). Its supersession is recorded in the index's
new *Supersession chain* section and at the top of ADR-0022. A reader who opens
`0013-payment-provider-abstraction.md` directly will not see a status banner
there; that is the deliberate cost of leaving the historical record byte-for-byte
intact. Say the word if you would prefer a one-line status header added to it
instead.

### Consistency checks

| Check | Result |
|---|---|
| All internal documentation links resolve â€” 159 relative links across 38 markdown files | âœ… 0 broken |
| ADRs 0001â€“0020 all still present and unmodified | âœ… `git status --porcelain` lists none of them; only `docs/adr/README.md` was touched in that directory |
| `AGENTS.md`, `.gitignore`, `product-scope.md`, `i18n-strategy.md`, `seo-strategy.md` unchanged | âœ… absent from `git status` |
| No application source code exists (`*.ts`, `*.tsx`, `*.js`, `*.jsx`, `*.prisma`) | âœ… none |
| No package-manager files (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `node_modules`) | âœ… none |
| No Docker or CI files created | âœ… none |
| Hero assets byte-identical to `HEAD` | âœ… `git status` and `git diff` both empty for the hero path |
| No marketplace vocabulary introduced | âœ… `seller`/`vendor`/`merchant`/`commission` appear only in prohibition text |
| No laboratory, moisture, or medical vocabulary introduced | âœ… same â€” prohibition text only |
| No secrets, keys, or credentials in any new text | âœ… placeholders only |
| No `git add`, `commit`, or `push` | âœ… working tree left for review |

`lint`, `typecheck`, `test`, and `build` remain unrunnable â€” those scripts arrive
in Phase 2. Nothing in this correction changes that.

### What did not change

The domain model, the product scope, the i18n strategy, the SEO strategy, and
`AGENTS.md` needed no edits: none of them depended on where the code physically
sits, on the webhook being privileged, or on a hosting provider. The 20 original
ADRs are untouched. Phase 1's deliverable list and acceptance criteria are
unchanged; this corrects the content of documents already delivered.

### Still open

Business questions 1â€“7, 9, and 10 remain open. Only the hosting target was
resolved. In particular, the **payment provider is still unchosen** â€” ADR-0022
makes the architecture tolerant of either provider style, which lowers the cost
of that decision but does not make it.

---

## Decision log (chronological)

| Date | Decision | Recorded in |
|---|---|---|
| 2026-08-04 | Full architecture and documentation set established for Phase 1 | This document |
| 2026-08-04 | 20 ADRs accepted covering stack, boundaries, domain invariants, and product prohibitions | [`docs/adr/`](adr/README.md) |
| 2026-08-04 | `.gitignore` created and verified against a 78-case matrix | This document |
| 2026-08-05 | Business logic moved to `packages/backend`, shared by two composition roots â€” resolves the API/worker contradiction | [ADR-0021](adr/0021-shared-backend-package.md) |
| 2026-08-05 | Payment state changes only on a server-verified outcome from any of three channels; webhooks no longer privileged | [ADR-0022](adr/0022-payment-verification-sources.md) |
| 2026-08-05 | Initial deployment target: self-hosted Linux VPS with Docker Compose and a TLS reverse proxy | [ADR-0023](adr/0023-self-hosted-vps-deployment.md) |
| 2026-08-05 | Phase 3 local environment completed with pinned PostgreSQL, Redis, MinIO, and Mailpit infrastructure | [Phase 3](#phase-3--local-environment) |
| 2026-08-06 | Phase 6 identity and authorization completed with opaque sessions, permission-based authorization, mandatory staff TOTP, Redis lockout, and append-only audits | [Phase 6](#phase-6--identity--authorization) |
