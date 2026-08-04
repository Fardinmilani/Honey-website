# API Strategy

**Style:** REST over HTTPS, JSON only
**Contract:** OpenAPI 3.1, generated from code, committed, and diffed in CI
**Runtime:** NestJS on Fastify
**Decision:** [ADR-0008](adr/0008-rest-openapi.md), [ADR-0004](adr/0004-nestjs-fastify.md)

---

## 1. Why REST + OpenAPI

The client set is small and known: our own web app, the admin console inside it,
and a handful of webhook senders. REST gives us HTTP caching that actually works
for a catalog, a contract that generates a typed client for free, trivial
observability per endpoint, and no query-complexity attack surface. GraphQL would
add a resolver layer and a caching problem we do not need to solve.

The OpenAPI document is the **contract**, not an afterthought. It is generated
from decorators and validation schemas, written to
`packages/contracts/openapi.json`, committed, and diffed in CI so that no
breaking change reaches `main` unnoticed. The web app's API client is generated
from it, which means a backend rename becomes a TypeScript error in the frontend
instead of a runtime 404.

---

## 2. URL and versioning

```
https://api.example.com/v1/<resource>
```

- Version in the path, one major version at a time. `/v1` is additive-only.
- Plural, lower-kebab-case nouns: `/v1/products`, `/v1/checkout-sessions`.
- Nested only for genuine containment: `/v1/orders/{orderId}/lines`.
- Verbs only for state transitions that are not CRUD, as a sub-resource:
  `POST /v1/checkout/{id}/confirm`, `POST /v1/orders/{id}/cancel`.
- No locale in the URL. Locale is a request concern (§4), because the API returns
  data, not pages. Locale-prefixed URLs are a **web app** concern
  ([`seo-strategy.md`](seo-strategy.md)).
- Webhooks sit outside the versioned tree: `/webhooks/payments/{provider}`.

**Breaking vs. non-breaking.** Adding an optional field, a new endpoint, or a new
enum value in a *response* is non-breaking. Removing or renaming a field,
tightening validation, changing a type, or adding a required request field is
breaking and requires `/v2` plus a documented deprecation window with `Sunset`
and `Deprecation` headers.

---

## 3. Surfaces

| Surface | Prefix | Auth | Cacheable |
|---|---|---|---|
| Public catalog & content | `/v1/products`, `/v1/categories`, `/v1/content`, … | none | Yes, short TTL |
| Customer | `/v1/cart`, `/v1/checkout`, `/v1/orders`, `/v1/me` | session cookie | Never |
| Admin | `/v1/admin/**` | staff session + permission | Never |
| Webhooks | `/webhooks/**` | provider signature | Never |
| Operational | `/healthz`, `/readyz`, `/metrics` | internal network only | No |

The admin surface is a separate route prefix with its own guard stack, its own
rate limits, and its own audit logging. It is never reachable with a customer
session.

---

## 4. Request conventions

### Headers

| Header | Purpose |
|---|---|
| `Accept-Language` | Locale negotiation; `?locale=` overrides it explicitly |
| `X-Currency` | Requested currency; server validates it is enabled, else falls back |
| `Idempotency-Key` | Required on checkout/payment writes, accepted on all writes |
| `X-Request-Id` | Correlation; generated if absent and echoed back |
| `X-CSRF-Token` | Required on cookie-authenticated state-changing requests |

### Locale resolution order

`?locale=` → `Accept-Language` → authenticated user's `preferredLocale` →
default locale. The resolved locale is echoed in the response body's `meta.locale`
so caches and clients can never guess wrong.

### Validation

Every input is parsed by a schema at the boundary before it reaches a use case.
Unknown properties are **rejected**, not stripped, so a client sending
`{"price": 1}` gets a loud `422` instead of silent acceptance. Path params, query
params, headers, bodies, webhook payloads, and job data all go through the same
gate.

Hard limits: body ≤ 1 MB (uploads use pre-signed URLs), page size ≤ 100,
array fields bounded, string fields length-capped, integers range-checked.

### Pagination

Cursor-based for anything that can grow or change under the reader:

