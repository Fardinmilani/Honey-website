# ADR-0045: Admin refund retries use a durable key

**Status:** Accepted
**Date:** 2026-10-10
**Phase:** 17

## Context

Phase 14's refund cap prevents over-refunds, but a retry of a supported partial
refund can otherwise create another refund. Phase 17 explicitly requires that
double-clicks and retries do not duplicate side effects. No provider, refund,
restock, or payment-state policy changes are needed to satisfy that requirement.

## Decision

The staff refund transport requires the existing `Idempotency-Key` format.
Payments checks STAFF and `order:refund`, then invokes the existing refund
service with that key. The payment's existing transaction lock also protects a
lookup of a prior keyed refund before the cap is reevaluated. The request hash
binds payment, amount selection, normalized reason, and staff actor.

A forward migration adds nullable key/hash fields to Refund and a unique
payment/key constraint. Historical records remain valid. Replaying the same
request returns the stored refund, including an in-progress or failed result,
without repeating the provider call. Reusing a key for different input conflicts.
The existing unkeyed service seam is retained for Phase 14 callers; every browser
admin request uses the protected keyed seam.

## Consequences

Concurrent browser retries have one durable domain effect. An in-progress refund
after a process interruption is not automatically reissued. Provider calls still
occur after the transaction commits. This does not claim distributed exactly-once
delivery or add a new provider reconciliation policy. Zarinpal's full-only
capability, verified outcomes, immutable order money, and no-restock policy stay
authoritative.
