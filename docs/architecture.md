# Architecture

**Style:** modular monolith on a pnpm/Turborepo workspace.
**Rule of thumb:** module boundaries are enforced in code; process boundaries are
introduced only when a measured constraint demands it.

---

## 1. Architectural drivers

| Driver | Consequence |
|---|---|
| Small team, one product, one brand | Modular monolith, not microservices ([ADR-0002](adr/0002-modular-monolith.md)) |
| Money and stock correctness | Single relational database, ACID transactions, server-authoritative pricing |
| Two languages now, more later | Locale is data, not structure; translations are sidecar records ([ADR-0009](adr/0009-locale-prefixed-routing.md)) |
| RTL and LTR from day one | Logical CSS properties only; direction derived from locale |
| Premium visual identity, video hero | Static-first rendering, CDN, strict performance budget |
| Long-lived commerce data | Immutable order snapshots, append-only ledgers ([ADR-0011](adr/0011-immutable-order-snapshots.md)) |
| Provider churn (payments, shipping) | Ports and adapters at every external boundary |
| Must stay auditable and safe | Server-side authorization, audit log, no client-supplied money |

---

## 2. System context

```
                    ┌──────────────────────────────────────┐
   Visitors  ───────▶            CDN / Edge                 │
   Customers        │  static assets · hero media · ISR     │
                    └───────────────────┬──────────────────┘
                                        │
                    ┌───────────────────▼──────────────────┐
   Staff     ───────▶   apps/web — Next.js App Router       │
                    │   storefront + admin console          │
                    │   RSC · i18n routing · RTL/LTR        │
                    └───────────────────┬──────────────────┘
                                        │ HTTPS, internal
                    ┌───────────────────▼──────────────────┐
                    │   apps/api — NestJS on Fastify        │
                    │   modular monolith · REST + OpenAPI   │
                    │   sole owner of the database          │
                    └──┬─────────┬─────────┬─────────┬─────┘
                       │         │         │         │
              ┌────────▼──┐ ┌────▼────┐ ┌──▼─────┐ ┌─▼──────────────┐
              │PostgreSQL │ │  Redis  │ │   S3    │ │ External:      │
              │  primary  │ │ cache + │ │ MinIO   │ │ payment PSP    │
              │           │ │ BullMQ  │ │ locally │ │ shipping       │
              └────────▲──┘ └────▲────┘ └──▲─────┘ │ email / SMS    │
                       │         │         │       └─▲──────────────┘
                    ┌──┴─────────┴─────────┴─────────┴──┐
                    │   apps/worker — BullMQ consumers   │
                    │   no HTTP surface                  │
                    └────────────────────────────────────┘
```

---

## 3. Application boundaries

### 3.1 `apps/web` — presentation and BFF

**Owns:** routing, rendering, layout, design system usage, locale resolution,
direction, SEO metadata, structured data, session cookie handling, and the thin
BFF route handlers that proxy the browser to the API.

**Must not:** connect to PostgreSQL or Redis, import Prisma, hold business rules,
compute prices/discounts/shipping/tax/totals, or make an authorization decision
that is not also enforced by the API.

- Server Components fetch from the API server-to-server, forwarding the caller's
  session; secrets and internal tokens never reach the browser.
- Client Components call the API only through `/api/*` BFF handlers so that the
  session cookie stays `httpOnly` and the API origin is not exposed.
- The admin console is a route group inside the same app
  (`app/[locale]/(admin)/admin/...`) — same deployment, different layout, stricter
  session policy, and **zero** reliance on client-side gating for security.

**Rendering strategy**

| Surface | Strategy |
|---|---|
| Home, editorial, category, product | Static with revalidation (ISR) + tag-based invalidation |
| Search and filtered listings | Server-rendered, short-lived, `no-store` beyond the edge |
| Cart, checkout, account, admin | Dynamic, `private, no-store`, never cached |

### 3.2 `apps/api` — business logic and system of record

**Owns:** every business rule, all persistence, authentication, authorization,
validation, transactions, domain events, and outbound integrations.

**Must not:** render HTML, contain locale-specific copy, or depend on how the web
app is structured.

- One process, many modules ([`module-boundaries.md`](module-boundaries.md)).
- The **only** component with database credentials.
- REST with an OpenAPI 3.1 document as the contract ([`api-strategy.md`](api-strategy.md)).
- Enqueues jobs; never performs slow or unreliable work inline in a request.

### 3.3 `apps/worker` — asynchronous execution

**Owns:** BullMQ consumers, repeatable/scheduled jobs, retries, and dead-letter
handling.

- Shares `packages/db` and `packages/core` with the API and reuses the same
  application services; it does not re-implement business rules.
- No HTTP server beyond a health/metrics endpoint for the orchestrator.
- Scales independently of the API.
- Every handler is **idempotent** — jobs can and will be delivered more than once.

