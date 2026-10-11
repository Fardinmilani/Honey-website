# ADR-0046: Preserve the existing refund HTTP contract

**Status:** Accepted
**Date:** 2026-10-11
**Phase:** 17
**Refines:** ADR-0045

## Context

The required idempotency header described in ADR-0045 makes retries safe, but
adding it to the existing Phase 14 endpoint breaks its published request contract.
The OpenAPI comparison against the committed Phase 16 contract found this change.

## Decision

Keep `POST /v1/admin/payments/:paymentId/refunds` with its existing request shape,
explicit `order:refund` permission, STAFF check, CSRF and recent TOTP requirement.
Its existing domain behavior and refund cap remain intact.

Add `POST /v1/admin/payments/:paymentId/refund-requests` for the Phase 17 console.
This operation requires `Idempotency-Key` and uses the durable keyed service in
ADR-0045. The explicit browser BFF refund route targets only this new operation;
there is no fallback to the legacy endpoint. Both transports use the same payment
domain, provider capabilities and server-authoritative amount policy.

## Consequences

Existing API callers retain their contract. Every new console refund has a durable
retry key. The legacy operation retains its previous retry limitations; API clients
needing safe partial-refund retries should use the new operation. No validation,
permission, step-up, provider or financial assertion is relaxed.
