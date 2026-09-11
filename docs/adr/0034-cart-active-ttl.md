# ADR-0034: Active carts expire lazily with a configured TTL

**Status:** Accepted
**Date:** 2026-09-10
**Phase:** 12

## Context

Cart ownership must not revive stale anonymous state indefinitely. The data
retention policy retains abandoned carts for 90 days, but retention is not an
active-cart lifetime. Phase 12 deliberately has no worker or scheduled expiry
sweeper, so expiry needs a safe synchronous behavior that works for anonymous
and authenticated carts.

## Decision

`CART_ACTIVE_TTL_SECONDS` controls the active-cart lifetime. The repository
default of 2,592,000 seconds (30 days) is a local/development and deterministic
test default, not a production business-policy decision.

- A cart has exactly one server-derived owner: a user or an opaque anonymous
  browser identity, never both.
- PostgreSQL permits at most one `ACTIVE` cart for each owner through partial
  unique indexes.
- A cart found past `expiresAt` is transitioned to `ABANDONED` inside the
  relevant transaction and is not reused.
- A successful cart mutation renews the expiry. Read-only rendering does not
  extend it.
- Anonymous-to-user merge ignores an expired anonymous cart and is idempotent;
  it cannot recreate or revive stale anonymous state.
- Expired and abandoned records are retained according to the existing data
  retention policy. No Phase 12 worker, reservation, checkout conversion, or
  deletion job is introduced.

The anonymous browser cookie holds only a high-entropy opaque identifier. It
does not contain a cart ID, prices, product selections, or customer identity.

## Consequences

### Positive

- Expiry is enforceable without background processing.
- The active-cart state remains bounded while preservation of abandoned records
  stays independent from the active lifetime.
- A deployment can change the active TTL through configuration rather than a
  migration or money-engine rewrite.

### Negative / accepted costs

- Expiration is observed lazily on cart access, not at the exact clock instant.
- Production must explicitly choose its active-cart TTL before launch.

## Alternatives considered

| Option | Why not |
|---|---|
| Treat 90-day retention as the active TTL | Retention and usable customer state are separate policies |
| Never expire carts | Revives stale anonymous state and makes ownership cleanup unbounded |
| Add a queue sweeper now | Background workers are outside Phase 12 |
| Store a serialized cart in the browser | Makes customer-controlled state authoritative and leaks product/price data |
