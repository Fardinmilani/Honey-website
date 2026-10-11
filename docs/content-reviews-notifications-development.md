# Phase 18 — Content, Reviews & Notifications

Completed 2026-10-11. The [completion report](phase18-completion-report.md) records
the exact file inventory, required gates, test counts and limitations. Changes
remain unstaged for human review; Phase 19 is current but has not been started.

## Repository audit and authorized scope

Entry was clean, staging empty, `.env` untracked and all eight Hero assets unchanged.
Phase 17 was committed by the human in `e25d3f1`. The prompt's schema assumption
was inaccurate: six Page/Article/FAQ models existed, but the four review,
notification and newsletter models did not. Migration
`20261011000000_phase18_content_reviews_notifications` fixes this forward.
Historical migrations are untouched. No dependency or lockfile change is needed.

The human approved the bounded newsletter/template scope extension, exact review
policy and fresh-consent resubscribe policy on 2026-10-11. Durable decisions are
recorded in [ADR 0047](adr/0047-content-reviews-localized-notifications.md).

## Content and publication

Content owns the six existing tables. Page/Article translations retain their
locale-scoped slugs and SEO fields. FAQ uses its existing question/answer model;
it has no invented per-item SEO or slug fields. The flat V1 block format permits
heading (levels 2/3), paragraph, quotation and public MediaAsset image with alt
text. Lists contain 1–60 blocks with bounded NFC text. Unknown properties/types,
arbitrary HTML, scripts, event handlers, unsafe Unicode and private media fail
validation. FAQ is a single plain-text answer paragraph. There is no raw HTML
source, page builder, separate upload system or product-reference feature.

STAFF permissions are `content:read`, `content:write`, `content:publish`.
Publication locks the parent and requires complete FA and EN translations.
Drafts never project publicly; ARCHIVED is terminal. Staff changes persist a
bounded audit and outbox event in the same database transaction. The deterministic
claim guard rejects obvious prohibited wording, but cannot replace staff editorial
judgment. It is not an AI moderation classifier.

Admin paths are `/[locale]/admin/content?kind=page|article|faq` and
`/[locale]/admin/content/[kind]/[id]`. The editor has labeled translation fields,
keyboard block reordering, a paginated public-image picker, safe preview,
unsaved-change protection and real publish/archive actions.

| Surface | English | Persian |
| --- | --- | --- |
| Page | `/en/pages/[slug]` | `/fa/safahat/[slug]` |
| Article list/detail | `/en/articles`, `/en/articles/[slug]` | `/fa/maghalat`, `/fa/maghalat/[slug]` |
| FAQ | `/en/faq` | `/fa/porseshha` |
| Confirmation | `/en/newsletter/confirm` | `/fa/newsletter/confirm` |
| Unsubscribe | `/en/newsletter/unsubscribe` | `/fa/newsletter/unsubscribe` |

Canonical and reciprocal hreflang come only from published translation rows.
Article JSON-LD describes the displayed article. FAQPage contains displayed
published questions and answers. Pages/articles have sitemap partitions; token
and admin paths remain excluded and noindex.

Public content caches only slug-to-ID resolutions in a namespaced Redis cache;
every hit rechecks Postgres publication, translation and current public media.
Redis loss fails open to Postgres and cannot undo a committed write. Best-effort
immediate eviction is supplemented by durable content events through the existing
Phase 16 cache queue. Worker application seams evict Redis and invalidate fixed
web tags and sitemap paths. API and worker share `CATALOG_CACHE_NAMESPACE`.
Public web reads use a stable nonpersonal correlation header so their tagged data
cache can actually reuse requests. Draft/admin reads are private/no-store.

## Verified purchase and moderation

An authenticated CUSTOMER with `review:submit` must own the order and product line.
Orders owns eligibility: paid, FULFILLED/COMPLETED, no cancellation and no refund.
Fulfilment owns proof that delivered shipment quantities cover every order line.
Reviews uses these application seams inside the shared order lock. A guest is
ineligible. The client cannot supply author, verification or moderation state.
One immutable review per customer/product is enforced by a database unique key.
Rating is integer 1–5; title/body are bounded text, with no review media or replies.

New submissions are PENDING. STAFF with `review:moderate` can approve or reject;
there is no editable status dropdown or rewriting of customer text. The queue at
`/[locale]/admin/reviews` shows safe product context, rating, locale and verified
purchase, and explicitly instructs staff to reject prohibited claims. Known claims
cannot be approved server-side. Competing moderation locks produce one winner,
one atomic audit and one outbox event. Customer text also has a DB immutability
trigger. An approved review remains after a later refund, as the human authorized.

Public projection contains only approved rating/title/body/locale and a localized
verified-buyer label; no names, email fragments, user/order IDs or moderators.
Pagination and approved count/average share one repeatable-read snapshot.
Zero approved reviews return a null API aggregate; Product JSON-LD omits
aggregateRating entirely. Visible product rating and JSON-LD use the same server
projection. Approval/rejection invalidates the product tag through the existing
outbox/cache queue. Private eligibility loads after hydration through no-store
customer endpoints and is absent from public cached HTML. XSS-shaped review text
is rendered literally through React, without HTML interpretation.

## Templates and email migration audit

