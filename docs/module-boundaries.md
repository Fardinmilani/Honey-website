# Module Boundaries and Ownership

A modular monolith only stays modular if the boundaries are **mechanically
enforced**. This document defines the modules, who owns what, how modules are
allowed to talk, and how the rules are checked in CI.

---

## 1. Anatomy of a module

Every module lives in `packages/backend/src/modules/<module>/` and has the same
three layers plus a public barrel:

```
<module>/
├── domain/            entities, value objects, policies, PORT interfaces
│                      pure TypeScript — no Nest, no Prisma, no HTTP, no BullMQ
├── application/       use cases / services; orchestrates domain + ports;
│                      owns transaction boundaries
├── infrastructure/    Prisma repositories, provider adapters, queue PRODUCERS
│                      — implements the ports declared in domain/
└── index.ts           the module's PUBLIC surface — nothing else is importable
```

**Transport layers live in the applications, not in the module.** Each
composition root keeps a thin adapter that maps its transport onto the same
application services ([ADR-0021](adr/0021-shared-backend-package.md)):

```
apps/api/src/modules/<module>/        controller · DTOs · guards · OpenAPI decorators
apps/worker/src/processors/<queue>/   job payload → validate → application service
```

**Dependency direction is one way:**

```
apps/api  ─┐
           ├─▶ application ──▶ domain ◀── infrastructure
apps/worker┘
```

`domain` depends on nothing. `infrastructure` implements `domain` ports. A
`domain` file that imports Prisma, Nest, BullMQ, or a vendor SDK is a bug and
fails lint. `application` and `infrastructure` may carry Nest DI decorators —
metadata only; `packages/backend` never calls `NestFactory`.

**Why the split.** The worker must run the same rules as the API without
importing it and without calling it over HTTP. Putting the modules in a library
that both apps depend on is the only arrangement in which "reuse the same
application services" and "no app imports another app" are both true.

---

## 2. Module catalogue

| Module | Responsibility | Owns tables | Queues | Public routes |
|---|---|---|---|---|
| `identity` | Auth, sessions, users, roles, permissions, audit | `user`, `auth_credential`, `session`, `verification_token`, `role`, `permission`, `role_permission`, `user_role`, `audit_log` | `email` | `/v1/auth/*`, `/v1/me/*` |
| `catalog` | Products, variants, categories, collections, translations, slugs | `product*`, `product_variant*`, `category*`, `collection*`, `product_media`, `slug_history` | `search`, `cache` | `/v1/products`, `/v1/categories`, `/v1/collections` |
| `media` | Media assets, uploads, derivatives, signed URLs | `media_asset`, `media_derivative` | `media` (future consumption) | `/v1/admin/media/*` |
| `pricing` | Variant prices, coupons, tax rules, total computation | `variant_price`, `coupon`, `coupon_redemption`, `tax_rate` | — | internal + `/v1/coupons/validate` |
| `sourcing` | Apiaries, harvest batches, batch allocation | `apiary*`, `harvest_batch`, `batch_allocation` | — | admin only |
| `procurement` | Suppliers, purchase orders, goods receipts | `supplier`, `purchase_order*`, `goods_receipt*` | — | **admin only — never public** |
| `inventory` | Locations, stock state, ledger, reservations | `stock_location`, `inventory_item`, `stock_ledger_entry`, `stock_reservation` | `inventory` | availability via `catalog` |
| `cart` | Carts, lines, merge | `cart`, `cart_line` | — | `/v1/cart/*` |
| `checkout` | Checkout sessions, addresses, quotes, confirm transaction | `checkout_session`, `address`, `shipping_quote` | `inventory` | `/v1/checkout/*` |
| `orders` | Orders, snapshots, status machine, returns | `order`, `order_line`, `order_status_history`, `order_note`, `return_request` | `orders` | `/v1/orders/*` |
| `payments` | Payments, attempts, refunds, provider adapters, webhooks | `payment*`, `refund`, `provider_event` | `payments` | `/v1/payments/*`, `/webhooks/payments/:provider` |
| `shipping` | Zones, methods, rates, shipments, tracking | `shipping_*`, `shipment*`, `tracking_event` | `orders` | `/v1/shipping/methods`, `/webhooks/shipping/:provider` |
| `content` | Pages, articles, FAQ | `page*`, `article*`, `faq_item*` | `cache` | `/v1/content/*` |
| `reviews` | Product reviews and moderation | `product_review` | `email` | `/v1/products/:id/reviews` |
| `notifications` | Templates, deliveries, newsletter | `notification_*`, `newsletter_subscription` | `email`, `sms` | `/v1/newsletter` |
| `platform` | Outbox, idempotency, settings, flags, health | `outbox_event`, `idempotency_key`, `setting`, `feature_flag`, `job_failure` | `outbox`, `maintenance` | `/healthz`, `/readyz` |