### 3.4 Boundary rules

| From → To | Allowed? |
|---|---|
| `web` → `api` (HTTP) | Yes — the only path |
| `web` → PostgreSQL / Redis / S3 | **No** |
| `worker` → `api` (HTTP) | No — shares application services in-process |
| `api` / `worker` → PostgreSQL | Yes, via `packages/db` only |
| module → another module's tables | **No** — public service interface or domain event |
| `packages/core` → any framework | **No** — pure TypeScript |

---

## 4. Workspace layout

```
Honey-website/
├── apps/
│   ├── web/                    Next.js App Router (storefront + admin)
│   │   ├── src/app/[locale]/(storefront)/…
│   │   ├── src/app/[locale]/(admin)/admin/…
│   │   ├── src/app/api/…       BFF route handlers
│   │   └── public/media/hero/  PROTECTED — existing hero assets
│   ├── api/                    NestJS + Fastify
│   │   └── src/modules/<module>/{domain,application,infrastructure,http}
│   └── worker/                 BullMQ consumers
│
├── packages/
│   ├── core/                   framework-free domain primitives: Money, Locale,
│   │                           Slug, Quantity, result types, domain errors
│   ├── db/                     Prisma schema, migrations, generated client,
│   │                           transaction helper, seed harness
│   ├── contracts/              OpenAPI document + generated types + shared
│   │                           validation schemas (single source of truth)
│   ├── i18n/                   locale config, message catalogs, formatters,
│   │                           direction and calendar helpers
│   ├── ui/                     design system: tokens + primitives, no copy strings
│   ├── config-ts/              shared tsconfig bases
│   ├── config-eslint/          shared lint config incl. boundary rules
│   └── utils/                  small pure helpers, no domain knowledge
│
├── docs/                       this documentation set + ADRs
├── docker/                     Dockerfiles, compose, local service init
└── infra/                      deployment manifests, CI helpers, runbooks
```

**Dependency direction** (never reversed):

```
apps/web ─▶ packages/{ui, i18n, contracts, core, utils}
apps/api ─▶ packages/{db, contracts, core, utils}
apps/worker ─▶ packages/{db, core, utils}
packages/core ─▶ (nothing)
```

`packages/ui` must not import `packages/db`. `packages/core` imports nothing from
the workspace and no framework — it is the only place a rule can live that both
the API and the web app need to agree on.

---

## 5. Request lifecycles

### 5.1 Read: product page in Persian

```
GET /fa/products/asal-konar
  → web: resolve locale=fa, dir=rtl
  → RSC fetch: GET {API}/v1/products/asal-konar?locale=fa
      → api: catalog module → Redis cache (public read, 60s) → Postgres on miss
      → returns localized content + price in minor units + availability band
  → web: format money/dates with Intl for fa-IR, render RTL, emit metadata,
         hreflang alternates and Product JSON-LD
  → cached at the edge with tags: product:{id}, locale:fa
```

### 5.2 Write: checkout

```
POST /api/checkout/confirm            (browser → web BFF)
  → POST {API}/v1/checkout/{id}/confirm, Idempotency-Key required
  → api, single Postgres transaction:
      1. load cart, re-price every line from current server data
      2. revalidate coupon eligibility and recompute discounts
      3. recompute shipping cost from the chosen method + address
      4. recompute tax and totals
      5. verify stock reservations are still ACTIVE and sufficient
      6. create Order + immutable OrderLine snapshots
      7. convert reservations into allocations; append stock ledger entries
      8. write OutboxEvent: order.created
      COMMIT
  → after commit: create payment intent with the provider adapter
  → respond with order number + payment redirect
  → worker: outbox dispatch → confirmation email, admin notification, cache purge
```

Client-supplied totals are never read. The payment result is accepted only from
the provider's verified callback or webhook, never from the browser.

---

## 6. Cross-cutting concerns

### 6.1 Configuration
Environment variables only, validated at process start with a schema; the process
refuses to boot on a missing or malformed value. `.env.example` documents every
variable with safe placeholders and is the only tracked env file. Nothing secret
is ever prefixed `NEXT_PUBLIC_`.

