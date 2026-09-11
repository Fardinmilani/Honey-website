# Cart and pricing development (Phase 12)

This document is the Phase 12 implementation guide and operating contract. It
does not replace acceptance evidence in `docs/progress.md`; commands and tests
must be run and recorded there before the phase is declared complete.

## Boundaries

| Area | Responsibility |
|---|---|
| `packages/backend/src/modules/pricing` | Authoritative price, coupon, discount-allocation, and tax calculation |
| `packages/backend/src/modules/cart` | Cart ownership, expiry, line mutation, availability clamping, merge, and repriced projection |
| `apps/api` | HTTP DTO parsing, authorization, headers, OpenAPI, and composition only |
| `apps/web` | Server-rendered presentation plus small interactive controls; never authoritative pricing |

The web application must not import `@honey/backend`, `@honey/db`, Prisma, or
inventory internals. The cart module uses ports for pricing and availability;
it must not make HTTP calls while holding a database transaction.

## Money, currency, and price resolution

Money follows [ADR-0016](adr/0016-money-minor-units.md):

```ts
type Money = { amountMinor: bigint; currency: string };
```

Money stays `bigint` within the backend and is emitted as a string amount in
JSON. No float, decimal tolerance, or browser-computed total is permitted.

For a requested `(variantId, currency, now)`, current price resolution selects
only rows for the requested enabled currency where:

```text
validFrom <= now
validTo is null OR validTo > now
```

The matching row with the latest `validFrom` wins. There is no FX fallback and
no reuse of an expired or missing price. A missing current price makes the line
non-purchasable and removable, rather than reviving a past amount.

`IRR` is a deterministic development fixture. API responses always include an
explicit ISO-4217 currency. Persian display must not divide by ten or imply a
Toman conversion unless a later business decision explicitly introduces a
centralized presentation policy. Likewise, adding another production currency
must be an enabled-price configuration decision, not a fallback rule.

## Computation order and tax

For purchasable lines, calculation is performed using authoritative current
unit prices:

```text
line subtotal = unit price × selected quantity
cart subtotal = sum(line subtotals)
coupon effect = validate coupon, derive discount, apply its cap
line discounts = exact deterministic allocation
line merchandise total = line subtotal − allocated discount
merchandise total = sum(line merchandise totals)
tax = calculate only with an authoritative jurisdiction and active tax rule
```

The exact allocation and rounding rule is [ADR-0033](adr/0033-cart-discount-allocation.md).
It guarantees both `sum(discounts) == coupon discount` and
`sum(line merchandise totals) == merchandise total` without tolerance.

Tax rules are selected by active country/region precedence and use integer
basis points. Inclusive and exclusive taxes use integer half-up rounding. If
the cart does not have an authoritative jurisdiction, its tax state is
`UNRESOLVED`; it must not fabricate a zero final tax. Production VAT
applicability, rate, and inclusive/exclusive policy remain a business and
deployment prerequisite.

## Coupons

Coupon input is bounded, trimmed, and normalized consistently with the
case-insensitive database uniqueness rule. The client submits only a code.
The server validates status, time window, overall and per-customer limits,
currency, minimum subtotal, maximum discount, and target applicability.

Only one coupon is attached to a cart. Applying a new coupon replaces the prior
selection only after server validation. Attaching a coupon does not create a
`CouponRedemption` or consume a usage count; redemption belongs to later order
creation and must be revalidated then.

- `PERCENT` and `FIXED` affect eligible merchandise through the exact allocator.
- `FREE_SHIPPING` may be valid but has a `DEFERRED` cart-time effect. It must
  never claim a shipping saving before a shipping quote exists.

Coupon and cart writes use the scoped cart rate limits. Error responses are
safe eligibility outcomes, not disclosures of coupon configuration or usage
counters.

## Cart lifetime and ownership

An active cart belongs to exactly one server-derived owner: an authenticated
user or an anonymous browser identity. Clients never choose a user, owner, or
arbitrary cart ID. The anonymous identity is a high-entropy, opaque first-party
cookie; it contains no serialized cart, price, or product data.

[ADR-0034](adr/0034-cart-active-ttl.md) defines the active lifetime. On cart
access, expired `ACTIVE` state is atomically marked `ABANDONED` and is not
revived. The 30-day configured default is for local/test behavior only; it does
not alter the existing 90-day abandoned-cart retention policy.

On an authenticated cart access after sign-in, an active anonymous cart is
merged transactionally with the user cart:

1. Acquire stable per-owner transaction locks, then lock affected carts in a
   consistent order. This also serializes lookup/create when no cart row exists
   yet.
2. Ignore/abandon an expired anonymous cart.
3. Combine matching variants, then clamp quantity from authoritative exact
   availability.
4. Preserve at most one line for each `(cartId, variantId)`.
5. If both carts selected one, retain the user-cart selection; otherwise carry
   the anonymous selection. The immediately following cart projection—and every
   later cart read—revalidates the retained code against current eligibility.
6. Mark the anonymous cart `MERGED`, then reprice the retained cart.

