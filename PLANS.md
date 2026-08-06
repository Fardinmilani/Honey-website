# PLANS.md — Delivery Plan

**Project:** Honey Website — single-seller luxury honey e-commerce store
**Current phase:** Phase 9 — Web Foundation (**not started**)
**Completed phase:** Phase 8 — Catalog & Content Model (**complete 2026-08-06**)

> Agents: read [`AGENTS.md`](AGENTS.md) before doing anything. Implement only the
> phase you were asked for, then stop.

---

## 1. What we are building

A premium, bilingual (Persian / English) direct-to-consumer online store for our
own brand of honey. We produce part of the range ourselves and, when demand
exceeds our production, we buy high-quality honey from trusted suppliers,
package it, and sell it under our own brand.

The visual identity is premium, natural, and minimal, drawn from the mountains
and wildflowers of Azerbaijan. The existing Hero videos under
`apps/web/public/media/hero/` are the homepage visual anchor and the fixed point
the rest of the design is built around.

**This is not a marketplace.** See [`docs/product-scope.md`](docs/product-scope.md)
for the full in-scope / out-of-scope contract.

---

## 2. Shape of the system

```
pnpm workspace + Turborepo
│
├── apps/web      Next.js App Router — storefront + admin console (RSC, i18n, RTL/LTR)
│                 never touches the database or the backend library
├── apps/api      HTTP composition root — NestJS on Fastify, controllers, guards,
│                 DTO mapping, REST + OpenAPI
├── apps/worker   BullMQ composition root — queue processors, scheduling, retries
│                 never imports apps/api, never calls it over HTTP
│
└── packages/
    ├── backend   ALL business logic — modular monolith, shared by api and worker
    ├── db        Prisma schema, migrations, client, transaction helper
    └── core · contracts · i18n · ui · config · utils

PostgreSQL · Redis · S3-compatible object storage (MinIO locally) · Docker Compose
TypeScript strict · Vitest · Playwright
```

`apps/api` and `apps/worker` are two process shapes over **one** body of business
logic. There is exactly one implementation of every rule, and it lives in
`packages/backend` ([ADR-0021](docs/adr/0021-shared-backend-package.md)).

Details: [`docs/architecture.md`](docs/architecture.md).

---

## 3. Phase roadmap

Full definitions, scope ceilings, and acceptance criteria live in
[`docs/implementation-phases.md`](docs/implementation-phases.md). Summary:

| # | Phase | Outcome |
|---|---|---|
| 1 | Architecture & Documentation | This document set. No code. |
| 2 | Workspace Foundation | **Complete 2026-08-05** — pnpm + Turborepo + TS config + lint + CI skeleton |
| 3 | Local Environment | **Complete 2026-08-05** — Docker Compose: Postgres, Redis, MinIO, Mailpit |
| 4 | Database Foundation | **Complete 2026-08-06** — Prisma schema core, first migration, seed harness |
| 5 | Backend Library & API Foundation | **Complete 2026-08-06** — transport-independent platform library + Nest/Fastify API, OpenAPI, operational endpoints, API image |
| 6 | Identity & Authorization | **Complete 2026-08-06** — users, opaque sessions, RBAC, staff TOTP, audit log |
| 7 | Media & Storage | **Complete 2026-08-06** — S3 abstraction, MinIO adapter, quarantined direct-upload pipeline |
| 8 | Catalog & Content Model | **Complete 2026-08-06** — catalog domain/API, publication, search, cursors, Redis cache |
| 9 | Web Foundation | **Not started (current)** — App Router shell, i18n routing, RTL/LTR, design system, **Hero integration** |
| 10 | Storefront Catalog | Listing, filtering, PDP, SEO, structured data, sitemaps |
| 11 | Sourcing, Procurement & Inventory | Suppliers, purchase orders, batches, stock ledger |
| 12 | Cart & Pricing | Server-authoritative cart and price engine |
| 13 | Checkout & Orders | Reservations, checkout transaction, immutable order snapshots |
| 14 | Payments | Provider abstraction, first provider, server-verified outcomes, reconciliation |
| 15 | Shipping & Fulfilment | Provider abstraction, rates, shipments, tracking |
| 16 | Background Jobs | Worker composition root, queues, scheduling, retries, dead letters |
| 17 | Admin Console | Catalog, inventory, orders, procurement, content administration |
| 18 | Content, Reviews & Notifications | CMS pages, moderated reviews, transactional messaging |
| 19 | Observability & Performance | Tracing, metrics, caching layers, Core Web Vitals budget |
| 20 | Hardening & Launch Readiness | Security review, backups, restore drill, runbooks |

