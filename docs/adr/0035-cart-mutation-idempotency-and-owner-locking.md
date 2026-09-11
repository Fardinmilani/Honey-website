# ADR-0035: Cart mutations serialize by owner and use durable add idempotency

**Status:** Accepted
**Date:** 2026-09-11
**Phase:** 12

## Context

An active cart has a partial unique owner constraint, but a concurrent first
mutation can observe no active row in two transactions before either creates
one. `POST /v1/cart/lines` is deliberately increment semantics, so a client
retry after an ambiguous network outcome could otherwise add the same quantity
twice. Neither failure mode can be safely solved with client state or a stale
cart response.

## Decision

Cart lookup/create and anonymous-to-user merge acquire transaction-scoped,
owner-derived PostgreSQL advisory locks in a stable order before reading or
mutating active carts. The database partial unique indexes remain the invariant
backstop; the locks serialize the absence case and merge handoff.

`POST /v1/cart/lines` requires a bounded opaque `Idempotency-Key`. The server
scopes a durable key record to the server-derived cart owner and stores a hash
of the normalized variant, quantity, and currency selection for 24 hours.

- A matching completed retry does not increment the line again and emits
  `Idempotency-Replayed: true`.
- Reusing a key for a different request is rejected.
- A matching retry returns a freshly repriced cart projection rather than a
  stored money response, because every cart read remains authoritative at the
  time of rendering.

## Consequences

### Positive

- Parallel first adds and anonymous-to-user handoffs converge on one active
  cart without duplicate lines or lost quantity.
- Network retries cannot silently double an incrementing add.
- Replay never revives a stale price, discount, availability, or tax result.

### Negative / accepted costs

- Cart mutations for the same owner serialize briefly, including first-cart
  creation.
- Durable idempotency records require a bounded retention period and cleanup
  policy; expiry is 24 hours in Phase 12.
- A retry that reaches the server while the original request is still in flight
  receives an explicit conflict and must retry after that request completes.

## Alternatives considered

| Option | Why not |
|---|---|
| Rely only on partial unique indexes | Handles the duplicate row but not a clean first-write flow or retry semantics |
| Make add set an absolute quantity | Changes the required increment behavior and does not protect normal retries |
| Keep retry keys only in browser storage | Loses protection across reloads and cannot be trusted as the authority |
| Replay a serialized cart response | Violates repricing-on-read and can return stale money or availability |
