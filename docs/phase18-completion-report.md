# Phase 18 — Content, Reviews & Notifications completion report

Completed 2026-10-11 against the human-accepted Phase 17 commit `e25d3f1`.
Only Phase 18 was implemented. Changes remain unstaged; Phase 19 is CURRENT but
NOT STARTED. No commit, tag, push, production deployment or developer-database
repair was performed.

## Implementation and evidence — 77 requested topics

| # | Topic | Result |
|---|---|---|
| 1 | Files created | 98 exact paths in **Files created** below. |
| 2 | Files modified | 74 exact paths with purposes in **Files modified** below. |
| 3 | Dependencies | None added/upgraded; lockfile unchanged. Existing Prisma, Redis, SMTP, Zod, Playwright and axe tooling reused. |
| 4 | Migration | Two forward migrations: content/reviews/notifications/newsletter constraints and seed templates, then customer-only `review:submit`. All 14 applied in isolated tests. |
| 5 | Content schema audit | Six existing Page/Article/FaqItem and translation models reused. The four review/delivery/template/subscription skeletons assumed by the prompt were absent and were added once. |
| 6 | Content module | Backend owns validation, publication, translations, public projections, repository, cache and audit/outbox. |
| 7 | Page/Article/FAQ | Real create/edit/search/publish/archive workflows; FAQ plain paragraph; no fallback to unpublished or different-locale content. |
| 8 | Block schema | Flat 1–60 blocks: heading level 2/3, paragraph, quote, public MediaAsset image with alt text. Exact bounded keys, no HTML/JS/iframe or visual canvas. |
| 9 | Publish rule | Both enabled locales complete, valid slugs/SEO/body and public-safe media required server-side. DRAFT→PUBLISHED; ARCHIVED terminal. Row locking prevents competing publication/translation writes. |
| 10 | Content admin | Existing Phase 17 shell, bounded lists and locale editor, SEO, keyboard block ordering, public-image picker/preview, real publish/archive actions. |
| 11 | Public routes | EN `/en/pages/[slug]`, `/en/articles`, `/en/articles/[slug]`, `/en/faq`; FA `/fa/safahat/[slug]`, `/fa/maghalat`, `/fa/maghalat/[slug]`, `/fa/porseshha`. |
| 12 | Article JSON-LD | Real published localized Article data through existing safe serializer. |
| 13 | FAQPage JSON-LD | Only the published localized questions/answers visible on that page. |
| 14 | Cache/sitemap/hreflang | Authoritative DB publication reads even on Redis resolution hits; immediate best-effort eviction plus durable worker invalidation, content tags, sitemap partitions and reciprocal published-locale alternates. |
| 15 | Reviews module | Backend owns submission, moderation, safe approved lists and aggregates; owning Orders/Fulfilment/Catalog seams supply context. |
| 16 | Purchase policy | CUSTOMER session and `review:submit`; own paid FULFILLED/COMPLETED order containing product; every order line fully delivered; no cancellation or refund. Guest purchases ineligible. Existing approval survives later refund. |
| 17 | Duplicate policy | One review per customer/product for all time, including rejected reviews; DB uniqueness and concurrent submit proof. |
| 18 | Moderation queue | STAFF `review:moderate`; bounded pending/context list; approve/reject only, immutable customer text, atomic audit/outbox and one concurrent winner. |
| 19 | Claim enforcement | FA/EN guidance and deterministic prohibited-claim publication guard; no external AI. Staff judgment remains necessary beyond recognized phrases. |
| 20 | Public reviews | APPROVED only, safe rating/title/body/locale/verified indicator and localized verified-buyer label. No email, order, moderator or rejection metadata. |
| 21 | Aggregate | Server count/average of APPROVED only in the same repeatable-read projection as public rows. |
| 22 | Zero-review JSON-LD | `aggregateRating` omitted entirely at zero; no fake stars/null aggregate. |
| 23 | Storefront reviews | Visible approved list/aggregate, localized empty state, accessible radio rating and pending feedback. Eligibility fetched privately after hydration. Anonymous BFF eligibility safely returns false while protected API still requires permission. |
| 24 | Notifications module | Backend owns DB templates, renderer/allowlists, locale resolution, delivery fencing, newsletter lifecycle and MailSender/SmsSender coordination. |
| 25 | Template identity/codes | Unique `(code, locale, channel)`. Four codes: shipment-shipped, shipment-delivered, newsletter-confirm, newsletter-welcome; 12 operational FA/EN EMAIL/SMS templates seeded without overwrite. |
| 26 | Placeholder security | Shipment: orderNumber/trackingNumber/trackingUrl; newsletter: actionUrl. Unknown/prototype/path placeholders rejected; text/values escaped, header CRLF rejected, fixed safe origins/paths and HTTPS tracking enforced. |
| 27 | Template admin | `/[locale]/admin/notifications`: code/channel/locale/completeness, allowed variables, subject/body save and synthetic preview. No arbitrary test-send. |
| 28 | Locale resolution | Shipment uses frozen Order.localeAtPurchase. Newsletter uses subscription locale. Admin/browser/worker/preference cannot override; missing locale/template fails closed. |
| 29 | Order locale proof | Real DB regression and Mailpit/browser: admin EN + FA order→FA/RTL; admin FA + EN order→EN/LTR. Later preferred-locale change does not affect mail. |
| 30 | Email migration | Existing SHIPPED/DELIVERED flow inventoried and delegates to one Notifications renderer; existing v1 job retained. Successful historical fulfilment records backfilled to delivery identities. Phase 6 identity mail remains purpose-specific. No invented order/payment mail consumer. |
| 31 | Delivery records | Unique dedupe identity, code/channel, recipient SHA-256, locale/state, safe optional providerRef, sentAt, fenced UUID lease/expiry/attempt count; no raw recipients/bodies/provider responses. |
| 32 | Queue/idempotency | Existing email queue, ID-only validated jobs and deterministic job IDs. Concurrent claim/replay and SENT no-op tested; no duplicate logical delivery. |
| 33 | SMTP crash window | Acceptance before SENT persistence can still duplicate mail after a crash; explicitly at-least-once. No exactly-once claim. |
| 34 | SMS | Disabled adapter registered honestly; no provider selected, no send UI and no fake SENT. SMS template management supported. |
| 35 | Newsletter states | PENDING→CONFIRMED→UNSUBSCRIBED controlled by application service; no admin force-confirm/status editing. |
| 36 | Double opt-in | Explicit consent creates PENDING plus durable ID-only intent. Confirmation required before welcome/marketing eligibility; registration/purchase never auto-subscribes. |
| 37 | Tokens | 32 random bytes, SHA-256-only persistence; confirmation expires in 24h, unsubscribe in one year. No raw tokens in jobs/audits/logs; purpose cannot verify identity or reset password. |
| 38 | Confirmation | Localized GET presentation, explicit POST conditional single consumption; concurrent/repeated/expired cases tested. One welcome intent. |
| 39 | Unsubscribe | Localized tokenized no-login POST, idempotent, no email guessing, noindex/no-store/no-referrer; old query cleared after action. |
| 40 | Resubscribe | Human-approved fresh consent and new confirmation mail; all old confirmation/unsubscribe hashes and stale queued consent identities invalidated atomically. |
| 41 | Newsletter admin | Only notification templates. No subscriber export/list, forced confirmation, campaign, broadcast, segmentation or arbitrary status editing. |
| 42 | Mailpit | Exactly 12 expected real messages in final Phase 18 browser run; recipients, locale, subject/body/direction, escaping and replay verified locally. |
| 43 | Direction | FA HTML lang=fa/dir=rtl; EN lang=en/dir=ltr; conservative table markup with operational-value bidi isolation. Actual Gmail/Outlook visual QA not executed. |
| 44 | Authorization matrix | STAFF content:read for editorial/template reads and preview; content:write for create/edit/template save; content:publish for publish/archive. STAFF review:moderate for queue/actions. CUSTOMER review:submit for private eligibility/submission. Public published reads/newsletter token actions declare public access. |
| 45 | CSRF/audit | Cookie-authenticated writes require CSRF, fresh session/explicit permission and account limits. Privileged writes/audit/outbox atomic. Public newsletter BFF forwards no ambient auth cookies; IP limits and exact bodies applied. |
| 46 | XSS | Unsafe blocks/FAQ rejected, customer review payload rendered literally, template variables/copy escaped; moderation/preview browser injection checks and script-closing JSON-LD tests pass. |
| 47 | Privacy | Distinct public/admin DTOs; private/no-store eligibility/admin/newsletter; no subscriber hashes, delivery internals, order/user IDs or supplier/private-media data in public contracts. |
| 48 | OpenAPI | Generate/check/lint/public forbidden reachability/types and breaking against committed Phase 17 HEAD passed; zero warnings. |
| 49 | Structured data | 7 new web tests plus existing Product/SEO regressions; Article/FAQPage/Product actual data only, serializer escapes script-closing text. |
| 50 | Sitemap/robots | Published locale pages/articles/FAQ only; archive removal tested. Admin/token/draft routes excluded; existing staging noindex and robots gates preserved. |
| 51 | i18n | Strict FA/EN UI catalog parity; editorial/template DB data separate from UI messages and customer review text. Localized path strategy tested. |
| 52 | Accessibility | 16 Phase 18 axe scans, 0 serious, 0 critical; semantic FAQ disclosures, keyboard ordering, labeled radio/form controls and error associations. |
| 53 | Responsive | 65 viewport checks over 13 contexts at 360/390/768/1280/1920; no unintended page overflow. Existing luxury/store/admin tokens retained. |
| 54 | Exact workspace tests | Backend 303/0/0, API 80/0/0, web 66/0/0, worker 40/0/0; i18n 29/0/0, contracts 3/0/0, UI 5/0/0, boundaries 22/0/0. Total 548 passed/0 failed/0 skipped, no cache; core/utils zero tests. Phase 18 focused backend 55, API 6, worker 7, web new SEO/BFF 9. |
| 55 | PostgreSQL | 79 tables, 35 enums, 35 rejection proofs; 14 migrations applied/no pending; seeds stable across two runs. Phase 18 real-DB tests 11/0/0. |
| 56 | Redis/worker | Final isolated browser run: 4 shipment, 8 newsletter, 17 cache, 2 sitemap jobs completed; 0 rejected/dead-letter jobs. Redis-outage readiness regression passed. |
| 57 | Mailpit counts | 4 shipment messages + 8 newsletter messages from two fresh consent cycles per locale = 12; replay does not add messages. |
| 58 | Phase 18 Playwright | 7 passed, 0 failed, 0 skipped with disposable real PostgreSQL/Redis/MinIO/Mailpit/worker. |
| 59 | Admin Playwright | Existing Phase 17 suite 10 passed, 0 failed, 0 skipped. |
| 60 | Storefront Playwright | Complete existing storefront suite 101 passed, 0 failed, 0 skipped, including visual/Hero/performance and commerce flows. |
| 61 | Axe counts | Phase 18 16 scans: 0 serious/critical violations. Existing admin/storefront accessibility tests also pass as part of their full suites. |
| 62 | DB verification | Format/validate/generate/migrate/status/test exit 0; isolated database only, historical migrations untouched. |
| 63 | Phase verifiers | All 15 Phase 4–18 verifiers exit 0. Only obsolete temporal absence assertions updated; security/scope checks retained. STAFF proof: 17 controllers/113 operations; 104 explicit BFF routes. |
| 64 | Workspace gates | Format/check, lint (10 tasks), stylelint, boundaries, typecheck (17 tasks), test (17 uncached tasks), build (10 tasks), i18n validation exit 0. |
| 65 | Docker | Compose config/health verification and API/web/worker image builds exit 0. Frozen lockfile and original Dockerfiles retained; temporary local network proxy removed after DNS workaround. |
| 66 | Image smoke | 3 images UID 1000/no .env; API ready/admin protected, 5 localized web routes, worker Redis ready. API SIGTERM 0; Next awaited cleanup marker then intended SIGTERM 143, no OOM/forced kill; active worker drains sitemap job and exits 0. |
| 67 | Hero | Empty status/diff and all 8 Git hashes match HEAD. No Hero edit/re-encode/copy into media infrastructure. Existing web image includes only normal static Hero assets. |
| 68 | MinIO | Both configured local buckets and isolated test buckets scanned: 0 Hero-name matches. |
| 69 | Secret/token scan | 172 changed files and 39 built client files; no literal raw action tokens. Zero configured non-placeholder secret values available for literal comparison; no claim of unavailable production-secret/subscriber validation. |
| 70 | Historical migration integrity | Tracked migration diff empty; only two new forward migrations. No existing migration rewritten; lockfile unchanged. |
| 71 | .env | Untracked, unchanged and excluded from all runtime images. No new env variables required beyond existing configured public origin/cache settings. |
| 72 | Staging | Empty; no git add/commit/tag/push. |
| 73 | Skips/non-executed | Required final suites: 0 skipped. Core/utils contain 0 tests. No live PSP/carrier/SMTP/SMS vendor, production deployment/secret/subscriber validation, or Gmail/Outlook visual QA executed; local-only synthetic infrastructure is the specified test boundary. |
| 74 | Human decisions | All three policy/scope approvals recorded; no unresolved Phase 18 decision. Existing launch decisions remain in their original phases. |
| 75 | Risks | SMTP crash duplication, deterministic claim-filter limits, fail-closed missing templates, external-client visual QA and normal migration deployment; detailed below. |
| 76 | Phase 19 absence | Structural scope checks, unchanged dependencies, no new tracing/metrics/analytics/observability pages or launch infrastructure. Existing Phase 16 cache/sitemap integration used only for actual Phase 18 behavior. |
| 77 | Acceptance | Required local release gates and scoped deliverables met; detailed checklist below. External-client and production validations explicitly bounded. |

