# ADR-0031: Incoming stock is bound to an explicit purchase-order destination

**Status:** Accepted
**Date:** 2026-08-10
**Phase:** 11

## Context

`InventoryItem.incoming` is documented as units on confirmed purchase orders.
Inventory is per `(variant, stock location)`. Purchase orders had no destination
location. Silently crediting the default warehouse would hide a routing
assumption that Phase 13 must not inherit.

## Decision

`PurchaseOrder.destinationStockLocationId` is optional in `DRAFT`/`SUBMITTED`
and **required to confirm** whenever any line has a `variantId`.

Confirming increments `incoming` on `(variantId, destinationStockLocationId)`
by `quantityOrdered` for each variant-bearing line.

A goods receipt's `stockLocationId` **must equal** the purchase order's
destination. Phase 11 does not route across warehouses.

Receiving decrements `incoming` by `quantityAccepted + quantityRejected` for
that line (rejected units leave incoming without becoming on-hand).

Cancelling a `CONFIRMED` order is allowed only when it has no receipts; incoming
is reversed.

Incoming is never sellable and is never public.

## Consequences

### Positive

- Destination is explicit data, not "first warehouse".
- Goods receipt and incoming accounting share one location.

### Negative / accepted costs

- A PO that covers only non-variant bulk description lines can confirm without
  a destination because it cannot affect `InventoryItem`.

## Alternatives considered

| Option | Why not |
|---|---|
| Compute incoming only at read time | `InventoryItem.incoming` would drift from the documented current-state column |
| Always use the default sellable location | Hidden routing; forbidden by the Phase 11 brief |
| Allow GR location to differ from PO destination | Incoming and on-hand would diverge across locations with no transfer workflow |