Phases 2–20 are sequential by default. Nothing after the current phase may be
started, scaffolded, or pre-wired without an explicit instruction.

---

## 4. Working agreement

**One phase at a time.** The phase ends with a report and a full stop.

**Documentation is a deliverable.** `docs/progress.md` is updated at the end of
every phase. Architectural choices get an ADR in `docs/adr/`.

**The server is the authority.** Prices, discounts, shipping costs, stock, order
state, and payment state are computed and owned server-side. The client sends
identifiers and quantities.

**No placeholders in shipped UI.** If a feature is not built, its entry point is
not rendered.

**No commits by agents.** Changes are left in the working tree for human review.

---

## 5. Fixed constraints

| Constraint | Rule |
|---|---|
| Business model | Single seller, one brand. No marketplace concepts, ever. |
| Sourcing | Own production and selected-supplier are internal attributes. Suppliers never surface to customers. |
| Claims | No moisture, laboratory, or medical/therapeutic claims anywhere. |
| Languages | Persian (RTL) and English (LTR) at launch; adding a locale must not change the core domain. |
| Routing | Locale-prefixed: `/fa/...`, `/en/...`. No unprefixed content routes. |
| Copy | No translated strings inline in components. Catalogs only. |
| Hero assets | `apps/web/public/media/hero/` is read-only. |
| Architecture | Modular monolith. No microservices before there is a measured reason. |
| Code placement | Business logic in `packages/backend`. `apps/*` are composition roots only. No app imports another app. |
| Payment state | Changes only on a server-to-server, provider-verified outcome. Never from the browser. |
| Hosting | Self-hosted Linux VPS + Docker Compose, provider-neutral, portable to managed services later. |
| Types | TypeScript strict everywhere. No `any`. |

---

## 6. Open questions for the business

These block or shape later phases and need a human decision. Tracked in
[`docs/progress.md`](docs/progress.md).

1. **Payment provider** — which Iranian PSP first (Zarinpal / IDPay / direct
   Shaparak IPG), and is an international provider needed at launch? *Blocks
   Phase 14.*
2. **Currency and display** — IRR stored, Toman displayed? Any second currency
   for the English storefront? *Shapes Phases 12–14.*
3. **Shipping carriers** — flat-rate and manual only at launch, or an integrated
   carrier from day one? *Blocks Phase 15.*
4. **Tax/VAT** — is VAT applicable, at what rate, and is it price-inclusive?
   *Shapes Phase 12.*
5. **Guest checkout** — allowed, or account required? *Shapes Phase 13.*
6. **Legal entity and invoicing** — invoice format, numbering, and any statutory
   fields required. *Shapes Phase 13.*
7. **Reviews** — are customer reviews in scope for launch? *Shapes Phase 18.*
8. **Production domain** — the domain name, and whether the canonical host is the
   apex or `www`. *Shapes Phase 10.*
9. **Brand fonts** — licensed Persian and Latin webfonts. *Shapes Phase 9.*

**Resolved:** ~~Hosting target~~ — decided on 2026-08-05 as a self-hosted Linux
VPS running Docker Compose behind a reverse proxy with TLS, provider-neutral and
portable to managed services later
([ADR-0023](docs/adr/0023-self-hosted-vps-deployment.md)). Phase 3 is unblocked.

---

## 7. Definition of done (every phase)

- [ ] Deliverables complete; out-of-scope items genuinely absent
- [ ] `lint`, `typecheck`, `test`, `build` pass for affected packages
- [ ] Hero assets verified unchanged
- [ ] No secrets introduced; `.env.example` updated if new variables exist
- [ ] `docs/progress.md` updated; ADRs written for architectural decisions
- [ ] No `git add` / `commit` / `push`
- [ ] Report delivered, then stop
