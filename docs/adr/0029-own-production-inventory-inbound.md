# ADR-0029: Own-production inventory inbound is not a fake purchase order

**Status:** Accepted
**Date:** 2026-08-10
**Phase:** 11

## Context

GoodsReceipt is the only inbound path **from procurement**. The Phase 4 schema
requires every GoodsReceipt to reference a PurchaseOrder, and every PurchaseOrder
to reference a Supplier. Own-production HarvestBatch rows must not use a
supplier. The documents do not specify how packed own-production units first
become `InventoryItem.onHand`.

## Decision

Selected-supplier stock enters only through GoodsReceipt against a confirmed
purchase order.

Own-production stock enters through a dedicated **production intake** use case
in the inventory module. It:

- requires a HarvestBatch with `sourcingType = OWN_PRODUCTION`;
- writes `StockLedgerEntry` with `reason = RECEIPT` and `refType = batch_allocation`;
- updates `InventoryItem` in the same PostgreSQL transaction;
- never creates a supplier, purchase order, or goods receipt.

BatchAllocation remains traceability. Intake is a separate privileged write
(`inventory:adjust`) that staff invoke after packing.

## Consequences

### Positive

- No fake "our company" supplier.
- Procurement invariants stay procurement-only.
- Ledger still records every inbound unit.

### Negative / accepted costs

- Two inbound application paths exist. The domain sentence "goods receipt is
  the only inbound path" is interpreted as **from procurement**.

## Alternatives considered

| Option | Why not |
|---|---|
| Fake internal supplier + purchase order | Violates the single-brand sourcing shape and the no-workaround rule |
| Treat BatchAllocation create as implicit stock | Mixes traceability with inventory; allocation is not a warehouse receipt |
| Leave own-production stock unexplained | Seed already has own-production on-hand; operations would have no legal write path |
