# Sourcing, procurement, and inventory (Phase 11)

Single-brand, single-seller operations. Customers buy from our brand. Suppliers
are internal purchasing counterparties only. Exact stock, costs, locations, and
supplier identity never leave admin APIs.

## Bounded contexts

| Module | Owns | Public surface |
|---|---|---|
| `sourcing` | Apiaries, harvest batches, batch allocations | none (admin `/v1/admin/sourcing/*`) |
| `procurement` | Suppliers, purchase orders, goods receipts, landed cost | none (admin `/v1/admin/procurement/*`) |
| `inventory` | Stock locations, `InventoryItem`, append-only ledger, availability bands, reconciliation, low-stock evaluation | availability band only, via catalog overlay |

Business logic lives in `packages/backend`. `apps/api` maps HTTP. `apps/web`
renders the public band. Phase 16 owns queue consumers. Phase 17 owns admin UI.
Phase 13 owns reservations.

## Sourcing

Harvest batches are provenance records.

- `OWN_PRODUCTION`: `apiaryId` required, `supplierId` null.
- `SELECTED_SUPPLIER`: `supplierId` required, `apiaryId` optional.

PostgreSQL CHECK enforces the shape. Own-production never uses a fake "our
company" supplier.

Batch allocation links a harvest batch to a `ProductVariant` for traceability.
It is not a cart reservation.

Apiary copy uses sidecar translations (`fa`, `en`).

## Own-production inbound

Packed own-production units enter inventory through **production intake**
([ADR-0029](adr/0029-own-production-inventory-inbound.md)): ledger `RECEIPT` +
`refType = batch_allocation`, same transaction as `InventoryItem`, permission
`inventory:adjust`. Goods receipts remain procurement-only.

## Procurement lifecycle

Purchase-order client transitions:

```
DRAFT → SUBMITTED → CONFIRMED → (derived) PARTIALLY_RECEIVED → (derived) RECEIVED
     ↘ CANCELLED     ↘ CANCELLED     ↘ CANCELLED (only with zero receipts)
```

Clients cannot assign `PARTIALLY_RECEIVED` or `RECEIVED`. Those statuses are
derived from accepted + rejected quantity versus ordered quantity. Rejected
units consume remaining receivable quantity but do not increase `onHand`.

Receiving is valid only from `CONFIRMED` or `PARTIALLY_RECEIVED`. Destination
stock location is required at confirm when any line has a `variantId`
([ADR-0031](adr/0031-incoming-stock-destination.md)). The goods-receipt location
must equal that destination. `incoming` on the destination `InventoryItem` is
the remaining confirmed quantity.

## Goods receipt transaction

One PostgreSQL transaction:

1. Claim `Idempotency-Key` (insert placeholder or lock existing row).
2. Lock purchase order and lines (`FOR UPDATE`, lines by `id` ascending).
3. Validate quantities, remaining receivable, harvest-batch supplier match.
4. Insert `GoodsReceipt` + lines.
5. Update `InventoryItem` and append ledger `RECEIPT` for accepted units.
6. Decrement `incoming` by accepted + rejected.
7. Derive PO status.
8. Audit + outbox `procurement.goods_received`.
9. Store idempotent response. COMMIT.

Retry with the same key and body replays. Same key, different body →
`IDEMPOTENCY_KEY_REUSE`. Concurrent last-quantity receipts: one succeeds, the
other `OVER_RECEIPT`.

## Landed cost

Internal only. Integer minor units.

`landed = merchandise line totals + freight + duty + other`

Extras allocate by `lineTotalMinor`; remainder goes to the last line sorted by
`id` ascending ([ADR-0030](adr/0030-landed-cost-allocation.md)). This is not
storefront price.

## Inventory

`InventoryItem` is current state. `StockLedgerEntry` is append-only audit truth
(UPDATE/DELETE rejected by trigger). Corrections append a new row.

Phase 11 ledger reasons in use: `RECEIPT`, `ADJUSTMENT`, `WRITE_OFF`,
`CORRECTION`. Reservation, fulfilment, return, and transfer workflows are not
implemented.

Stock-critical writes lock inventory rows `FOR UPDATE` ordered by
`(variant_id, stock_location_id)`. Negative `onHand` / available units are
rejected (`INSUFFICIENT_STOCK`) and recorded as `inventory.oversell_prevented`
in the outbox when applicable. The CHECK constraint is the last line of defence.

Locations: `WAREHOUSE`, `STUDIO`, `EXTERNAL`. `isSellable` controls
availability. No multi-warehouse routing.

### Available to sell

`SUM` over sellable locations of `onHand - reserved - allocated`.

Incoming is not sellable. Reservations are still zero until Phase 13; the
formula already subtracts them.

### Public availability bands

[ADR-0032](adr/0032-availability-band-threshold.md):

- `availableToSell <= 0` → `OUT_OF_STOCK`
- `reorderThreshold = MAX(sellable reorderPoint)`; if `threshold > 0` and
  `availableToSell <= threshold` → `LOW_STOCK`
- otherwise `IN_STOCK`

Public catalog JSON includes only `availabilityBand`. Redis catalog payloads do
not store the band; it is overlaid from PostgreSQL on every public read.
Storefront fetch cache TTL is 60 seconds (`apps/web` catalog client). That is
the documented staleness bound until Phase 16 consumes `inventory.changed`.

Product JSON-LD still has **no Offer**. Pricing is Phase 12.

### Low stock

Evaluated in the same transaction as stock writes. Crossing into `LOW_STOCK` or
`OUT_OF_STOCK` emits `stock.low` once until the variant returns to `IN_STOCK`
(`lowStockAlertActive` latch). No email, SMS, or worker consumer in Phase 11.

### Reconciliation

Application service recomputes `onHand` from the ledger and `incoming` from
confirmed purchase-order remaining quantity (procurement port). Drift is
reported deterministically. Repair writes `InventoryItem` to match ledger /
incoming projection; ledger history is never rewritten. Phase 16 will schedule
the call.

## Authorization

Reuse existing permissions:

- sourcing: `inventory:read` / `inventory:adjust`
- procurement: `procurement:read` / `procurement:write`
- inventory: `inventory:read` / `inventory:adjust`

Staff session, CSRF on unsafe cookie writes, `Cache-Control: private, no-store`
on `/v1/admin/*`. No role-name checks.

## Phase 16 / 17 / 13 deferrals

- Producers and outbox events exist; `apps/worker` has no inventory processor.
- No `/admin/suppliers`, procurement, or inventory screens.
- `StockReservation` table exists from Phase 4; no reservation application
  service.

## Local notes

Seed is idempotent. Wildflower is `IN_STOCK`, thyme `LOW_STOCK`, acacia has no
inventory item (`OUT_OF_STOCK`). Supplier legal name is synthetic and must never
render on the storefront.
