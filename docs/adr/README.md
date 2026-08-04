# Architecture Decision Records

Each ADR records one decision: the context that forced it, what was chosen, what
that costs, and what was rejected.

**Rules**

- ADRs are **append-only**. A decision that changes is *superseded* by a new ADR;
  the old one stays, with its status updated and a link forward.
- Numbers are never reused.
- Anything that constrains future work — a framework, a boundary, a data shape, a
  product invariant — needs one.
- Keep them short. An ADR nobody reads protects nothing.

**Statuses:** `Proposed` · `Accepted` · `Superseded by ADR-xxxx` · `Deprecated`

---

## Index

| # | Decision | Status |
|---|---|---|
| [0001](0001-pnpm-turborepo-monorepo.md) | pnpm workspace + Turborepo monorepo | Accepted |
| [0002](0002-modular-monolith.md) | Modular monolith, not microservices | Accepted |
| [0003](0003-nextjs-app-router.md) | Next.js App Router for storefront **and** admin | Accepted |
| [0004](0004-nestjs-fastify.md) | NestJS on Fastify for the API | Accepted |
| [0005](0005-postgresql-prisma.md) | PostgreSQL with Prisma | Accepted |
| [0006](0006-redis-bullmq.md) | Redis + BullMQ with a separate worker process | Accepted |
| [0007](0007-s3-storage-abstraction.md) | S3-compatible storage behind a port; MinIO locally | Accepted |
| [0008](0008-rest-openapi.md) | REST + OpenAPI, not GraphQL | Accepted |
| [0009](0009-locale-prefixed-routing.md) | Locale-prefixed routes and sidecar translations | Accepted |
| [0010](0010-single-seller-no-marketplace.md) | Single-seller domain; marketplace concepts forbidden | Accepted |
| [0011](0011-immutable-order-snapshots.md) | Orders are immutable snapshots | Accepted |
| [0012](0012-stock-reservation-strategy.md) | Checkout-time reservations with TTL and row locks | Accepted |
| [0013](0013-payment-provider-abstraction.md) | Payment provider port; webhook is the source of truth | Accepted |
| [0014](0014-shipping-provider-abstraction.md) | Shipping provider port; manual flat-rate first | Accepted |
| [0015](0015-session-auth.md) | Opaque server-side sessions in cookies, not JWTs | Accepted |
| [0016](0016-money-minor-units.md) | Money as integer minor units + currency code | Accepted |
| [0017](0017-testing-strategy.md) | Vitest + Playwright, real dependencies in integration tests | Accepted |
| [0018](0018-caching-and-invalidation.md) | Layered caching with event-driven invalidation | Accepted |
| [0019](0019-hero-media-preservation.md) | Hero media is an immutable, in-repo static asset | Accepted |
| [0020](0020-no-lab-moisture-medical-claims.md) | No laboratory, moisture, or medical claims | Accepted |

---

## Template

```markdown
# ADR-XXXX: <decision in a short sentence>

**Status:** Accepted
**Date:** YYYY-MM-DD
**Phase:** N

## Context
What forced a decision. Constraints, not opinions.

## Decision
What we do. Present tense, unambiguous.

## Consequences
### Positive
### Negative / accepted costs

## Alternatives considered
| Option | Why not |
```
