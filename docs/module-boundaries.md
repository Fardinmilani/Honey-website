# Module Boundaries and Ownership

A modular monolith only stays modular if the boundaries are **mechanically
enforced**. This document defines the modules, who owns what, how modules are
allowed to talk, and how the rules are checked in CI.

---

## 1. Anatomy of a module

Every module in `apps/api/src/modules/<module>/` has the same four layers:

```
<module>/
├── domain/            entities, value objects, policies, PORT interfaces
│                      pure TypeScript — no Nest, no Prisma, no HTTP
├── application/       use cases / services; orchestrates domain + ports;
│                      owns transaction boundaries
├── infrastructure/    Prisma repositories, provider adapters, queue producers
│                      — implements the ports declared in domain/
├── http/              controllers, DTOs, request/response schemas, guards
└── index.ts           the module's PUBLIC surface — nothing else is importable
```

**Dependency direction is one way:**

```
http ──▶ application ──▶ domain ◀── infrastructure
```

`domain` depends on nothing. `infrastructure` implements `domain` ports and is
wired in by the Nest module definition. A `domain` file that imports Prisma, Nest,
or a vendor SDK is a bug and fails lint.

---

## 2. Module catalogue

| Module | Responsibility | Owns tables | Queues | Public routes |
|---|---|---|---|---|
| `identity` | Auth, sessions, users, roles, permissions, audit | `user`, `auth_credential`, `session`, `verification_token`, `role`, `permission`, `role_permission`, `user_role`, `audit_log` | `email` | `/v1/auth/*`, `/v1/me/*` |
| `catalog` | Products, variants, categories, collections, translations, slugs | `product*`, `product_variant*`, `category*`, `collection*`, `product_media`, `slug_history` | `search`, `cache` | `/v1/products`, `/v1/categories`, `/v1/collections` |
| `media` | Media assets, uploads, derivatives, signed URLs | `media_asset`, `media_derivative` | `media` | `/v1/media/*` (admin) |
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
| `domain/` → Nest, Prisma, or a vendor SDK | Breaks purity and testability |
| `packages/ui` → `packages/db` | UI must never see persistence |
| `apps/web` → `packages/db` | Web has no database access at all |

Cycles are forbidden outright. If two modules need each other, one of them is
wrong or a third concept is missing.

---

## 4. How modules communicate

### 4.1 Synchronous — public service interface

Inside a request, when a caller needs an answer now:

```ts
// checkout/application/confirm-checkout.use-case.ts
import { PricingService } from '@/modules/pricing';       // ✅ barrel only
import { InventoryService } from '@/modules/inventory';   // ✅
// import { PrismaCouponRepo } from '@/modules/pricing/infrastructure/…'  ❌
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

- A transaction is opened by an **application-layer use case**, never by a
  repository, never by a controller.
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

## 6. Web application boundaries

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

---

## 7. Mechanical enforcement

These are not guidelines. CI fails on violation.

| Rule | Mechanism |
|---|---|
| No deep imports across modules | `eslint no-restricted-imports` with `@/modules/*/!(index)` patterns |
| No layer inversion inside a module | `eslint-plugin-boundaries` element types: `domain` may not import `application`/`infrastructure`/`http` |
| No cycles between modules | `dependency-cruiser` `no-circular` |
| `domain/` stays pure | `no-restricted-imports` for `@nestjs/*`, `@prisma/*`, `axios`, vendor SDKs |
| `apps/web` has no DB access | `no-restricted-imports` for `@honey/db`, `@prisma/client` |
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
3. Create the four-layer skeleton and `module.meta.ts`.
4. Declare owned tables — they must not already be owned by anyone else.
5. Define the public barrel first: what other modules may call.
6. Define ports before adapters.
7. Add the module to the dependency graph in this document.
8. Add tests: domain unit tests, repository integration tests, contract tests.

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
