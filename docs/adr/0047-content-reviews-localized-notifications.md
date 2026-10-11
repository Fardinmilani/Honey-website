# ADR 0047 — Bounded editorial content, verified reviews and localized delivery

Status: accepted for Phase 18, with human product-policy approvals on 2026-10-11.

## Context

The store has existing Page/Article/FAQ skeletons, immutable order snapshots,
public MediaAssets and durable outbox/queue infrastructure. Review and notification
tables were missing. Business eligibility and newsletter resubscribe were undefined.

## Decision

Reuse the six content tables with flat bounded typed blocks and complete FA/EN
publication. Use existing public media only. Keep status authoritative in Postgres,
even on Redis resolution hits; durable events invalidate Redis/web/sitemaps through
Phase 16 application seams. No raw HTML or visual builder is introduced.

Reviews are one per authenticated customer/product, backed by their own paid,
fully delivered order with no refund/cancellation. Guests cannot submit. Original
text is immutable, submissions pending, and explicit permission-based moderation
approves or rejects. Public identity is only the localized verified-buyer label.
An approved review survives a later refund. Aggregate and public rows use only
APPROVED in one repeatable-read snapshot. Zero-review JSON-LD omits aggregateRating.

Templates are locale/channel database content with flat variable allowlists and
escaped conservative email markup. Shipment locale is immutable localeAtPurchase.
NotificationDelivery is the shared worker delivery authority; sent legacy shipment
records are backfilled. A fenced claim protects concurrent replay, while SMTP's
acceptance-before-persistence crash window remains explicitly at-least-once.
Retries use the current template; no delivery body or raw recipient snapshot is
added. SMS has no selected provider and stays disabled.

Newsletter consent uses a durable ID-only intent before a worker mints a 32-byte
random token. Only hashes/expiries are stored. Explicit POST confirms/unsubscribes;
GET is presentation only. Resubscribe requires fresh consent and confirmation and
invalidates all old links and queued consent-cycle identities. No campaigns or
broadcasts are authorized.

## Consequences

The migration is forward-only and adds constraints/indexes for real access paths.
Orders/Fulfilment/Catalog/Media remain owners accessed via small application seams.
UI messages stay in i18n; editorial/template data stays in the DB. Staff still
must apply editorial judgment beyond the deterministic prohibited-claim guard.
Mail may duplicate in the documented SMTP crash window. Phase 19 and Phase 20
remain separate work, with no pre-wiring from this decision.
