# Implementation Phases

**Binding rule:** implement exactly one phase per task, then stop. Never start
the next phase automatically. Each phase's *Out of scope* list is as binding as
its *Deliverables* list — building ahead is a defect, not initiative.

See [`AGENTS.md`](../AGENTS.md) for the enforcement rules and
[`progress.md`](progress.md) for current status.

---

**Terminology.** From Phase 5 onward, "the `<name>` module" always means
`packages/backend/src/modules/<name>/`. A phase that ships a module also ships its
transport adapters — a controller in `apps/api`, a processor in `apps/worker`, or
both — but the business logic itself never lives in an app
([ADR-0021](adr/0021-shared-backend-package.md)).

---

## Universal exit criteria

Every phase, without exception:

- [ ] Deliverables complete; out-of-scope items genuinely absent
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass for every
      affected package (where those scripts exist yet)
- [ ] Hero assets verified unchanged: `git diff --stat HEAD -- apps/web/public/media/hero` is empty
- [ ] No secrets added; `.env.example` updated if new variables were introduced
- [ ] No marketplace concepts; no lab/moisture/medical vocabulary
- [ ] No fake buttons, dead links, or non-functional forms
- [ ] Business logic is in `packages/backend`; `apps/*` contain only composition,
      transport, and presentation
- [ ] `docs/progress.md` updated; ADRs written for architectural decisions
- [ ] No `git add`, `git commit`, or `git push`
- [ ] Report delivered, then **stop**

---

## Phase 1 — Architecture & Documentation ✅

**Goal:** a complete, enforceable architectural contract before any code exists.

**Deliverables** — root `.gitignore` (verified with `git check-ignore`),
`AGENTS.md`, `PLANS.md`, and `docs/`: product scope, architecture, domain model,
module boundaries, database strategy, API strategy, security model, Docker
strategy, i18n strategy, SEO strategy, implementation phases, progress, and the
ADR set.

**Out of scope** — any `package.json`, dependency installation, application
source, Docker files, Prisma schema, or CI configuration.

**Acceptance** — `.gitignore` verified against a full probe matrix; Hero assets
untouched; every required document present and internally consistent.

---

## Phase 2 — Workspace Foundation

**Goal:** an empty but correct monorepo that builds, lints, and type-checks.

**Deliverables**
- `pnpm-workspace.yaml`, root `package.json`, pinned Node and pnpm via `packageManager`
- `turbo.json` with the `build` / `lint` / `typecheck` / `test` pipeline, correct
  `dependsOn` and cache inputs/outputs
- `packages/config-ts` — strict base tsconfigs (`strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`)
- `packages/config-eslint` — shared ESLint flat config including the
  `no-restricted-imports` boundary rules from
  [`module-boundaries.md §7`](module-boundaries.md), and a `dependency-cruiser`
  configuration expressing the dependency graph from
  [ADR-0021](adr/0021-shared-backend-package.md)
- Prettier, EditorConfig, `.gitattributes` (LF normalization, binary media marked)
- Empty placeholder packages with `package.json` + `tsconfig.json` only —
  including **`packages/backend`**, whose presence from day one is what keeps
  business logic out of `apps/*`
- `.env.example` with every planned variable and safe placeholders
- CI workflow skeleton: install → lint → typecheck → build (no deploy)
- `.vscode/extensions.json`

**Out of scope** — any application code, Docker, Prisma, framework installation
beyond tooling.

**Acceptance** — `pnpm install` succeeds from a clean clone; `pnpm lint`,
`pnpm typecheck`, `pnpm build` all pass on an empty workspace; CI is green; the
boundary rules are **active and failing on a deliberately introduced violation**
(`apps/worker` importing `apps/api`, and `apps/web` importing `packages/db`)
before that test violation is removed. A boundary rule added after violations
exist never gets turned on, so it is proven working while the workspace is empty.

---

## Phase 3 — Local Environment

**Goal:** `docker compose up` gives a working local stack.

**Deliverables** — `docker-compose.yml` with `postgres:16`, `redis:7`, `minio`,
`minio-init`, `mailpit`; health checks and `service_healthy` dependencies;
Postgres init SQL for `citext`, `pg_trgm`, `unaccent`, `pgcrypto`; MinIO bucket
and policy bootstrap; `.dockerignore`; a documented `docker-compose.override.yml`
example (not committed); a local-setup runbook.

The local topology deliberately mirrors the production target — the same
containers behind a reverse proxy on one host
([ADR-0023](adr/0023-self-hosted-vps-deployment.md)) — so "works locally" carries
more weight than usual.