## Failures investigated and corrected

- Concrete API query DTOs initially lost Nest runtime metadata when imported as
  types. Concrete review/template query/param DTO subclasses restore runtime
  validation; direct API tests and OpenAPI generation/checks pass.
- Redis readiness could reject before first use and cause an unhandled rejection
  during worker startup. Readiness is observed immediately, while invalidation
  still propagates failure for queue retry. New real connection-failure test
  passes; final browser worker has zero rejected/dead-letter jobs.
- Anonymous review eligibility's browser 401 request remained pending and stalled
  the existing PDP network-idle performance check. The BFF maps anonymous 401 to
  private `{eligible:false}`; the protected API still requires CUSTOMER permission.
  Two new BFF tests, the unchanged performance criterion and full suite pass.
- The new footer email field collided with old checkout label selectors. Four
  existing e2e files now target the main checkout form; assertions unchanged.
  Footer links received wrapping/44px targets. One affected catalog visual
  baseline was inspected and updated for the authorized footer change only.
- Cold browser startup initially exhausted scheduled worker retries. The isolated
  runner waits for real web/API readiness before launching worker; durable queued
  intents remain unchanged. Final 12 email, 17 cache and 2 sitemap jobs pass.
- A full workspace run under concurrent Docker load exceeded an unchanged 5s
  legacy checkout test timeout. Targeted 25-test checkout rerun and final uncached
  548-test workspace run passed; no assertion or timeout was relaxed.