The operation is idempotent: a repeated or concurrent merge must not double a
line quantity.

## Lines, availability, and repricing

Cart mutations accept only a variant identifier and a positive bounded quantity
(and a coupon code for coupon application). Add is increment semantics; patch
sets a quantity. Before the transaction returns a projection, it uses exact
internal availability to clamp added, changed, or merged quantities. The
customer projection exposes only an availability band and an adjustment state,
never an exact count, location, incoming quantity, or inventory accounting
field.

`POST /v1/cart/lines` requires an `Idempotency-Key` with a bounded opaque value.
The server scopes it to the server-derived cart owner and hashes the normalized
variant, quantity, and currency selection. A matching retry does not increment
the line again; it returns a freshly repriced cart projection with
`Idempotency-Replayed: true`. A reused key with a different request is rejected.
The durable replay record expires after 24 hours. A fresh projection is
intentional: cart reads must always use current pricing and availability rather
than replay a stale money amount. The lock and replay contract is fixed in
[ADR-0035](adr/0035-cart-mutation-idempotency-and-owner-locking.md).

Every cart read resolves current prices, coupon eligibility, discounts,
availability, and any authoritative tax context again. `CartLine` persists only
identity and quantity fields; it does not store unit price, tax, discount,
subtotal, total, compare-at value, or currency snapshot.

Cart operations do not reserve inventory. They must not create a reservation,
change reserved/allocated/on-hand quantities, or append a reservation ledger
entry. Checkout and reservation lifecycle remain Phase 13 work.

## HTTP, BFF, and security

The customer surface is private and uncacheable:

```text
GET    /v1/cart
POST   /v1/cart/lines
PATCH  /v1/cart/lines/{lineId}
DELETE /v1/cart/lines/{lineId}
POST   /v1/cart/coupon
DELETE /v1/cart/coupon
```

Every response uses `Cache-Control: private, no-store`. The API resolves locale
and `X-Currency` consistently with the API strategy; a cart has exactly one
currency and never mixes or converts currencies.

The web application uses explicit server-side BFF routes, preserving the opaque
session and anonymous-cart cookies. State-changing cookie requests use the
existing double-submit CSRF defense. The server remains the authorization
boundary; UI visibility is never an authorization decision.

Any cart write that includes a watched authoritative field such as `price`,
`unitPrice`, `amount`, `total`, `subtotal`, `discountAmount`, `shippingCost`,
`taxAmount`, stock, or payment state is rejected with `422`. It records a
`security.tampering_attempt` audit event with safe owner/principal context,
request ID, and the field name only—not the submitted value. Unknown fields are
also rejected.

Staff-only `/v1/admin/**` pricing endpoints, if exposed for the later admin UI,
use explicit pricing permissions, a staff session, CSRF on writes, audit, and
`private, no-store`. Phase 12 does not render pricing administration pages.

## Storefront, cache, and structured data

Current price display is server-derived on cards and product pages and formatted
only in a centralized locale-aware presentation helper. If there is no active
price, display a truthful localized unavailable state. The browser does not
calculate discounts or totals.

Price-bearing catalog reads are deliberately `no-store` in this phase. That
keeps a scheduled activation, expiry, and price mutation from being served out
of a stale public or Next.js data-cache entry; the database pricing resolver is
the source of truth. Catalog content that does not contain a current price
retains its existing tag-based cache behavior. Cart reads never rely on a
public-cache amount.

Product JSON-LD emits an `Offer` only when a current authoritative price and a
public availability band exist. It contains price, currency, canonical URL, and
conservative availability only. It never contains exact stock, internal costs,
customer-specific coupon effects, or internal purchasing data.

Cart pages are private customer state: `noindex`, not in the sitemap, and never
treated as a catalog canonical page. The cart interface is localized for Persian
RTL and English LTR, with working controls, live feedback, labels, and no
checkout entry point until the later phase provides a real checkout.

## Required evidence before completion

At minimum, retain focused evidence for:

- price windows, missing/current replacement price, currency mismatch, coupons,
  taxes, large `bigint` values, and generated exact-allocation cases;
- cart ownership, expiry, add/update/remove, coupon replacement, repricing,
  merge/retry/concurrency, and no-reservation behavior on real PostgreSQL;
- customer and staff HTTP authorization, CSRF, rate limits, no-store, and
  `422` plus tampering audit behavior;
- OpenAPI generation/lint/forbidden-field scanning and generated contract types;
- fa/en price, cart, add-to-cart, coupon, Offer, and axe coverage;
- `scripts/verify-phase12.mjs`, prior phase regressions adjusted only for
  legitimate Phase 12 additions, historical migration integrity, untracked
  `.env`, and unchanged Hero media.

Run only the checks that exist and record their observed result in
`docs/progress.md`. A skipped external-infrastructure check is not a pass.

## Explicit phase boundary

Phase 12 excludes checkout pages, addresses, shipping quotations or selection,
stock reservations, orders, payment, shipment/fulfilment, worker processors,
and admin UI. A cart merchandise figure is not a shipping-inclusive payable
total. No change in this phase should prepare or simulate those later flows.