```
GET /v1/products?limit=24&cursor=eyJpZCI6…

{ "data": [...],
  "meta": { "locale": "fa", "currency": "IRR" },
  "page": { "nextCursor": "eyJpZCI6…", "hasMore": true, "limit": 24 } }
```

Offset pagination exists only in admin list views where a page number is part of
the interface, and is capped.

### Filtering and sorting

Explicit allow-lists per endpoint. `?sort=price` / `?sort=-price` for direction.
No client-driven arbitrary field or operator syntax — a filter that is not in the
allow-list is a `422`, not an ignored parameter.

---

## 5. Response shape

Success:

```json
{
  "data": { "id": "0192f...", "name": "عسل کنار", "price": { "amountMinor": "48500000", "currency": "IRR" } },
  "meta": { "locale": "fa", "currency": "IRR", "requestId": "01JD..." }
}
```

Error — RFC 9457 `application/problem+json`:

```json
{
  "type": "https://example.com/problems/insufficient-stock",
  "title": "Insufficient stock",
  "status": 409,
  "code": "INSUFFICIENT_STOCK",
  "detail": "Requested quantity is no longer available.",
  "instance": "/v1/checkout/0192f.../confirm",
  "requestId": "01JD...",
  "errors": [ { "path": "lines[0].quantity", "code": "MAX_AVAILABLE", "meta": { "available": 2 } } ]
}
```

**Rules**

- `code` is a stable machine constant. Clients switch on `code`, never on
  `title` or `detail`.
- User-facing wording is resolved from the i18n catalogs on the **client** using
  `code` and `errors[].code`. The API does not return prose for the UI to print.
- Money is always `{ amountMinor, currency }`; `amountMinor` is a **string** in
  JSON to survive currencies whose values exceed `Number.MAX_SAFE_INTEGER` in
  minor units.
- Dates are ISO-8601 UTC with `Z`.
- Never expose internal identifiers, stack traces, SQL, provider payloads, or
  supplier data.
- `null` means "known to be absent". An omitted key means "not applicable to this
  representation". They are not interchangeable.

### Status codes

`200` read · `201` created (+ `Location`) · `202` accepted for async ·
`204` no content · `400` malformed · `401` unauthenticated · `403` unauthorized ·
`404` not found (also used to hide existence from unauthorized callers) ·
`409` state conflict (illegal transition, insufficient stock) ·
`410` gone (expired checkout session) · `422` validation failure ·
`429` rate limited (+ `Retry-After`) · `500` unexpected · `503` dependency down.

---

## 6. Idempotency

```
POST /v1/checkout/{id}/confirm
Idempotency-Key: 0192f4a2-...
```

- Required on checkout confirm, payment creation, and refunds; accepted on every
  other write.
- The key is stored with a hash of the request body. A replay with the **same**
  body returns the stored response and a `Idempotency-Replayed: true` header. A
  replay with a **different** body is a `422` — that is a client bug, not a retry.
- Keys live 24 hours in Redis with a durable Postgres record for the replay
  window.
- Concurrent requests with the same key: the first acquires a lock, the rest get
  `409` and retry.

This is what makes a double-clicked "Pay" button and a mobile network retry
harmless.

---

## 7. The trust boundary

**The client may send identifiers, quantities, and selections. Nothing else.**

| Client sends | Server derives, authoritatively |
|---|---|
| `variantId`, `quantity` | unit price, currency, tax rate, line total |
| `couponCode` | eligibility, discount amount, stacking rules |
| `shippingMethodCode`, address | shipping cost, method availability |
| — | stock availability and reservation validity |
| — | subtotal, discounts, tax, grand total, rounding |
| — | payment state (provider-verified only) |
| — | order status |

Request schemas **do not contain** `price`, `total`, `discountAmount`,
`shippingCost`, `taxAmount`, `stock`, or `paymentStatus`. Because unknown
properties are rejected, sending one produces a `422` — and because these
specific names are on a watchlist, it also emits a `security.tampering_attempt`
audit event with the request id and principal.

---

## 8. Caching

| Endpoint class | `Cache-Control` | Notes |
|---|---|---|
| Public catalog/content read | `public, max-age=60, stale-while-revalidate=300` | Also cached in Redis, keyed by route + locale + currency + normalized query |
| Public single product | `public, max-age=60, s-maxage=300` | `ETag` + `If-None-Match` supported |
| Any authenticated response | `private, no-store` | Never at the edge |
| Cart, checkout, orders, admin | `private, no-store` | |
| Webhooks, health | `no-store` | |