NotificationTemplate identity is `(code, locale, channel)`, uniquely enforced.
Bodies are database content, not UI messages. Supported codes are
`shipment-shipped`, `shipment-delivered`, `newsletter-confirm`, `newsletter-welcome`.
Shipment templates allow only `orderNumber`, `trackingNumber`, `trackingUrl`;
newsletter templates allow only `actionUrl`. Unknown, prototype and path
placeholders fail. Headers reject CR/LF; HTML escapes literal and variable text.
Links are constrained to fixed public origins and newsletter paths; tracking
links require HTTPS. Missing locale/template fails closed without fallback.

| Existing flow | Previous owner/path | Phase 18 path and delivery identity | Locale |
| --- | --- | --- | --- |
| Shipment dispatched | FulfilmentService → SmtpFulfilmentNotificationAdapter | Existing `email.fulfilment-notify.v1` → Notifications application renderer; `fulfilment:<shipmentId>:SHIPPED` | Immutable Order.localeAtPurchase |
| Shipment delivered | Same fulfilment port | Same existing job; `fulfilment:<shipmentId>:DELIVERED` | Immutable Order.localeAtPurchase |
| Identity verification | Phase 6 IdentityService email port | Remains identity-specific and direct; outside the required Phase 13–17 shipment migration | Existing identity adapter behavior |
| Password reset | Phase 6 IdentityService email port | Remains identity-specific; purpose-specific identity token service unchanged | Existing identity adapter behavior |

Order-created/payment events have no active email consumer; Phase 18 does not
invent one. Shipment rendering has one logical path, with the compatibility
fulfilment adapter delegating to the same Notifications renderer. Successful
historical fulfilment deliveries are backfilled to NotificationDelivery so
old jobs cannot resend them after migration. Direct legacy callers retain their
existing fence; the worker uses NotificationDelivery as its delivery authority.

Order-related locale is always Order.localeAtPurchase, never admin, browser,
worker or later user preference. FA HTML explicitly uses `lang="fa" dir="rtl"`;
EN uses `lang="en" dir="ltr"`, with isolated operational identifiers and
conservative table markup. No storefront stylesheet or script is embedded.

NotificationDelivery stores a unique dedupe identity, recipient SHA-256 hash,
locale, safe state, optional provider reference, sentAt and fenced lease.
Bodies, raw recipient and provider responses are not persisted in delivery rows.
The lease exceeds SMTP timeout; concurrent/replayed sent jobs do not resend.
SMTP acceptance followed by a crash before sentAt can still duplicate mail;
there is no exactly-once transport guarantee. A retry renders the current DB
template; Phase 18 introduces no consequential historical snapshot requirement.
SENT deliveries are never rerendered or resent. Changes are audited without bodies.

Admin `/[locale]/admin/notifications` lists code/channel/locale, completeness,
allowed variables, subject/body and synthetic preview. Save requires STAFF
`content:write`; list/preview requires STAFF `content:read`. There is no arbitrary
recipient send action. SMS templates are available, but the adapter is disabled,
no provider is selected, and SMS cannot falsely become SENT.

## Double opt-in and token lifecycle

Explicit consent and validated email/locale create a PENDING subscription, one
ID-only NotificationDelivery and an atomic outbox intent. Email identity is
case-insensitive citext. Responses are generic and rate-limited. Repeating a
pending request within 60 seconds does not send another confirmation; confirmed
subscriptions remain unchanged.

The worker mints 32 cryptographically random bytes in memory, persists only the
SHA-256 token hash and a 24-hour expiry, and renders the confirmation in the
subscription locale. Queue payloads contain only the delivery ID. Raw tokens
never appear in storage, audit, job data or application logs. Newsletter tokens
cannot verify identity email or reset passwords.

GET opens a localized noindex/no-store page without changing state. Explicit
POST consumes an unexpired token once, transitions PENDING→CONFIRMED and queues
one localized welcome message. Concurrent/repeated confirmation is safe. Welcome
contains a tokenized unsubscribe link, with one-year expiry. Explicit POST
transitions CONFIRMED→UNSUBSCRIBED idempotently without login or email guessing.
The token page uses no-referrer and clears its query after the action.

Human-approved resubscribe requires new explicit consent, creates a new request
identity and confirmation intent, resets to PENDING and atomically invalidates
all previous confirmation/unsubscribe hashes. Old queued intents are checked
against the current request and cannot revive an old consent cycle. No marketing
is sent before confirmation or after unsubscribe. Transactional shipment messages
are independent of marketing subscription status. There is no campaign, broadcast,
segmentation, tracking pixel, subscriber export or forced-confirmation interface.

## Security and test boundary

All admin operations require explicit API STAFF permissions, CSRF writes and
per-account mutation limits. Customer review writes require session/permission,
CSRF, ownership and account limits. Public newsletter BFF actions forward no
ambient authentication cookies and accept exact bounded bodies. Private state
never enters public content/review contracts or public cache.

Backend/API/worker/web targeted tests cover validation, publication, ownership,
real PostgreSQL concurrency, immutable review text, approved-only aggregates,
template injection, delivery replay, locale authority and token lifecycle.
The Phase 18 browser runner reuses the disposable Phase 17 PostgreSQL fixture,
with isolated Redis, MinIO, Mailpit and a real worker. Synthetic credentials
travel by private IPC/environment, with traces/video/screenshots disabled for
token flows. Hero object-storage exclusion is scanned before cleanup. No tests
migrate or repair the user's `honey_local` database.

Run `pnpm phase18:test:e2e`, `pnpm phase18:verify` and the existing full gates.
Exact final results belong in docs/progress.md and the phase report. Phase 19
observability/performance and Phase 20 launch infrastructure are absent.