**Out of scope** — application Dockerfiles (Phase 5+), production compose
(Phase 20), any application code.

**Acceptance** — a clean `docker compose up -d` reaches healthy for every
service; Postgres accepts connections with extensions present; MinIO buckets
exist; Mailpit UI reachable; all data paths gitignored.

---

## Phase 4 — Database Foundation

**Goal:** the schema core exists and migrates cleanly.

**Deliverables** — `packages/db` with the Prisma schema for identity, catalog +
translations, sourcing, procurement, inventory + ledger + reservations, pricing,
cart, checkout, orders + snapshots, payments, shipping, content, and platform
tables; the first migration; the `CHECK` constraints and immutability/append-only
triggers from [`database-strategy.md §4`](database-strategy.md); the index set
from §5; a typed Prisma client export and transaction helper; an idempotent seed;
integration-test harness with an ephemeral database.

`packages/db` is consumed only by `packages/backend`
([ADR-0021](adr/0021-shared-backend-package.md)); the lint rule forbidding
`@honey/db` imports elsewhere is enabled in this phase.

**Out of scope** — API endpoints, business logic, admin UI.

**Acceptance** — migrate from empty to current with no errors; seed runs twice
with identical results; constraint tests prove negative stock, order mutation,
and ledger updates are rejected at the database level; no schema identifier
matches the forbidden-vocabulary regex.

---

## Phase 5 — Backend Library & API Foundation

**Goal:** the shared backend library exists and the API hosts it. No business
logic yet in either.

**Deliverables**

- **`packages/backend`** — the package skeleton: the `src/modules/` layout, the
  four-layer conventions, the `platform` module (config, health, outbox and
  idempotency primitives), the `AppError` taxonomy, the transaction helper wired
  to `packages/db`, and the DI conventions from
  [ADR-0021](adr/0021-shared-backend-package.md). No domain modules yet.
- **`apps/api`** — the HTTP composition root: NestJS + Fastify bootstrap; env
  schema validation that refuses to boot on bad config; pino structured logging
  with request correlation; `AppError` mapped to RFC 9457; a global validation
  pipe rejecting unknown properties; OpenAPI generation to
  `packages/contracts/openapi.json` plus generated types; `/healthz` and
  `/readyz` (checking the database through the `platform` health service, not
  through Prisma); rate-limit and CSRF middleware; security headers; graceful
  shutdown; `docker/api.Dockerfile`; the OpenAPI drift and breaking-change CI
  checks.

**Out of scope** — any domain module, authentication, the worker (Phase 16),
database reads beyond the readiness probe.

**Acceptance** — API boots and serves health; OpenAPI generates and matches the
committed document; an invalid env var prevents boot; error responses are
problem+json; `SIGTERM` drains cleanly; **`apps/api` contains no business logic
and imports no Prisma**, enforced by lint; `packages/backend` builds and its
tests run **without starting an HTTP server**, which is the practical proof that
the library is genuinely transport-independent.

---

## Phase 6 — Identity & Authorization

**Goal:** users, sessions, and permissions — the gate everything else sits behind.

**Deliverables** — the `identity` module; registration, login, logout, email
verification, password reset; argon2id hashing; opaque session cookies with
rotation and revocation; staff TOTP two-factor; the role and permission model
seeded; the fail-closed permission guard and the startup check that every route
declares one; ownership checks; audit log; rate limiting and lockout on auth;
`/v1/me`; the full authorization test matrix.

**Out of scope** — customer UI (Phase 9), admin UI (Phase 17), social login.

**Acceptance** — an endpoint without a permission declaration prevents boot;
customers cannot read another customer's data; staff cannot authenticate without
TOTP; sessions revoke immediately; every privileged action is audited; the
negative-authorization tests pass.

---

## Phase 7 — Media & Storage

**Goal:** a storage abstraction with an S3 adapter and a safe upload pipeline.

**Deliverables** — the `StorageService` port and S3 adapter (MinIO locally); the
`media` module with `MediaAsset` and derivatives; pre-signed direct uploads;
magic-number content sniffing with an allow-list that rejects SVG; EXIF stripping
and derivative generation; per-locale alt text; signed URLs for private objects;
an in-memory fake adapter for tests.

**Out of scope** — the media library UI, video transcoding, CDN configuration.
**Explicitly out of scope: the Hero assets.** They ship as static app assets and
never enter object storage.

**Acceptance** — upload, derive, and signed retrieval work end to end against
MinIO; a renamed executable and an SVG are both rejected; EXIF GPS is stripped;
the fake adapter passes the same contract test suite as the real one.

---

## Phase 8 — Catalog & Content Model

