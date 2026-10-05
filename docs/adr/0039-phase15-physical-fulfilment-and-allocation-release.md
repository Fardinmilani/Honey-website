# ADR-0039: Physical fulfilment consumes allocated stock at dispatch

**Status:** Accepted  
**Date:** 2026-10-04  
**Phase:** 15  
**Extends:** [ADR-0037](0037-reason-aware-inventory-ledger.md)

## Context

Phase 13 turns a reservation into allocated stock without changing physical
`onHand`. A shipment may be prepared before any jar leaves the location. The
existing ledger has `FULFILMENT`, but it has no reason that releases allocated
stock when an order is cancelled before physical dispatch. Reusing
`RESERVATION_RELEASE` would subtract from the wrong balance.

## Decision

The manual fulfilment operation records physical departure when authorized staff
confirms handover and moves a prepared shipment to `IN_TRANSIT`. Creating a
`PENDING` shipment, entering tracking information, payment success, and marking
delivery do not move physical stock. Phase 15 does not add a shipment void state.

For each dispatched quantity `q`, append a `FULFILMENT` ledger entry with
`delta = -q`. In the same transaction, apply `onHand -= q` and
`allocated -= q`; `reserved` is unchanged. The movement references the
shipment and the actual allocated stock location. A repeat or concurrent
dispatch must not append another movement.

Order cancellation is allowed only when no shipment draft or physical movement
exists. It appends a distinct `ALLOCATION_RELEASE`
entry with `delta = -q` for each remaining allocated quantity. It applies
`allocated -= q`; `onHand` and `reserved` are unchanged. The released quantity
becomes available to sell. This is a forward enum and ledger-projection change;
historical entries and migrations are unchanged. Once any quantity has shipped,
cancellation does not restore that quantity. A later return or restock is a
separate workflow.

All inventory rows are locked in `(variant_id ASC, stock_location_id ASC)` order,
and the shipment transition, inventory balances, ledger entries, order status,
and outbox event commit atomically. No provider network call occurs inside the
transaction.

## Consequences

- Physical counts reflect actual departure instead of preparation or payment.
- Reconciliation must understand both `FULFILMENT` and `ALLOCATION_RELEASE`.
- A forward migration must add the new ledger reason while protecting
  nonnegative balances. Phase 15 tests must prove partial,
  duplicate, and concurrent flows.

## Alternatives considered

| Option | Why not |
|---|---|
| Decrement `onHand` when the shipment is drafted | The stock is still physically present. |
| Reuse `RESERVATION_RELEASE` for cancellation | The order holds allocated, not reserved, stock. |
| Restore shipped stock on cancellation or refund | No physical return has occurred. |
