# ADR-0037: Reason-aware inventory ledger projection

**Status:** Accepted  
**Date:** 2026-09-12  
**Phase:** 13

## Context

`StockReservation` changes `InventoryItem.reserved` and order consumption moves
that quantity to `allocated`; neither action changes physical `onHand`. The
append-only ledger nevertheless needs to audit those state transitions and
reconciliation must detect drift. Treating every non-zero `StockLedgerEntry.delta`
as an `onHand` movement would corrupt the physical count, while a zero-delta
reservation entry is rejected by the database invariant and would not be an
auditable movement.

## Decision

`StockLedgerEntry.delta` stays non-zero and its target balance is determined by
its immutable `reason`. Phase 13 adds these required mappings:

| Reason | Ledger delta | Inventory projection |
|---|---:|---|
| `RESERVATION` | `+q` | `reserved += q`; `onHand` and `allocated` do not change |
| `RESERVATION_RELEASE` | `-q` | `reserved += delta`; `onHand` and `allocated` do not change |
| `ALLOCATION` | `+q` | `reserved -= q`; `allocated += q`; `onHand` does not change |

Physical movement reasons retain their physical `onHand` projection. The
reason-aware reconciliation projection computes `onHand`, `reserved`, and
`allocated` from the complete ledger by their reason mappings, then detects or
repairs drift in `InventoryItem`. It does not reinterpret a reservation event as
a receipt or write-off.

The reservation row status, inventory counters, matching ledger entry, and any
outbox state are written in one transaction. Release first locks the reservation
set and recognizes terminal `RELEASED`, `EXPIRED`, or `CONSUMED` states, so a
retry cannot decrement `reserved` or append a second release entry.

## Consequences

**Positive** — reservation and allocation history is auditable without changing
physical stock; the existing non-zero ledger invariant remains meaningful;
reconciliation can repair each balance independently; and a double release is
detectable rather than silently producing negative `reserved` stock.

**Negative / accepted** — all ledger consumers must use the reason-aware
projection rather than blindly summing `delta`; the Phase 13 forward migration
and tests must enforce the mappings; and later fulfilment/cancellation work must
extend the same explicit projection instead of bypassing it.

## Alternatives considered

| Option | Why not |
|---|---|
| Use a zero-delta reservation entry | Violates the existing database constraint and fails to express an audited state change. |
| Change `onHand` on reservation/release/allocation | Makes physical inventory drift even though jars have not moved. |
| Keep reservation history outside the ledger | Leaves reconciliation unable to distinguish counter drift from a valid hold. |
| Add a second independent reservation ledger | Creates competing inventory truths and complicates transactional correctness. |
