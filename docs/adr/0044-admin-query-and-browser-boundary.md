# ADR-0044: Admin queries remain module-owned and scripts use a scoped nonce

**Status:** Accepted; browser-policy expansion explicitly approved by the human
**Date:** 2026-10-10
**Phase:** 17

## Context

The admin console needs bounded staff queries absent from customer-facing APIs.
Existing domain write services must remain authoritative. Internal notes also
need an audit row committed atomically without Orders writing Identity's tables.
The existing web CSP blocks direct object-storage uploads and allows inline
scripts. The human approved a concrete admin-only change on 2026-10-10.

## Decision

Queries and safe response projections belong to each existing domain module.
New admin application services check STAFF and an explicit permission before
calling their own repository. No generic admin repository or CRUD engine is
introduced. Query cursors and page sizes are validated and bounded.

Identity's public audit port accepts an optional existing transaction handle.
The Orders application service opens one transaction and calls its note writer
and the Identity-owned audit writer with that handle. A failure rolls both back.
Existing callers keep their current behavior without a transaction parameter.

Only locale-prefixed admin pages receive a per-request script nonce and the
explicit validated storage/media origins required for upload and preview.
No wildcard, unsafe-eval, client-selected origin, new auth mechanism, CSRF
relaxation, CORS widening, or change to the accepted storefront policy is made.

## Consequences

Module ownership and existing domain policy remain testable independently of UI.
Admin pages render dynamically because nonce reuse across cached pages is unsafe.
Deployments must configure browser-reachable storage origins; HTTPS sites require
HTTPS storage. Internal note text is not duplicated in audit metadata.