**Table ownership is exclusive.** Exactly one module may read or write a given
table. Anything else goes through that module's public service or a domain event.

---

## 3. Allowed dependency graph

```
                       ┌──────────┐
                       │ platform │  ← everyone may use outbox/idempotency
                       └────▲─────┘
                            │
   identity ◀──────────── (auth context is injected, not imported ad hoc)
       ▲
       │
  ┌────┴─────┐   ┌─────────┐   ┌──────────┐
  │ catalog  │◀──│ pricing │   │  media   │
  └────▲─────┘   └────▲────┘   └────▲─────┘
       │              │             │
       │         ┌────┴────┐        │
       └─────────│  cart   │        │
                 └────▲────┘        │
                      │             │
                 ┌────┴─────┐       │
                 │ checkout │───────┘
                 └────┬─────┘
        ┌─────────────┼──────────────┐
        ▼             ▼              ▼
   ┌────────┐   ┌──────────┐   ┌──────────┐
   │ orders │──▶│ payments │   │ shipping │
   └───┬────┘   └──────────┘   └──────────┘
       │
       ▼
  ┌───────────┐        ┌───────────┐   ┌──────────┐   ┌─────────┐
  │ inventory │        │ content   │   │ reviews  │   │ notif.  │
  └───────────┘        └───────────┘   └──────────┘   └─────────┘
       ▲
       │
  ┌────┴────────┐   ┌──────────┐
  │ procurement │──▶│ sourcing │
  └─────────────┘   └──────────┘
```

**Forbidden edges — permanently:**

| Forbidden | Why |
|---|---|
| `catalog` → `procurement` or `supplier` data | Suppliers must never reach the storefront |
| `catalog` → `inventory` internals | Catalog asks for an availability band via the inventory service |
| `orders` → live `catalog` for rendering | Orders render from their own snapshots |
| `payments` → `cart` | Payment operates on an order, never a cart |
| any module → another module's Prisma models | Ownership violation |
| `domain/` → Nest, Prisma, BullMQ, or a vendor SDK | Breaks purity and testability |
| `packages/backend` → `apps/*` | A library never imports its host |
| `apps/api` ↔ `apps/worker` | Both are composition roots over the same library |
| `apps/worker` → the API over HTTP | A network hop for work that is already in-process |
| `apps/api` / `apps/worker` → `packages/db` | Database access belongs to `packages/backend` alone |
| `apps/web` → `packages/backend` or `packages/db` | Web reaches business logic over HTTP or not at all |
| `packages/ui` → `packages/db` or `packages/backend` | UI must never see persistence or business rules |

Cycles are forbidden outright. If two modules need each other, one of them is
wrong or a third concept is missing.

---

## 4. How modules communicate

### 4.1 Synchronous — public service interface

Inside a request, when a caller needs an answer now:

```ts
// packages/backend/src/modules/checkout/application/confirm-checkout.use-case.ts
import { PricingService } from '../../pricing';       // ✅ barrel only
import { InventoryService } from '../../inventory';   // ✅
// import { PrismaCouponRepo } from '../../pricing/infrastructure/…'  ❌
```

Only what a module re-exports from its `index.ts` is callable. That barrel
contains service interfaces and DTO types — never entities, never repositories,
never Prisma models.

### 4.2 Asynchronous — domain events via the outbox