**Goal:** products, variants, and translations, served through the public API.

**Deliverables** — the `catalog` module: products, variants, categories,
collections, media links, per-locale translations with unique `(locale, slug)`,
slug history, publish workflow with the all-locales-required rule; sourcing
fields (`sourcingType`, apiary, harvest batch reference) with supplier data
excluded from every public DTO; public read endpoints with locale resolution,
cursor pagination, filtering, sorting, and Postgres-backed search with Persian
normalization; Redis caching with tag-based invalidation.

**Out of scope** — pricing (Phase 12), stock numbers (Phase 11), admin UI, the
storefront.

**Acceptance** — public responses contain no supplier field, proven by the
OpenAPI forbidden-field contract test; publishing is blocked without a
translation for every enabled locale; slug changes 301; Persian search matches
across Arabic/Persian Yeh and ZWNJ variants.

---

## Phase 9 — Web Foundation

**Goal:** the Next.js shell, both locales, both directions, and the Hero.

**Deliverables** — `apps/web` on the App Router with `[locale]` segments and
route groups for storefront and admin; `packages/i18n` with locale config,
catalogs, formatters, and generated key types; locale middleware and the
pathname map; `<html lang dir>` from config; `packages/ui` design tokens and
primitives built on logical CSS properties with the stylelint rule enforcing
them; per-locale font loading; the generated API client; session cookie handling
in the BFF; the layout shell; **Hero section integration** using the existing
assets exactly as they are, with the reduced-motion still fallback; the
language switcher; Playwright and axe set up for both locales.

**Out of scope** — catalog pages (Phase 10), cart, checkout, admin screens.

**Acceptance** — both locales render with correct direction; no physical CSS
properties in components; no hardcoded user-facing strings; the Hero renders the
existing files unmodified with the poster as LCP; `prefers-reduced-motion` shows
the still and loads no video; the hero asset diff is empty.

---

## Phase 10 — Storefront Catalog & SEO

**Goal:** browsable, indexable catalog pages in both languages.

**Deliverables** — home, category, collection, product detail, and search pages;
filtering, sorting, cursor pagination; responsive galleries with AVIF/WebP;
`generateMetadata` per route and locale; canonical and reciprocal hreflang;
JSON-LD builders for Organization, WebSite, Product, BreadcrumbList,
CollectionPage; sitemap index and per-locale sitemaps with alternates;
`robots.txt` with staging protection; ISR with tag invalidation; the Core Web
Vitals budget enforced in CI.

**Out of scope** — cart and checkout, reviews, editorial CMS pages.

**Acceptance** — structured data validates with no health/lab/moisture
properties; hreflang is reciprocal and only covers published translations;
staging serves `Disallow: /` and `noindex`; Core Web Vitals targets met on
mobile for home, listing, and product.

---

## Phase 11 — Sourcing, Procurement & Inventory

**Goal:** stock that is correct, traceable, and impossible to oversell.

**Deliverables** — the `sourcing` module (apiaries, harvest batches, batch
allocation, the own-production/supplier `CHECK`); the `procurement` module
(suppliers, purchase orders, goods receipts, landed cost) — **admin-only, never
public**; the `inventory` module (locations, inventory items, append-only ledger,
availability computation, availability bands for the storefront, low-stock
alerts, reconciliation job); concurrency tests.

**Out of scope** — reservations (Phase 13), the admin UI (Phase 17),
multi-warehouse routing.

**Acceptance** — a goods receipt is the only inbound path and always writes a
ledger entry; the ledger reconciles to `inventory_item` exactly; negative stock is
rejected by the database; no procurement or supplier field appears in any public
response; the storefront receives a band, never a count.

---

## Phase 12 — Cart & Pricing

**Goal:** a server-authoritative cart with no persisted prices.

**Deliverables** — the `pricing` module: variant prices with validity windows,
coupons, tax rules, and the fixed total-computation order with single-point
rounding; the `cart` module: cart, lines, quantity clamping to availability,
anonymous-to-user merge on sign-in, expiry; cart UI in both locales; a coupon
form with server-side validation and rate limiting; rejection plus a tampering
audit event for any client-supplied money field.

**Out of scope** — checkout, reservations, payment.

**Acceptance** — `cart_line` stores no money; prices are recomputed on every
read; a request containing `price` or `total` returns `422` and emits
`security.tampering_attempt`; `Σ lines == cart total` exactly, verified by a
property test across rounding edge cases.

---

## Phase 13 — Checkout, Reservations & Orders

**Goal:** the transaction that turns a cart into an immutable order.