`Vary: Accept-Language, X-Currency` on every cacheable response. Cache keys always
include locale and currency; a Persian response must never be served to an
English request. Invalidation is event-driven through the outbox — a
`product.published` event purges the Redis keys and calls the web app's
revalidation hook.

---

## 9. Rate limiting

| Scope | Limit |
|---|---|
| Public reads, per IP | 300 / min |
| Search, per IP | 60 / min |
| Auth (login, register, reset), per IP **and** per identity | 10 / 15 min, exponential lockout |
| Cart writes, per session | 120 / min |
| Checkout confirm, per session | 10 / min |
| Coupon validation, per session | 20 / min (blocks code enumeration) |
| Admin writes, per user | 300 / min |
| Webhooks, per provider | generous, with burst tolerance |

Counters live in Redis with a sliding window. Responses carry `RateLimit-Limit`,
`RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After` on `429`. Limits are
per real client IP, resolved from a trusted proxy header allow-list — never from
an arbitrary `X-Forwarded-For`.

---

## 10. Webhooks (inbound)

```
POST /webhooks/payments/{provider}
```

Processing order is fixed and non-negotiable:

1. Read the **raw body** — signature verification requires the unparsed bytes.
2. Verify the signature and the timestamp window (reject if skew > 5 minutes).
3. Persist to `provider_event` with a `UNIQUE(provider, event_id)`; a duplicate
   short-circuits to `200`.
4. Return `200` immediately — before doing any business work.
5. Enqueue a job; the worker processes it idempotently.

Rationale: providers retry aggressively and time out quickly. Acknowledging fast
and processing asynchronously is the only shape that survives contact with a real
PSP. Unverified webhooks are logged and dropped, never processed. A dropped
webhook is caught by the reconciliation job that polls provider status for
payments stuck in `PENDING`.

---

## 11. Authentication in transport

- Browser clients use an **opaque, httpOnly, Secure, SameSite=Lax** session
  cookie set by the web BFF. No JWT in `localStorage`, ever.
- Cookie-authenticated state-changing requests require a double-submit CSRF
  token.
- Server-to-server calls from `apps/web` forward the caller's session and add a
  short-lived internal service token; the API rejects internal-only routes
  without it.
- Future machine clients would use OAuth2 client credentials with scoped tokens.
  Not built now.

Details in [`security-model.md`](security-model.md).

---

## 12. OpenAPI workflow

```
decorators + validation schemas
        │  build
        ▼
packages/contracts/openapi.json    ← committed
        │  generate
        ▼
packages/contracts/src/types.ts    ← typed client + types for apps/web
```

CI enforcement:

- **Drift check** — regenerate and fail if the committed document differs.
- **Breaking-change check** — diff against the `main` document; a breaking change
  without a version bump fails the build.
- **Lint** — Spectral rules: every operation has an `operationId`, a summary, a
  tag, documented error responses, and no untyped `object` schemas.
- **Forbidden-field check** — the public document is scanned for `supplier`,
  `landedCost`, `moisture`, `lab`, `hmf`, `diastase`, `purity`, and other
  forbidden vocabulary. A match fails the build. This is the mechanical guarantee
  behind the product rules, not a code-review habit.
- **Contract tests** — recorded requests/responses validated against the schema.

---

## 13. Observability per request

Every request gets a correlation id (`X-Request-Id`, generated when absent),
echoed in the response and attached to logs, traces, jobs it enqueues, and
outbound provider calls. Structured logs record method, route template (never the
raw path with ids), status, duration, principal id, and locale — never bodies,
tokens, or PII. RED metrics are recorded per route template. Traces span
web → api → db/redis/provider → worker.

---

## 14. Deprecation policy

1. Announce in the changelog and mark the operation `deprecated: true` in OpenAPI.
2. Serve `Deprecation: true` and `Sunset: <http-date>` headers.
3. Minimum 90 days for internal clients; longer if an external client exists.
4. Track usage per deprecated operation and remove only when it reaches zero.
5. Removal is a major version.