When the caller does not need an answer and must not be coupled to the consumer:

```
orders  ──emit──▶ outbox_event(order.created)
                     │  (same DB transaction as the order insert)
                     ▼
                  worker dispatch
                     ├─▶ notifications: send confirmation email
                     ├─▶ inventory:     confirm allocation
                     ├─▶ cache:         purge affected product pages
                     └─▶ analytics:     record conversion
```

Event names are `<aggregate>.<past-tense>`: `order.created`, `order.paid`,
`order.cancelled`, `payment.succeeded`, `payment.failed`, `product.published`,
`stock.low`, `reservation.expired`.

Payloads are **versioned, additive, and self-contained** — a consumer must never
need to call back for context, and adding a field must never break a consumer.

### 4.3 Choosing between them

| Use synchronous when | Use an event when |
|---|---|
| The caller needs the result to proceed | The work can happen after commit |
| The operation is part of the same transaction | The work is slow, external, or retryable |
| Failure must abort the caller | Failure must not abort the caller |

---

## 5. Transaction ownership

- A transaction is opened by an **application-layer use case** in
  `packages/backend`, never by a repository, never by a controller, never by a
  queue processor.
- One business operation, one transaction. Nested transactions are not used.
- Only the module that owns a table may write to it inside a transaction. When a
  cross-module write is genuinely needed (checkout writes orders, reservations,
  and ledger entries), the **orchestrating use case** — `checkout.confirm` — calls
  the owning modules' services and passes the transaction handle explicitly:

```ts
await this.uow.transaction(async (tx) => {
  const priced   = await this.pricing.priceCart(cart, tx);
  await this.inventory.consumeReservations(session.id, tx);
  const order    = await this.orders.createFromCheckout(session, priced, tx);
  await this.platform.enqueueOutbox('order.created', order, tx);
  return order;
});
```

Each service still writes only its own tables. The orchestrator supplies the
transaction; it does not reach past the service into someone else's data.

- **No network I/O inside a transaction.** Provider calls, emails, and cache
  purges happen after commit, driven by the outbox.

---

## 6. Application boundaries (composition roots)

### 6.1 `apps/api` — HTTP composition root

```
apps/api/src/
├── main.ts                      NestFactory.create() with the Fastify adapter
├── app.module.ts                imports the backend modules it exposes
├── modules/<module>/            controller · DTOs · guards · OpenAPI decorators
└── common/                      filters, interceptors, pipes, correlation id
```

Rules:

- A controller does four things: validate input, map to an application command,
  call **one** application service from `packages/backend`, and map the result to
  a response DTO. Anything more is a business rule in the wrong place.
- No Prisma import, no `packages/db` import, no SQL. The readiness probe uses the
  `platform` health service.
- HTTP DTOs are separate types from application commands. The wire format is
  allowed to change without touching a use case, and vice versa.
- `apps/api` is never imported by anything — not by the worker, not by tests of
  the backend.

### 6.2 `apps/worker` — BullMQ composition root

```
apps/worker/src/
├── main.ts                      NestFactory.createApplicationContext() — headless
├── worker.module.ts             imports the same backend modules
├── processors/<queue>/          job payload → validate → application service
└── schedules/                   repeatable job registration
```

Rules:

- A processor is an adapter, not a place for logic: deserialize, validate the
  payload against a schema, call the application service, map failures to retry
  or dead-letter.
- Job payload schemas are versioned and validated on consumption — a payload
  enqueued by the previous release must still be readable.
- Never imports `apps/api`. Never calls the API over HTTP.
- Every handler is idempotent; duplicate delivery is expected, not exceptional.
- Owns retry, backoff, concurrency, rate limits, and dead-letter policy. The
  backend library has no opinion about how often a job is retried.

### 6.3 `apps/web` — presentation and BFF

```
apps/web/src/
├── app/[locale]/(storefront)/…    public routes
├── app/[locale]/(admin)/admin/…   staff routes — UX gating only
├── app/api/…                      BFF handlers (session cookie, revalidation hook)
├── features/<feature>/            feature-scoped components, hooks, server actions
├── lib/api-client/                generated from OpenAPI — the only way to call the API
├── lib/session/                   cookie read/write, server-side only
└── lib/seo/                       metadata, hreflang, JSON-LD builders
```

