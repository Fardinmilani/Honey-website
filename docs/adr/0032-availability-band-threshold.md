# ADR-0032: LOW_STOCK uses the maximum sellable reorder point

**Status:** Accepted
**Date:** 2026-08-10
**Phase:** 11

## Context

The storefront may show only `IN_STOCK`, `LOW_STOCK`, or `OUT_OF_STOCK`. No
binding document defined the LOW_STOCK numeric threshold. `InventoryItem`
already has `reorderPoint` and `safetyStock` planning fields.

## Decision

```
availableToSell(variant) = Σ sellable locations of (onHand − reserved − allocated)
threshold(variant)       = MAX sellable locations of reorderPoint
```

`availableToSell` is clamped to `>= 0` before banding.

- `availableToSell <= 0` → `OUT_OF_STOCK`
- `threshold > 0` and `availableToSell <= threshold` → `LOW_STOCK`
- otherwise → `IN_STOCK`

Non-sellable locations are excluded from both sums. Incoming is excluded.
`safetyStock` is a planning field for staff, not the public band.

When every sellable `reorderPoint` is 0, the public band is never `LOW_STOCK`;
staff opt in by setting a reorder point.

Low-stock outbox event `stock.low` fires on **threshold crossing** into
`LOW_STOCK` or `OUT_OF_STOCK`, not on every subsequent read or write while the
variant remains at or below the threshold. Recovery above the threshold clears
the persisted alert latch (`InventoryItem.lowStockAlertActive` on the affected
sellable rows) so a later crossing can alert again.

## Consequences

### Positive

- No magic constant.
- Deterministic and testable at zero, one, boundary, and above-threshold.

### Negative / accepted costs

- A variant with reorder point 0 never shows LOW_STOCK even at 1 unit.

## Alternatives considered

| Option | Why not |
|---|---|
| Hard-coded band of 5 units | Magic constant; ignores planning data |
| Use safetyStock | Safety stock is a buffer target, not the public "running low" signal |
| Expose exact counts publicly | Competitive leak; forbidden |
