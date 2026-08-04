# Progress

Living record of what has been delivered, decided, and left open. Updated at the
end of **every** phase. See [`implementation-phases.md`](implementation-phases.md)
for phase definitions and [`AGENTS.md`](../AGENTS.md) for the working rules.

---

## Status

| # | Phase | Status | Completed |
|---|---|---|---|
| 1 | Architecture & Documentation | ✅ Complete (corrected 2026-08-05) | 2026-08-04 |
| 2 | Workspace Foundation | ⬜ Not started | — |
| 3 | Local Environment | ⬜ Not started | — |
| 4 | Database Foundation | ⬜ Not started | — |
| 5 | Backend Library & API Foundation | ⬜ Not started | — |
| 6 | Identity & Authorization | ⬜ Not started | — |
| 7 | Media & Storage | ⬜ Not started | — |
| 8 | Catalog & Content Model | ⬜ Not started | — |
| 9 | Web Foundation | ⬜ Not started | — |
| 10 | Storefront Catalog & SEO | ⬜ Not started | — |
| 11 | Sourcing, Procurement & Inventory | ⬜ Not started | — |
| 12 | Cart & Pricing | ⬜ Not started | — |
| 13 | Checkout, Reservations & Orders | ⬜ Not started | — |
| 14 | Payments | ⬜ Not started | — |
| 15 | Shipping & Fulfilment | ⬜ Not started | — |
| 16 | Background Jobs | ⬜ Not started | — |
| 17 | Admin Console | ⬜ Not started | — |
| 18 | Content, Reviews & Notifications | ⬜ Not started | — |
| 19 | Observability, Caching & Performance | ⬜ Not started | — |
| 20 | Hardening & Launch Readiness | ⬜ Not started | — |