### 6.2 Errors
A single `AppError` taxonomy in `packages/core` (`VALIDATION`, `UNAUTHENTICATED`,
`FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `PROVIDER`, `INTERNAL`)
mapped to RFC 9457 `application/problem+json`. Messages returned to clients are
locale-keyed codes, not English prose; internal details are logged, never
returned.

### 6.3 Logging and tracing
Structured JSON via `pino`. Every request carries a correlation id
(`x-request-id`) that propagates into jobs and outbound calls. OpenTelemetry
traces span web → api → db/redis/provider → worker. PII and secrets are redacted
by a central serializer.

### 6.4 Time and money
UTC everywhere in storage and transport; presentation converts to the user's zone
and calendar. Money is always an integer in minor units plus an ISO-4217 currency
code — never a float, never a formatted string, never a bare number without its
currency ([ADR-0016](adr/0016-money-minor-units.md)).

### 6.5 Idempotency
Every state-changing public endpoint accepts `Idempotency-Key`; checkout and
payment endpoints require it. Keys and their stored responses live in Redis with
a Postgres record for durable replay. Every job handler is idempotent.

---

## 7. Caching boundaries

| Layer | Caches | TTL / invalidation | Never caches |
|---|---|---|---|
| CDN / edge | Hashed static assets, hero media, ISR HTML | Immutable for hashed assets; tag purge for HTML | Anything with a session cookie |
| Next.js data cache | RSC fetches of public catalog and content | Tags `product:{id}`, `category:{slug}`, `content:{key}`, `locale:{locale}`; `revalidateTag` on domain events | Cart, checkout, account, admin |
| API response cache (Redis) | Public catalog/content reads, keyed by route + locale + normalized query | 30–300 s, plus explicit purge | Authenticated responses |
| API in-process | Config, feature flags, locale metadata | Process lifetime | Anything user-scoped |
| Redis (state, not cache) | Sessions, rate-limit counters, idempotency keys, reservation locks, BullMQ | Explicit TTLs | — |

**Rules**

- Cache keys always include the locale and the currency. A cached response must
  never be served across locales.
- Authenticated and personalized responses are `Cache-Control: private, no-store`
  end to end.
- Prices and availability shown on cached pages are advisory; the authoritative
  values are recomputed at add-to-cart and again at checkout.
- Invalidation is event-driven: a domain event lands in the outbox, the worker
  purges the Redis keys and calls the web app's revalidation hook. No blind TTL
  waiting for a price change.
- A cache miss must always be correct. Nothing is *only* in the cache.

---

## 8. Data and storage

- **PostgreSQL** is the single system of record. One logical database, one schema
  namespace per bounded context where useful, one Prisma schema.
  See [`database-strategy.md`](database-strategy.md).
- **Redis** holds sessions, rate limits, idempotency keys, short-lived caches, and
  BullMQ queues. Redis is never the system of record for business data.
- **Object storage (S3-compatible)** holds product media, generated derivatives,
  invoices, and exports, behind a `StorageService` port with an S3 adapter; MinIO
  locally, a managed S3-compatible provider in production
  ([ADR-0007](adr/0007-s3-storage-abstraction.md)).
- **Hero media is not object storage.** The eight files under
  `apps/web/public/media/hero/` ship with the app and are served as immutable
  static assets ([ADR-0019](adr/0019-hero-media-preservation.md)).

---

## 9. External integrations

Every third party sits behind a port defined in the owning module's `domain/`
directory, with the vendor SDK confined to `infrastructure/`.

| Port | Purpose | Notes |
|---|---|---|
| `PaymentProvider` | authorize, capture, verify, refund, parse webhook | [`domain-model.md §11`](domain-model.md) |
| `ShippingProvider` | quote, create shipment, label, track, parse webhook | manual/flat-rate adapter first |
| `StorageService` | put, signed get, delete, copy | S3 / MinIO |
| `MailSender` / `SmsSender` | transactional messaging | locale-aware templates |
| `SearchIndex` | index, query | Postgres-backed first; swappable later |

Rules: no vendor type crosses a module boundary; every adapter has a fake used in
tests; every webhook is signature-verified, replay-protected, and logged raw
before interpretation; every outbound call has a timeout, a retry policy with
jitter, and a circuit breaker.

---

## 10. Background processing

BullMQ on Redis, consumed by `apps/worker`.

| Queue | Responsibility |
|---|---|
| `outbox` | Dispatch committed domain events |
| `email`, `sms` | Transactional messaging |
| `inventory` | Reservation expiry, low-stock alerts, ledger reconciliation |
| `orders` | Post-order workflow, invoice generation, status timeouts |
| `payments` | Provider reconciliation, abandoned-payment expiry, refund polling |
| `media` | Image derivatives, poster extraction, metadata |
| `search` | Index maintenance |
| `cache` | Targeted purge and revalidation |
| `maintenance` | Sitemap regeneration, backup verification, housekeeping |

Conventions: deterministic `jobId` for deduplication; exponential backoff with
jitter; bounded attempts then dead-letter with an alert; per-queue concurrency and
rate limits; no unbounded fan-out; every handler idempotent and safe to replay.

**Transactional outbox** — domain events are written inside the same transaction
as the state change and dispatched afterwards. This is what makes "the order was
created but the email never sent" impossible.

---

## 11. Deployment topology

### 11.1 Environments

| Environment | Purpose | Data |
|---|---|---|
| `local` | Development via Docker Compose | Seeded synthetic data |
| `staging` | Pre-production verification, e2e, migration rehearsal | Anonymized or synthetic |
| `production` | Live | Real, backed up, restore-tested |

### 11.2 Production shape

```
            Internet
               │
        ┌──────▼───────┐
        │ Reverse proxy│  TLS termination, HSTS, security headers,
        │  + CDN edge  │  static/media caching, WAF-style rate limiting
        └──┬────────┬──┘
           │        │
   ┌───────▼──┐  ┌──▼───────────┐
   │ web × N  │  │  api × N     │   stateless, horizontally scalable,
   │ Next.js  │  │  Nest/Fastify│   rolling deploys, readiness-gated
   └──────────┘  └──┬───────┬───┘
                    │       │
             ┌──────▼──┐ ┌──▼──────┐    ┌──────────────┐
             │Postgres │ │  Redis  │    │ worker × M   │
             │ primary │ │ managed │◀───│  BullMQ      │
             │ +replica│ │  + AOF  │    └──────────────┘
             └─────────┘ └─────────┘
                    │
             ┌──────▼──────────┐
             │ S3-compatible   │  media, invoices, exports, backups
             │ object storage  │  versioned, lifecycle-managed
             └─────────────────┘
```

- `web`, `api`, and `worker` are stateless containers; all state is in Postgres,
  Redis, or object storage.
- `worker` scales on queue depth, independently of request traffic.
- Postgres runs managed where possible, with a read replica used only for
  reporting and admin exports — never for read-your-writes paths.
- Health endpoints: `/healthz` (liveness, no dependencies) and `/readyz`
  (readiness, checks DB, Redis, storage). The orchestrator only routes traffic to
  ready instances.

### 11.3 Release process

1. CI: install → lint → typecheck → unit tests → build → integration tests
   (ephemeral Postgres/Redis) → Playwright e2e against a preview → image build.
2. Migrations run as a **separate pre-deploy job**, never on application boot.
3. Schema changes follow **expand → migrate → contract**: additive migration,
   deploy code that tolerates both shapes, backfill, then a later contracting
   migration. This keeps rolling deploys safe.
4. Rolling deploy gated on readiness; automatic rollback to the previous image if
   readiness fails. Because migrations are backwards-compatible within a release
   pair, rollback never requires a down-migration.
5. Post-deploy smoke checks on health, a catalog read, and a synthetic checkout in
   staging.

### 11.4 Observability
Structured logs shipped centrally with correlation ids; OpenTelemetry traces;
RED metrics per endpoint and per queue; error tracking with release tagging;
uptime checks per locale on home, catalog, and product routes; alerts on error
rate, p95 latency, queue depth, dead-letter arrivals, payment-verification
failures, and reservation-expiry backlog.

---

## 12. Performance budget

| Metric | Target |
|---|---|
| LCP (mobile, home) | ≤ 2.5 s on a 4G profile — the hero poster `.webp`, preloaded, is the LCP element |
| INP | ≤ 200 ms |
| CLS | ≤ 0.05 — hero and media reserve their aspect ratio |
| JS shipped, storefront route | ≤ 180 kB gzipped |
| API p95, cached catalog read | ≤ 120 ms |
| API p95, checkout confirm | ≤ 800 ms |

Hero video: `preload="none"`, `muted`, `playsinline`, poster image as LCP, the
`mobile/` source chosen by media query, and the still image substituted entirely
when `prefers-reduced-motion: reduce` is set.

---

## 13. Testing architecture

| Level | Tool | Scope |
|---|---|---|
| Unit | Vitest | Domain logic in `packages/core` and module `domain/` — pure, fast, no I/O |
| Integration | Vitest + ephemeral Postgres/Redis | Repositories, transactions, reservation concurrency, job handlers |
| Contract | Vitest | Handlers validated against the OpenAPI document; the document is diffed in CI |
| Component | Vitest + Testing Library | `packages/ui` and web components, in both directions |
| End-to-end | Playwright | Critical journeys in `fa` and `en`, including RTL layout and axe accessibility checks |

Non-negotiables: the checkout transaction, stock reservation under concurrency,
price recomputation, authorization matrices, and webhook verification all have
integration tests. External providers are exercised through their fakes plus
recorded fixtures — never live in CI.

---

## 14. What we explicitly are not doing

- **Microservices** — no distributed transactions or network hops until a
  measured constraint justifies them ([ADR-0002](adr/0002-modular-monolith.md)).
- **GraphQL** — REST + OpenAPI is the contract ([ADR-0008](adr/0008-rest-openapi.md)).
- **Event sourcing** — snapshots and append-only ledgers where they matter, not
  everywhere.
- **A separate admin app** — the admin console is a route group in `apps/web`.
- **Client-side business logic** — the browser renders, it does not decide.
- **A second database engine** — Postgres does search, queues-of-record, and JSON
  until it measurably cannot.
