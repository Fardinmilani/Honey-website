# ADR-0012: Checkout-time reservations with TTL and row locks

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

Luxury honey comes in small batches. Selling the last jar twice means an apology,
a refund, and a damaged brand — the exact opposite of a premium experience. But
reserving stock the moment something enters a cart would let idle carts block
inventory for days, and there is real concurrency at the moment a limited batch
is released.

## Decision

**Reserve at checkout, not at add-to-cart.**

```
add to cart        → no reservation; availability is advisory only
begin checkout     → ACTIVE reservation, TTL 15 min
re-enter payment   → TTL extended once, 30 min absolute maximum
order created      → CONSUMED → becomes `allocated`
payment failed     → RELEASED
TTL passes         → EXPIRED (swept every minute, and treated as released on read)
```

**Concurrency control** — acquiring or releasing a reservation happens in a
transaction that takes `SELECT … FOR UPDATE` on the target `inventory_item` rows,
re-reads availability inside the lock, and fails with `INSUFFICIENT_STOCK` rather
than overselling. Rows are always locked in **ascending `variant_id` order**,
which makes deadlock between two concurrent multi-item checkouts structurally
impossible.

**Last line of defence** — `CHECK (on_hand >= 0 AND reserved >= 0 AND allocated
>= 0)`. If application logic is ever wrong, the transaction fails loudly instead
of overselling quietly.

**Availability** = `Σ (on_hand − reserved − allocated)` over sellable locations,
exposed to the storefront as a band (`IN_STOCK` / `LOW_STOCK` / `OUT_OF_STOCK`),
never as an exact count.

## Consequences

**Positive** — a customer who reaches the payment page can actually be sold the
item; browsing never blocks inventory; overselling requires both an application
bug *and* a database constraint failure; deterministic lock ordering removes a
whole class of production incidents; expiry is handled twice (sweeper and lazy
read) so a lagging worker cannot strand stock.

**Negative / accepted** — an item can disappear between cart and checkout, so the
UI must handle that gracefully rather than pretending it cannot happen; row locks
serialize concurrent checkouts for the *same* variant, which is correct but
caps throughput on a hot item; the sweeper is another moving part; reservation
rows accumulate and need pruning.

## Alternatives considered

| Option | Why not |
|---|---|
| Reserve at add-to-cart | Idle carts block scarce inventory for days; abandonment rates make this a permanent shortage |
| No reservation, check at payment | The classic oversell: two customers pay for one jar |
| Optimistic concurrency with retries | Under contention on a limited batch, retry storms and a poor experience at the worst moment |
| Redis-based reservation counters | Fast, but stock truth would live outside the transaction that creates the order — the two can diverge |
| `SERIALIZABLE` isolation | Correct, but pushes retry handling into every caller for no gain over explicit, ordered row locks |
