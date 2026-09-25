# ADR-0036: Split checkout reservations across sellable locations

**Status:** Accepted  
**Date:** 2026-09-12  
**Phase:** 13  
**Refines:** [ADR-0012](0012-stock-reservation-strategy.md)

## Context

Availability is the sum of `onHand - reserved - allocated` across sellable
locations, while a `StockReservation` belongs to one physical location. A
single-location reservation can therefore reject a cart whose requested quantity
is available only when two sellable locations are combined. The original active
reservation uniqueness rule, `(variant_id, checkout_session_id)`, also prevents
representing more than one location for the same variant and checkout.

Selecting a location from request order would be non-deterministic and locking
only the chosen location could let concurrent checkout transactions deadlock or
oversell. Customer-facing warehouse selection and routing are not in scope.

## Decision

Checkout reservations may split one cart-line quantity across multiple sellable
`InventoryItem` rows.

1. For every cart variant, select all sellable candidate inventory rows.
2. Lock every candidate row in the single global order
   `(variant_id ASC, stock_location_id ASC)`, independent of request order and
   independent of allocation preference.
3. After all locks are held and availability is re-read, allocate from the
   sellable default location first, then remaining locations by
   `stock_location_id` ascending.
4. Write one `ACTIVE` `StockReservation` per
   `(variant_id, stock_location_id, checkout_session_id)` and increase `reserved`
   in the same transaction.
5. If all requested quantities cannot be placed, roll back every reservation and
   inventory change and return `INSUFFICIENT_STOCK`.

The partial unique index changes to:

```sql
CREATE UNIQUE INDEX reservation_active_unique
  ON stock_reservation (variant_id, stock_location_id, checkout_session_id)
  WHERE status = 'ACTIVE';
```

ADR-0012 remains the source of the checkout-time reservation and TTL principles.
This ADR supersedes its single-location lock/allocation detail for Phase 13; the
current Phase 13 boundary also moves its scheduled sweeper delivery to Phase 16,
while retaining lazy expiry and the idempotent expiry/release application service.

The preference is an internal stock-allocation rule, not warehouse routing:
clients cannot choose a location and customer responses never reveal a location
or an exact availability count. Consumption, release, and expiry operate on the
complete reservation set transactionally and remain idempotent.

## Consequences

**Positive** — checkout can safely consume the availability model already used by
the storefront; a line can be held without inventing a hidden single-location
assumption; globally ordered locks keep concurrent multi-line checkout safe; and
the partial index matches the actual cardinality of the reservation model.

**Negative / accepted** — a checkout can create several reservation rows for one
cart line; repositories and tests must treat the set as one all-or-nothing hold;
and a forward migration is required to replace the existing active-reservation
index. The extra rows are preferable to rejecting purchasable stock or exposing
warehouse choices to customers.

## Alternatives considered

| Option | Why not |
|---|---|
| Reserve only the default location | Hides an allocation policy and rejects stock that the documented availability calculation says is sellable. |
| Let the browser choose a location | Leaks internal operations and makes the client authoritative for allocation. |
| Lock only the rows selected by request order | Creates deadlock and stale-availability risk under concurrent checkout. |
| Build multi-warehouse shipping/routing now | Belongs to later shipping/fulfilment work and is not required for deterministic stock allocation. |