**Deliverables** — stock reservations with TTL, row-locked acquisition in
ascending `variant_id` order, a sweeper job, and lazy expiry on read; checkout
sessions, addresses, and shipping-quote selection; the confirm transaction in the
exact order specified in [`domain-model.md §9`](domain-model.md); mandatory
`Idempotency-Key`; order creation with immutable line and address snapshots
including all locales; the order status state machine; order confirmation and
account order history; checkout UI in both locales.

**Out of scope** — real payment capture (Phase 14), shipment creation (Phase 15).

**Acceptance** — concurrent checkouts for the last unit produce exactly one
order and one `INSUFFICIENT_STOCK`; a replayed confirm returns the original
order; order rows reject updates to financial fields at the database level; an
order renders correctly after the product is renamed, re-priced, and archived;
an abandoned checkout releases its reservation.

---

## Phase 14 — Payments

**Goal:** money, verified by the provider server-to-server and never by the
browser ([ADR-0022](adr/0022-payment-verification-sources.md)).

**Deliverables** — the `PaymentProvider` port with declared `capabilities`;
payment, attempt, transaction, and refund records; **one idempotent, monotonic
`applyPaymentOutcome` state machine** reached identically by all three
verification paths; the redirect/return flow with server-side `verifyReturn`; a
webhook endpoint with raw-body signature verification, timestamp window, unique
event id, raw persistence, immediate `200`, and asynchronous idempotent
processing — built as an **optional** capability, since not every provider offers
it; the **mandatory** `getStatus` reconciliation job; verification of
`providerRef`, amount, and currency with a reconciliation alert on mismatch;
refunds with step-up authentication and a remaining-amount cap; the first
provider adapter (to be chosen — see [`PLANS.md §6`](../PLANS.md)); a fake
provider for tests.

**Out of scope** — multiple providers, saved payment methods, installments.

**Acceptance** — a forged `?status=success` return does not mark an order paid;
each of the three verification paths independently drives the payment to the
same terminal state; applying the same outcome twice is a no-op and a late
`PENDING` never un-pays a `PAID` payment; a provider adapter with
`webhooks: false` still reaches a terminal state through `verifyReturn` and
`getStatus`; an amount, currency, or `providerRef` mismatch raises an alert
instead of marking the order paid; refunds cannot exceed the remaining refundable
amount.

---

## Phase 15 — Shipping & Fulfilment

**Goal:** rates that the server computes and shipments staff can operate.

**Deliverables** — the `ShippingProvider` port; the `manual-flat` adapter; zones,
methods with translations, weight- and subtotal-based rates, free-shipping
thresholds; quoting during checkout with expiry and re-quote on confirm;
shipments, shipment lines, tracking numbers and events; partial fulfilment;
customer-facing tracking; fulfilment notification emails.

**Out of scope** — a live carrier API integration, label printing, returns
logistics beyond the request record.

**Acceptance** — shipping cost always comes from a server quote; a
client-supplied shipping total is rejected; an expired quote is re-quoted and the
change is shown before confirmation; partial fulfilment moves the order to
`PARTIALLY_FULFILLED` and no further.

---

## Phase 16 — Background Jobs

**Goal:** the BullMQ composition root, running everything that must not happen in
a request.

**Deliverables** — `apps/worker` as a headless Nest application context over the
**same** `packages/backend` modules the API hosts
([ADR-0021](adr/0021-shared-backend-package.md)); the queue set from
[`architecture.md §10`](architecture.md); processors that deserialize, validate a
versioned payload schema, and call an existing application service; the
transactional outbox dispatcher; repeatable jobs (reservation sweep, payment
`getStatus` reconciliation, sitemap regeneration, inventory reconciliation,
backup verification); retry with exponential backoff and jitter, bounded attempts,
dead-letter capture with alerting; deterministic `jobId` deduplication; graceful
shutdown that lets active jobs finish; `docker/worker.Dockerfile`; queue metrics
and a `JobFailure` record.

Job **producers** already exist in `packages/backend/**/infrastructure` from the
phases that needed them; this phase adds only the consumption side.

**Out of scope** — new business logic of any kind. Every rule a processor needs
already exists as an application service, or the phase that should have created
it was incomplete.

**Acceptance** — every handler is proven idempotent by a duplicate-delivery test;
an outbox event is dispatched exactly once from the domain's perspective; a
failing job lands in the dead-letter set and alerts; `SIGTERM` during a job
completes it or returns it for redelivery; **`apps/worker` imports neither
`apps/api` nor the generated API client**, enforced by lint; a payload written by
the previous release is still readable.

---

## Phase 17 — Admin Console

**Goal:** staff can run the business without touching the database.