Rules:

- A `features/*` module may import from `packages/ui`, `packages/i18n`,
  `lib/api-client`, and its own directory. It may not import another feature's
  internals; shared pieces move up into `packages/ui` or `lib/`.
- Only `lib/api-client` performs HTTP to the API. No `fetch` to the API elsewhere.
- Only server code touches `lib/session`. A `'use client'` file importing it is a
  lint error.
- `packages/ui` contains **no copy strings** — text arrives as props or via the
  i18n hook, so a component is never coupled to a language.
- The `(admin)` group's layout applies stricter cache headers and session policy,
  but the real gate is the API's permission check on every call.
- **Never** imports `packages/backend` or `packages/db`. Business logic is reached
  over HTTP or not at all, including from Server Components and server actions.

---

## 7. Mechanical enforcement

These are not guidelines. CI fails on violation.

| Rule | Mechanism |
|---|---|
| No deep imports across modules | `eslint no-restricted-imports` with `@honey/backend/modules/*/!(index)` patterns |
| No layer inversion inside a module | `eslint-plugin-boundaries` element types: `domain` may not import `application` or `infrastructure` |
| No cycles between modules | `dependency-cruiser` `no-circular` |
| `domain/` stays pure | `no-restricted-imports` for `@nestjs/*`, `@prisma/*`, `bullmq`, `axios`, vendor SDKs |
| `packages/backend` never imports an app | `dependency-cruiser` rule: `packages/**` → `apps/**` forbidden |
| `apps/api` and `apps/worker` never import each other | `dependency-cruiser` forbidden edge, both directions |
| `apps/worker` never calls the API over HTTP | `no-restricted-imports` for the generated API client, plus a lint rule banning `API_BASE_URL` in the worker |
| Only `packages/backend` touches the database | `no-restricted-imports` for `@honey/db` and `@prisma/client` outside `packages/backend` |
| `apps/web` has no business logic or DB access | `no-restricted-imports` for `@honey/backend`, `@honey/db`, `@prisma/client` |
| `packages/core` imports nothing local | `dependency-cruiser` orphan/allowed-dependency rule |
| One module per table | Generated ownership map diffed against the Prisma schema in a CI test |
| No supplier data in public responses | Contract test scanning the public OpenAPI document for forbidden field names |
| No forbidden claim vocabulary | Repo-wide regex test over schema, DTOs, and message catalogs |

Ownership metadata lives next to each module in `module.meta.ts`
(`{ name, tables, queues, events, publicRoutes }`) and is the input to the
generated ownership map, so the documentation and the check cannot drift.

---

## 8. Adding a module

1. Confirm the capability is in [`product-scope.md`](product-scope.md).
2. Write an ADR if it introduces a new concept, dependency, or external system.
3. Create the three-layer skeleton under `packages/backend/src/modules/` plus
   `module.meta.ts`.
4. Declare owned tables — they must not already be owned by anyone else.
5. Define the public barrel first: what other modules and composition roots may call.
6. Define ports before adapters.
7. Add the transport adapters only where the module is actually reachable: a
   controller in `apps/api`, a processor in `apps/worker`, or both.
8. Add the module to the dependency graph in this document.
9. Add tests: domain unit tests, repository integration tests, contract tests.

If a new module would need to read another module's tables, the boundary is
wrong. Stop and redesign.

---

## 9. When to split out a service

Not now, and not on intuition. A module may become its own deployable only when
**all** of the following are true and documented in an ADR:

1. It has a genuinely different scaling profile, proven by production metrics.
2. Its boundary has been stable for months with no cross-module leakage.
3. It does not need to participate in a database transaction with another module.
4. The team has the operational maturity for another deployable.

Until then the modular monolith stands
([ADR-0002](adr/0002-modular-monolith.md)). Clean boundaries mean that extraction
stays cheap, which is exactly why we do not need to do it early.