**Current phase:** Phase 1 — complete, with a documentation correction applied on
2026-08-05 (see [Phase 1 — Correction 1](#phase-1--correction-1-2026-08-05)).
**Next phase:** Phase 2 — **not started. Requires an explicit instruction.**

---

## Phase 1 — Architecture & Documentation

**Completed:** 2026-08-04 · **Status:** ✅

### Starting state

The repository contained a single commit (`5802ece media added.`) with eight
files and nothing else: no `.gitignore`, no `package.json`, no source, no
documentation.

```
apps/web/public/media/hero/
├── desktop/  honey-poster.webp · honey-scroll.mp4 · honey-scroll.webm
├── mobile/   honey-poster.webp · honey-scroll.mp4 · honey-scroll.webm
└── stills/   hero-start.webp · hero-end.webp
```

### Files created (36)

**Root**
- `.gitignore` — verified with a 78-case `git check-ignore` matrix
- `AGENTS.md` — permanent operating rules for all contributors
- `PLANS.md` — delivery plan, roadmap, working agreement, open business questions

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
| Payment webhook is the source of truth; the browser is never believed | [0013](adr/0013-payment-provider-abstraction.md) — *superseded by [0022](adr/0022-payment-verification-sources.md) on 2026-08-05* |
| Opaque server-side sessions rather than JWTs, chosen for instant revocation | [0015](adr/0015-session-auth.md) |
| Money as integer minor units + currency; single-point rounding | [0016](adr/0016-money-minor-units.md) |
| Hero media is immutable and in-repo, protected by a `.gitignore` guard block | [0019](adr/0019-hero-media-preservation.md) |
| No laboratory, moisture, or medical claims, enforced by a repo-wide CI regex | [0020](adr/0020-no-lab-moisture-medical-claims.md) |

### Verification performed

**`.gitignore`** — 78 probe files created at realistic paths, each checked with
`git check-ignore -q`, then all probes and the empty directories they created
removed. **78 / 78 passed, 0 failures.**

Notable cases proven:

| Case | Expected | Result |
|---|---|---|
| `dump.sql`, `db-dumps/honey.sql.gz`, `backups/nightly.dump` | ignored | ✅ |
| `packages/db/prisma/migrations/…/migration.sql` | **tracked** despite the `*.sql` rule | ✅ |
| `.env`, `.env.local`, `apps/api/.env.production` | ignored | ✅ |
| `.env.example`, `apps/api/.env.example` | **tracked** | ✅ |
| `.cursor/probe-scratch.txt`, `.cursor/tmp/probe.json` | ignored | ✅ |
| `.cursor/rules/probe.mdc` | **tracked** | ✅ |
| `assets/raw/…`, `*.mov`, `*.psd`, `*.fig` | ignored | ✅ |
| All eight Hero files, plus `apps/web/public/media/probe-delivery.mp4` | **tracked** | ✅ |
| `docker-compose.override.yml` | ignored | ✅ |
| `docker-compose.prod.yml`, `docker/prod/api/Dockerfile`, `.dockerignore` | **tracked** | ✅ |
| `pnpm-lock.yaml`, `AGENTS.md`, `docs/**` | **tracked** | ✅ |

**Hero assets** — `git diff --stat HEAD -- apps/web/public/media/hero` empty;
`git status --porcelain apps/web/public/media/hero` empty. All eight files
byte-identical to `HEAD`.

**Working tree** — `git status --porcelain` showed only untracked new files. No
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
[`PLANS.md §6`](../PLANS.md).

| # | Question | Blocks | Needed by |
|---|---|---|---|
| 1 | Which payment provider first (Zarinpal / IDPay / direct Shaparak IPG)? Is an international provider needed at launch? | Phase 14 | Before Phase 13 completes |
| 2 | Currency display: store IRR, show Toman on the Persian storefront? A second currency for English? | Phases 12–14 | Before Phase 12 |
| 3 | Shipping: flat-rate and manual only at launch, or an integrated carrier? | Phase 15 | Before Phase 15 |
| 4 | VAT applicability, rate, and whether prices are tax-inclusive | Phase 12 | Before Phase 12 |
| 5 | Guest checkout allowed, or is an account required? | Phase 13 | Before Phase 13 |
| 6 | Invoice format, numbering scheme, and any statutory fields | Phase 13 | Before Phase 13 |
| 7 | Are customer reviews in scope for launch? | Phase 18 | Before Phase 18 |
| ~~8~~ | ~~Hosting target~~ | — | **✅ Resolved 2026-08-05** |
| 9 | Production domain, and whether the canonical host is apex or `www` | Phase 10 | Before Phase 10 |
| 10 | Licensed Persian and Latin webfonts for the brand | Phase 9 | Before Phase 9 |

**Resolved — #8 Hosting target (2026-08-05).** Self-hosted Linux VPS running
Docker Compose behind a reverse proxy with TLS. Provider-neutral, with the
architecture kept portable to managed services later
([ADR-0023](adr/0023-self-hosted-vps-deployment.md)). Phase 3 is unblocked.
Questions 1–7, 9, and 10 remain open and are **not** affected by this decision.

**Technical decisions deliberately deferred**, with a default recorded so nothing
is blocked: exact Node and pnpm versions (Phase 2, current LTS); Tailwind vs.
CSS Modules for `packages/ui` (Phase 9 — either satisfies the logical-properties
requirement); search engine beyond Postgres (Phase 19, only if measurement
demands it); CDN provider (Phase 20 — now an optional layer in front of the
self-hosted proxy rather than a hosting decision); VPS provider and sizing
(Phase 20 — deliberately interchangeable, which is the point of ADR-0023).

### Notes for the next phase

Phase 2 creates the workspace skeleton only — manifests, Turborepo pipeline,
strict TypeScript bases, ESLint with the boundary rules from
[`module-boundaries.md §7`](module-boundaries.md), Prettier, `.gitattributes`,
`.env.example`, and a CI skeleton. **No application code, no Docker, no Prisma.**

`.env.example` does not exist yet — it is intentionally a Phase 2 deliverable,
since Phase 1 was documentation only. The `.gitignore` already guarantees it will
be tracked while every other env file is ignored.

Two things to get right early because they are expensive later: `.gitattributes`
must normalize line endings (this repository is being developed on Windows) and
mark the media files as binary; and the ESLint boundary rules must be
CI-blocking from their first commit, since a boundary rule added after violations
exist never gets turned on.

**Amended 2026-08-05.** Phase 2 must also create `packages/backend` as a
placeholder alongside the other packages, and its `dependency-cruiser` rules must
forbid `apps/worker → apps/api`, `apps/* → packages/db`, and
`apps/web → packages/backend` from the first commit
([ADR-0021](adr/0021-shared-backend-package.md)). Proving those rules fail on a
deliberate violation while the workspace is still empty is a Phase 2 acceptance
criterion, for exactly the reason in the paragraph above.

---

## Phase 1 — Correction 1 (2026-08-05)

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
| `docs/architecture.md` | System diagram, application boundaries (§3.2–3.5), workspace layout and dependency direction (§4), request lifecycles (§5), integrations (§9), background processing (§10), deployment topology (§11), testing (§13), non-goals (§14) |
| `docs/module-boundaries.md` | Module anatomy moved to `packages/backend` (§1); forbidden edges expanded (§3); §6 now covers all three composition roots; enforcement rules extended (§7); adding-a-module steps updated (§8) |
| `docs/database-strategy.md` | Owner is now `packages/backend`; pooling, backup, and monitoring adjusted for single-node self-hosting |
| `docs/api-strategy.md` | §10 rewritten as three provider-verified inbound paths instead of a webhook-only section |
| `docs/security-model.md` | Trust-boundary diagram splits composition roots from `packages/backend`; §8 payment security rewritten around server-verified outcomes |
| `docs/domain-model.md` | `PaymentProvider` port: `getStatus` mandatory, `verifyReturn`/`parseWebhook` optional and capability-declared; §11 rules rewritten |
| `docs/docker-strategy.md` | §7 production topology rewritten for the self-hosted VPS; deployment sequence and backup section updated; image notes for the shared package |
| `docs/implementation-phases.md` | Module terminology note; Phase 2, 3, 4, 5, 14, 16, 20 updated; universal exit criteria and sequencing rationale extended |
| `docs/adr/README.md` | ADRs 0021–0023 indexed; supersession chain section added |
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
| All internal documentation links resolve — 159 relative links across 38 markdown files | ✅ 0 broken |
| ADRs 0001–0020 all still present and unmodified | ✅ `git status --porcelain` lists none of them; only `docs/adr/README.md` was touched in that directory |
| `AGENTS.md`, `.gitignore`, `product-scope.md`, `i18n-strategy.md`, `seo-strategy.md` unchanged | ✅ absent from `git status` |
| No application source code exists (`*.ts`, `*.tsx`, `*.js`, `*.jsx`, `*.prisma`) | ✅ none |
| No package-manager files (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `node_modules`) | ✅ none |
| No Docker or CI files created | ✅ none |
| Hero assets byte-identical to `HEAD` | ✅ `git status` and `git diff` both empty for the hero path |
| No marketplace vocabulary introduced | ✅ `seller`/`vendor`/`merchant`/`commission` appear only in prohibition text |
| No laboratory, moisture, or medical vocabulary introduced | ✅ same — prohibition text only |
| No secrets, keys, or credentials in any new text | ✅ placeholders only |
| No `git add`, `commit`, or `push` | ✅ working tree left for review |

`lint`, `typecheck`, `test`, and `build` remain unrunnable — those scripts arrive
in Phase 2. Nothing in this correction changes that.

### What did not change

The domain model, the product scope, the i18n strategy, the SEO strategy, and
`AGENTS.md` needed no edits: none of them depended on where the code physically
sits, on the webhook being privileged, or on a hosting provider. The 20 original
ADRs are untouched. Phase 1's deliverable list and acceptance criteria are
unchanged; this corrects the content of documents already delivered.

### Still open

Business questions 1–7, 9, and 10 remain open. Only the hosting target was
resolved. In particular, the **payment provider is still unchosen** — ADR-0022
makes the architecture tolerant of either provider style, which lowers the cost
of that decision but does not make it.

---

## Decision log (chronological)

| Date | Decision | Recorded in |
|---|---|---|
| 2026-08-04 | Full architecture and documentation set established for Phase 1 | This document |
| 2026-08-04 | 20 ADRs accepted covering stack, boundaries, domain invariants, and product prohibitions | [`docs/adr/`](adr/README.md) |
| 2026-08-04 | `.gitignore` created and verified against a 78-case matrix | This document |
| 2026-08-05 | Business logic moved to `packages/backend`, shared by two composition roots — resolves the API/worker contradiction | [ADR-0021](adr/0021-shared-backend-package.md) |
| 2026-08-05 | Payment state changes only on a server-verified outcome from any of three channels; webhooks no longer privileged | [ADR-0022](adr/0022-payment-verification-sources.md) |
| 2026-08-05 | Initial deployment target: self-hosted Linux VPS with Docker Compose and a TLS reverse proxy | [ADR-0023](adr/0023-self-hosted-vps-deployment.md) |