**Deliverables** — the `(admin)` route group with a stricter session policy;
catalog management with a per-locale translation editor and completeness
indicators; media library; pricing and coupons; inventory with adjustments,
reasons, and ledger view; sourcing (apiaries, harvest batches, allocation);
procurement (suppliers, purchase orders, goods receipts); order management with
fulfilment, refunds, cancellation, and notes; customer lookup; settings; the
audit-log viewer; step-up authentication on dangerous operations.

**Out of scope** — analytics dashboards, bulk import/export beyond CSV order
export, any seller-facing surface (permanently).

**Acceptance** — every screen is server-authorized and works when the client-side
guard is bypassed; no seller or commission concept exists anywhere; privileged
actions are audited; publishing is blocked on missing translations; the admin UI
itself works in both `fa` and `en`.

---

## Phase 18 — Content, Reviews & Notifications

**Goal:** editorial content, moderated reviews, and localized messaging.

**Deliverables** — the `content` module (pages, articles, FAQ with per-locale
slugs and block content) plus storefront rendering with `Article` and `FAQPage`
structured data; the `reviews` module with verified-purchase linkage, moderation
queue, and moderation guidance that rejects health claims; the `notifications`
module with per-locale templates, delivery records, and a newsletter with
double opt-in; every message rendered in the recipient's locale.

**Out of scope** — a visual page builder, user-generated media, comments.

**Acceptance** — content is authored per locale and publish-gated; reviews appear
only after approval; `aggregateRating` is emitted only from real approved
reviews; order emails use `order.localeAtPurchase`; RTL email templates render
correctly in major clients.

---

## Phase 19 — Observability, Caching & Performance

**Goal:** we can see what is happening and it is fast.

**Deliverables** — OpenTelemetry tracing across web → api → db/redis/provider →
worker; RED metrics per route and per queue; error tracking with release tagging;
uptime checks per locale; the alert set from
[`security-model.md §12`](security-model.md) and
[`database-strategy.md §12`](database-strategy.md); the caching layers from
[`architecture.md §7`](architecture.md) with event-driven invalidation; query
optimization from real `pg_stat_statements` data; the bundle-size and Core Web
Vitals budgets enforced in CI; load testing of the checkout path.

**Out of scope** — new features of any kind.

**Acceptance** — a single trace spans a full checkout including the job it
enqueues; cache invalidation is event-driven and verified; the performance budget
gates CI; load testing shows no oversell and no deadlock under contention.

---

## Phase 20 — Hardening & Launch Readiness

**Goal:** safe to operate in production on a self-hosted VPS
([ADR-0023](adr/0023-self-hosted-vps-deployment.md)).

**Deliverables** — production Dockerfiles, `docker-compose.prod.yml`, and
`docker/prod/`; VPS provisioning documented as code (firewall exposing only the
proxy, unattended security updates, non-root deploy user, SSH hardening); reverse
proxy with automatic TLS renewal, HSTS, and the security headers, asserted by
tests; secret management with a rotation procedure; **off-host** automated
backups with a **rehearsed and timed restore drill**; PITR verified from WAL
archives; disk, certificate-expiry, and resource-limit monitoring; a documented
deployment pipeline with pre-deploy migrations and rollback; runbooks in
`infra/runbooks/` (incident, restore, rollback, oversell, payment reconciliation,
key rotation, VPS rebuild); a dependency audit and SBOM; an external penetration
test; a full accessibility audit; the SEO launch checklist; and a go-live
checklist.

**Out of scope** — new features, and migration to managed services. This phase
only hardens what exists.

**Acceptance** — a restore drill completes within the RTO target **onto a freshly
provisioned host** and is documented; backups are verified to exist off the VPS
and the backup credential is proven unable to delete; security headers verified
in production; only the reverse proxy has published ports; penetration-test
findings resolved or accepted in writing; no secrets in any image layer; rollback
rehearsed successfully; every runbook executed at least once by someone who did
not write it.

---

## Sequencing rationale

The order is driven by dependency, not by visibility. Documentation precedes code
so the rules exist before there is anything to break them. The database precedes
the backend library, and the library precedes both of its hosts, because
`packages/backend` existing from Phase 5 is what makes "the worker reuses the
same application services" true by construction rather than by discipline.
Identity
precedes every feature because retrofitting authorization is how access-control
bugs are born. Catalog precedes cart, cart precedes checkout, checkout precedes
payment — money last, when everything it depends on is already proven. The worker
comes after the flows it serves so its jobs are extracted from real code rather
than imagined. Admin comes late because it is a client of everything else.
Hardening comes last because you can only harden what exists.