- Docker dependency fetching hit Docker-network DNS failures. A temporary local
  TLS CONNECT proxy using host DNS allowed the original frozen-lockfile builds.
  Aborted task-owned build helpers holding cache locks were stopped, then all
  three original builds completed. No container/volume/image prune occurred.
- New smoke-harness expectations initially omitted FAQ response metadata and
  incorrectly assumed Next.js SIGTERM exits zero. Expectations now match the
  current API contract and installed framework's awaited cleanup, asserting its
  completion marker, exact intended 143, no OOM and no deadline failure. Existing
  tests and application shutdown behavior were unchanged.

## Files created

98 created files:

- `apps/api/src/modules/content/content.controller.ts`
- `apps/api/src/modules/notifications/notifications.controller.ts`
- `apps/api/src/modules/reviews/reviews.controller.ts`
- `apps/api/test/phase18.test.ts`
- `apps/web/e2e/phase18.spec.ts`
- `apps/web/playwright.phase18.config.ts`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/content/[kind]/[id]/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/content/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/notifications/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/reviews/page.tsx`
- `apps/web/src/app/[locale]/(storefront)/articles/[slug]/page.tsx`
- `apps/web/src/app/[locale]/(storefront)/articles/page.tsx`
- `apps/web/src/app/[locale]/(storefront)/faq/page.tsx`
- `apps/web/src/app/[locale]/(storefront)/newsletter/confirm/page.tsx`
- `apps/web/src/app/[locale]/(storefront)/newsletter/unsubscribe/page.tsx`
- `apps/web/src/app/[locale]/(storefront)/pages/[slug]/page.tsx`
- `apps/web/src/app/api/bff/admin/content/article/[id]/archive/route.ts`
- `apps/web/src/app/api/bff/admin/content/article/[id]/publish/route.ts`
- `apps/web/src/app/api/bff/admin/content/article/[id]/translations/route.ts`
- `apps/web/src/app/api/bff/admin/content/article/route.ts`
- `apps/web/src/app/api/bff/admin/content/faq/[id]/archive/route.ts`
- `apps/web/src/app/api/bff/admin/content/faq/[id]/publish/route.ts`
- `apps/web/src/app/api/bff/admin/content/faq/[id]/translations/route.ts`
- `apps/web/src/app/api/bff/admin/content/faq/route.ts`
- `apps/web/src/app/api/bff/admin/content/page/[id]/archive/route.ts`
- `apps/web/src/app/api/bff/admin/content/page/[id]/publish/route.ts`
- `apps/web/src/app/api/bff/admin/content/page/[id]/translations/route.ts`
- `apps/web/src/app/api/bff/admin/content/page/route.ts`
- `apps/web/src/app/api/bff/admin/notifications/templates/preview/route.ts`
- `apps/web/src/app/api/bff/admin/notifications/templates/route.ts`
- `apps/web/src/app/api/bff/admin/reviews/[id]/approve/route.ts`
- `apps/web/src/app/api/bff/admin/reviews/[id]/reject/route.ts`
- `apps/web/src/app/api/bff/me/reviews/eligibility/route.test.ts`
- `apps/web/src/app/api/bff/me/reviews/eligibility/route.ts`
- `apps/web/src/app/api/bff/me/reviews/route.ts`
- `apps/web/src/app/api/bff/newsletter/confirm/route.ts`
- `apps/web/src/app/api/bff/newsletter/subscribe/route.ts`
- `apps/web/src/app/api/bff/newsletter/unsubscribe/route.ts`
- `apps/web/src/app/api/bff/products/[id]/reviews/route.ts`
- `apps/web/src/components/admin/editorial-forms.tsx`
- `apps/web/src/components/editorial/blocks.tsx`
- `apps/web/src/components/editorial/content-page.tsx`
- `apps/web/src/components/editorial/newsletter.tsx`
- `apps/web/src/components/editorial/reviews.tsx`
- `apps/web/src/lib/api-client/public-action.ts`
- `apps/web/src/lib/editorial/api.ts`
- `apps/web/src/lib/editorial/media.ts`
- `apps/web/src/lib/editorial/types.ts`
- `apps/web/src/lib/seo/builders/editorial.ts`
- `apps/web/src/lib/seo/editorial.test.ts`
- `apps/web/src/styles/editorial.css`
- `apps/worker/src/phase18.test.ts`
- `docs/adr/0047-content-reviews-localized-notifications.md`
- `docs/adr/0048-customer-review-submission-permission.md`
- `docs/content-reviews-notifications-development.md`
- `docs/phase18-completion-report.md`
- `docs/testing-strategy.md`
- `packages/backend/src/modules/content/application/content-cache-invalidation.service.ts`
- `packages/backend/src/modules/content/application/content.service.ts`
- `packages/backend/src/modules/content/content.module.ts`
- `packages/backend/src/modules/content/domain/content-cache.ts`
- `packages/backend/src/modules/content/domain/content.ts`
- `packages/backend/src/modules/content/index.ts`
- `packages/backend/src/modules/content/infrastructure/prisma-content.repository.ts`
- `packages/backend/src/modules/content/infrastructure/redis-content-cache.ts`
- `packages/backend/src/modules/content/module.meta.ts`
- `packages/backend/src/modules/notifications/application/notifications.service.ts`
- `packages/backend/src/modules/notifications/domain/notifications.ts`
- `packages/backend/src/modules/notifications/domain/templates.ts`
- `packages/backend/src/modules/notifications/index.ts`
- `packages/backend/src/modules/notifications/infrastructure/prisma-notifications.repository.ts`
- `packages/backend/src/modules/notifications/infrastructure/smtp-mail-sender.ts`
- `packages/backend/src/modules/notifications/module.meta.ts`
- `packages/backend/src/modules/notifications/notifications.module.ts`
- `packages/backend/src/modules/orders/application/review-purchase.service.ts`
- `packages/backend/src/modules/orders/domain/review-purchase.ts`
- `packages/backend/src/modules/orders/infrastructure/prisma-review-purchase.repository.ts`
- `packages/backend/src/modules/reviews/application/reviews.service.ts`
- `packages/backend/src/modules/reviews/domain/reviews.ts`
- `packages/backend/src/modules/reviews/index.ts`
- `packages/backend/src/modules/reviews/infrastructure/prisma-reviews.repository.ts`
- `packages/backend/src/modules/reviews/module.meta.ts`
- `packages/backend/src/modules/reviews/reviews.module.ts`
- `packages/backend/src/policy/editorial-text.ts`
- `packages/backend/test/phase18-cache.test.ts`
- `packages/backend/test/phase18.integration.test.ts`
- `packages/backend/test/phase18.unit.test.ts`
- `packages/db/prisma/migrations/20261011000000_phase18_content_reviews_notifications/migration.sql`
- `packages/db/prisma/migrations/20261011010000_phase18_customer_review_permission/migration.sql`
- `packages/i18n/src/messages/en/editorial.ts`
- `packages/i18n/src/messages/fa/editorial.ts`
- `scripts/lib/phase18-test-services.mjs`
- `scripts/smoke-phase18-images.mjs`
- `scripts/test-phase18-browser.mjs`
- `scripts/verify-phase18-database.mjs`
- `scripts/verify-phase18-minio.mjs`
- `scripts/verify-phase18-secrets.mjs`
- `scripts/verify-phase18.mjs`

## Files modified

74 modified files:

| Exact path | Change |
|---|---|
| `.github/workflows/ci.yml` | Preserve earlier gates and add Phase 18 real DB, backend/API/worker/web/browser/verifier checks. |
| `PLANS.md` | Record completed Phase 18, resolved review policy and current but unstarted Phase 19. |
| `README.md` | Describe bounded Phase 18 modules and development commands. |
| `apps/api/src/app.module.ts` | Compose content/reviews/notifications controllers and backend services. |
| `apps/api/src/config/api-config.ts` | Validate notification public origin and shared content cache namespace. |
| `apps/api/src/http/auth/authorization.guard.ts` | Enforce declared customer-only review capability alongside STAFF permissions. |
| `apps/api/src/openapi/document.ts` | Describe editorial, review and notification operation tags. |
| `apps/web/e2e/catalog-visual.spec.ts-snapshots/catalog-search-no-results.png` | Update only the inspected expected footer after authorized newsletter/editorial links. |
| `apps/web/e2e/checkout.spec.ts` | Scope checkout email locator to main content after adding footer signup. |
| `apps/web/e2e/payments-a11y.spec.ts` | Scope checkout email locator to main content; retain accessibility assertions. |
| `apps/web/e2e/payments.spec.ts` | Scope checkout email locator to main content; retain payment assertions. |
| `apps/web/e2e/shipping-fulfilment.spec.ts` | Scope checkout email locator to main content; retain fulfilment assertions. |
| `apps/web/playwright.config.ts` | Keep isolated Phase 18 suite out of the existing full storefront configuration. |
| `apps/web/src/app/[locale]/(storefront)/products/[slug]/page.tsx` | Render approved reviews and authoritative aggregate with private eligibility boundary. |
| `apps/web/src/app/[locale]/layout.tsx` | Load existing-token editorial stylesheet. |
| `apps/web/src/app/api/bff/revalidate/route.test.ts` | Verify accepted content/review tags and sitemap invalidation. |
| `apps/web/src/app/api/bff/revalidate/route.ts` | Revalidate bounded editorial/product review tags through existing secure port. |
| `apps/web/src/app/sitemap.xml/route.ts` | Include published pages/articles partitions in sitemap index. |
| `apps/web/src/app/sitemaps/[locale]/[type]/route.ts` | Accept the bounded pages/articles partition types. |
| `apps/web/src/components/admin/admin-form.tsx` | Restore supported localized field labels and safe public media previews. |
| `apps/web/src/components/shell/site-footer.tsx` | Add real localized newsletter signup and articles/FAQ links. |
| `apps/web/src/lib/admin/navigation.ts` | Add permission-aware content/review/template navigation entries. |
| `apps/web/src/lib/cache/tags.ts` | Define bounded content and review cache tags. |
| `apps/web/src/lib/seo/builders/product.ts` | Emit exact approved aggregate and omit it at zero reviews. |
| `apps/web/src/lib/sitemap/entries.ts` | Read published editorial translations with canonical URLs and alternates. |
| `apps/web/src/middleware.ts` | Apply private no-store/noindex/no-referrer to newsletter token pages. |
| `apps/worker/src/config.ts` | Validate public origin and shared content cache namespace for notifications. |
| `apps/worker/src/email.integration.test.ts` | Assert the unified delivery fence and decode real multipart SMTP bodies. |
| `apps/worker/src/outbox-routing.ts` | Route actual editorial/review cache and newsletter ID-only intents. |
| `apps/worker/src/runtime.ts` | Call backend notification/cache services from existing thin processors. |
| `apps/worker/src/worker.module.ts` | Compose Notifications and content cache services without DB reach-through. |
| `docs/api-strategy.md` | Document Phase 18 public/private operations and transport boundaries. |
| `docs/architecture.md` | Record bounded editorial, review and notification application ownership. |
| `docs/domain-model.md` | Record Phase 18 publication, purchase, delivery and consent entities/rules. |
| `docs/i18n-strategy.md` | Distinguish UI catalogs from DB editorial/templates and authoritative mail locale. |
| `docs/module-boundaries.md` | Document owning-module seams and new backend module boundaries. |
| `docs/product-scope.md` | Record the explicitly approved bounded newsletter/template management scope. |
| `docs/progress.md` | Record final inventory, decisions, results, risks and Phase 19 stop boundary. |
| `docs/security-model.md` | Document customer review permission, token lifecycle and private projections. |
| `docs/seo-strategy.md` | Record published Article/FAQPage, real approved aggregate and token exclusions. |
| `package.json` | Add Phase 18 verifier and isolated browser commands without dependencies. |
| `packages/backend/src/index.ts` | Export the three new modules for composition roots. |
| `packages/backend/src/jobs/contracts.ts` | Add validated ID-only newsletter v1 job while retaining existing payloads. |
| `packages/backend/src/modules/catalog/application/catalog.service.ts` | Expose safe owning-module product publication/name context for reviews. |
| `packages/backend/src/modules/fulfilment/application/fulfilment.service.ts` | Expose full-delivery eligibility and immutable shipment message context. |
| `packages/backend/src/modules/fulfilment/infrastructure/smtp-fulfilment-notification.adapter.ts` | Delegate existing fulfilment renderer to the shared Notifications service. |
| `packages/backend/src/modules/identity/domain/identity.ts` | Declare dedicated review:submit capability. |
| `packages/backend/src/modules/orders/index.ts` | Export the small verified-purchase query seam. |
| `packages/backend/src/modules/orders/orders.module.ts` | Compose the Orders-owned purchase qualification repository/service. |
| `packages/backend/src/platform/application/sitemap-revalidation.service.ts` | Include published content through the accepted sitemap revalidation port. |
| `packages/backend/src/platform/domain/sitemap-revalidation.port.ts` | Extend bounded sitemap entity types with pages/articles. |
| `packages/backend/test/phase15.smtp.integration.test.ts` | Exercise the delegated unified template renderer with existing SMTP assertions. |
| `packages/contracts/openapi.json` | Regenerate distinct validated Phase 18 public/admin contracts. |
| `packages/contracts/scripts/check-forbidden.mjs` | Extend public-reachability checks for editorial/review/delivery/token privacy. |
| `packages/contracts/src/generated/api.ts` | Regenerate typed Phase 18 API operations without handwritten entities. |
| `packages/db/prisma/schema.prisma` | Add four missing review/notification/newsletter models and required constraints/indexes. |
| `packages/db/seed/data.ts` | Grant only CUSTOMER review:submit while preserving existing STAFF grants. |
| `packages/db/test/admin-browser-fixture.ts` | Supply synthetic delivered purchases/customer identities for isolated Phase 18 tests. |
| `packages/db/test/run-integration.ts` | Check 25 permissions, preserved OWNER grants and customer-only review capability. |
| `packages/i18n/src/messages/en/admin.ts` | Restore supported shared English admin fields required by new real forms. |
| `packages/i18n/src/messages/en/index.ts` | Include English editorial UI catalog. |
| `packages/i18n/src/messages/fa/admin.ts` | Restore supported shared Persian admin fields required by new real forms. |
| `packages/i18n/src/messages/fa/index.ts` | Include Persian editorial UI catalog. |
| `packages/i18n/src/messages/types.ts` | Type all new editorial/review/newsletter/template UI messages. |
| `packages/i18n/src/pathnames.ts` | Define localized editorial and newsletter presentation routes. |
| `packages/i18n/test/parity.test.mjs` | Include editorial catalog in strict FA/EN parity verification. |
| `packages/i18n/test/pathnames.test.mjs` | Verify localized articles/pages/FAQ/newsletter paths. |
| `scripts/lib/admin-test-storage.mjs` | Scan both disposable buckets for excluded Hero object names. |
| `scripts/verify-phase10.mjs` | Replace obsolete no-review assertion with authoritative approved aggregate proof. |
| `scripts/verify-phase12.mjs` | Remove only obsolete Phase 18 module absence assertion. |
| `scripts/verify-phase13.mjs` | Remove only obsolete Phase 18 module absence assertion. |
| `scripts/verify-phase14.mjs` | Remove only obsolete Phase 18 module absence assertion. |
| `scripts/verify-phase15.mjs` | Verify delegated mail renderer and remove obsolete notification/review absence checks. |
| `scripts/verify-phase17.mjs` | Accept implemented Phase 18 routes and verify expanded STAFF/BFF counts. |

## Decisions made

- [ADR-0047](adr/0047-content-reviews-localized-notifications.md): flat bounded
  content/publication, human-approved eligibility/privacy/refund policy, one
  localized delivery authority, durable double opt-in and fresh-consent cycles.
- [ADR-0048](adr/0048-customer-review-submission-permission.md): customer-only
  `review:submit`; no customer grant of staff order access. OWNER retains 24
  permissions; total permissions 25; CUSTOMER has only the new capability.
- Product scope includes only the human-approved bounded newsletter and template
  administration; campaigns, broadcasts and provider selection remain absent.
- No dependencies or historical ADRs/migrations changed. Retry uses the current
  template; already-SENT deliveries are not rerendered or resent.

## Unresolved decisions

None for Phase 18. All requested review, scope and resubscribe decisions were
explicitly approved by the human. Existing currency/tax/legal/domain/font launch
questions remain outside Phase 18. Phase 19 is current but not started.

## Risks

- SMTP may duplicate after provider acceptance followed by a crash before SENT
  persistence. Fencing protects normal concurrent/replayed jobs, not this window.
- Deterministic prohibited-claim checks cannot replace editorial judgment;
  moderators must follow the explicit FA/EN guidance.
- Missing recipient-locale template stops delivery rather than falling back;
  staff must correct the template and retry operationally.
- Conservative RTL HTML and actual Mailpit rendering/content were verified;
  visual checks in actual Gmail/Outlook clients were not executed.
- The developer/production database was not altered. Reviewed migrations must be
  applied through the normal deployment process before using updated images there.
- No production secrets/subscriber data or live external services were available
  or used. Local synthetic verification cannot attest to those deployments.

## Acceptance checklist

- [x] Page/Article/FAQ authored per locale with server publication completeness.
- [x] Bounded typed text/public media, real admin/public routes and safe preview.
- [x] Published Article/visible FAQPage JSON-LD, canonical/hreflang/sitemap rules.
- [x] Own fully delivered verified purchase, immutable pending review, explicit
  moderation and claim guidance/enforcement; approved-only public rating.
- [x] Zero approved reviews omit aggregateRating; visible/structured values match.
- [x] Recipient locale authoritative; both opposite-admin/order-locale proofs pass.
- [x] FA RTL/EN LTR conservative email HTML and real Mailpit checks pass. Actual
  Gmail/Outlook visual QA remains a stated external validation limitation.
- [x] DB templates/delivery fencing, thin existing queues and honest disabled SMS.
- [x] Explicit consent, real double opt-in, hashed/expiring single-use confirmation,
  secure idempotent unsubscribe and fresh-consent resubscribe.
- [x] API permission/ownership/CSRF/audit/limits, privacy/cache/XSS boundaries.
- [x] FA/EN parity, 16 axe scans without serious/critical violations and 65 viewport checks.
- [x] All required local DB/workspace/OpenAPI/browser/phase/Docker gates pass;
  0 required skips; original security, assertions and CI gates preserved.
- [x] Hero untouched, MinIO excluded, .env untracked, empty staging, old migrations
  and lockfile unchanged; no commits/pushes.
- [x] Complete docs/report; no builder, HTML CMS, UGC media/comments, campaign,
  tracking, marketplace, claim fields, new SMS vendor or later-phase implementation.

## Verification results

Counts use **passed / failed / skipped**; command gates report observed exit codes.

| Command or suite actually executed | Final result |
|---|---|
| `pnpm db:format`, `pnpm db:validate`, `pnpm db:generate` | Each exit 0 |
| `node scripts/verify-phase18-database.mjs` → `pnpm db:migrate`, `pnpm db:migrate:status`, `pnpm db:test` | Exit 0; isolated PostgreSQL, 14 migrations/no pending; 79 tables/35 enums/35 rejection proofs; seed stable twice |
| `pnpm format`, `pnpm format:check` | Each exit 0 |
| `pnpm lint`, `pnpm stylelint`, `pnpm boundaries` | Each exit 0; 10 lint tasks, no warnings/forbidden edges/cycles |
| `pnpm typecheck` | Exit 0; 17 tasks |
| `node scripts/verify-phase18-database.mjs --workspace-tests` → `pnpm test --force` | Exit 0; 17 successful tasks, 0 cached; 548 / 0 / 0 |
| Backend / API / web / worker | 303 / 0 / 0; 80 / 0 / 0; 66 / 0 / 0; 40 / 0 / 0 |
| i18n / contracts / UI / boundary checker | 29 / 0 / 0; 3 / 0 / 0; 5 / 0 / 0; 22 / 0 / 0 |
| `pnpm build`, `pnpm i18n:validate` | Each exit 0; 10 build tasks; valid catalogs |
| `pnpm api:openapi:generate`, `check`, `lint`, `forbidden`, `breaking --base-ref HEAD` | Each exit 0; generated types checked; no warnings or breaking changes against committed Phase 17 |
| `node scripts/verify-phase18-database.mjs --phase-verifiers` → `pnpm phase4:verify` through `pnpm phase18:verify` | All 15 exit 0; isolated DB |
| `pnpm phase18:test:e2e` | 7 / 0 / 0; 16 axe scans/0 serious/critical, 65 viewport checks; 12 expected Mailpit messages |
| `pnpm phase17:test:e2e` | 10 / 0 / 0 |
| `pnpm test:e2e --workers=3` | 101 / 0 / 0 |
| Targeted PDP performance and catalog-footer visual reruns | 1 / 0 / 0 each; included again in passing full storefront suite |
| Targeted legacy checkout regression rerun | 25 / 0 / 0; included again in passing full workspace suite |
| `docker compose config --quiet`, `pnpm docker:verify` | Each exit 0; existing local infrastructure healthy |
| `pnpm api:docker:build`, `pnpm web:docker:build`, `pnpm worker:docker:build` with temporary proxy build args | Each exit 0; original Dockerfiles/frozen lockfile; proxy removed |
| `node --env-file-if-exists=.env scripts/smoke-phase18-images.mjs` | Exit 0; 3 non-root/env-free images; API/module/admin/web/worker readiness; API cleanup exit 0, Next cleanup completed then intended 143/no OOM or forced kill |
| `pnpm worker:smoke:sigterm` | Exit 0; active sitemap job completed, worker exited 0 |
| `node --env-file-if-exists=.env scripts/verify-phase18-minio.mjs` and isolated browser storage scan | Exit 0; zero Hero matches in both configured and isolated buckets |
| `node scripts/verify-phase18-secrets.mjs` | Exit 0; 172 changed/39 client files, zero literal raw action tokens; 0 non-placeholder configured secret values available |
| Hero status/diff, 8 hashes vs HEAD; historical migrations/lockfile diff; .env/staging; `git diff --check` | Empty/unchanged/clean as required |

Required final suites have 0 skipped. Core/utils have no tests. Live vendors,
production rollout/secret/subscriber validation and actual Gmail/Outlook visual
checks were not executed for the reasons stated above. Phase 19 has no code.

Phase 18 is release-ready for commit.
