# ADR-0040: Persist shipment quantities against consumed reservations

**Status:** Accepted  
**Date:** 2026-10-04  
**Phase:** 15  
**Extends:** [ADR-0036](0036-split-location-checkout-reservations.md)

## Context

Phase 13 can allocate one order line from several physical locations. A partial
shipment line identifies an order line and quantity but cannot by itself identify
which location's allocated stock should leave. Picking a convenient location at
dispatch would lose the accepted allocation and could decrement the wrong stock.

## Decision

Each draft `ShipmentLine` records its physical source through
`ShipmentLineAllocation` rows. Each row has an ID, `shipmentLineId`,
`stockReservationId`, and positive `quantity`, with a unique pair of
`(shipmentLineId, stockReservationId)`. The referenced Phase 13 reservation must
be consumed and belong to the same order and variant. Its location is the
authoritative source; the shipment allocation does not copy or expose it.

The sum of allocation quantities must equal the shipment line quantity. Across
all active and shipped shipment allocations, quantities for one consumed
reservation cannot exceed its allocated quantity. At staff-confirmed dispatch,
stock moves from exactly the linked locations under the global lock
order in [ADR-0039](0039-phase15-physical-fulfilment-and-allocation-release.md).

The fulfilment application owns shipment and shipment-allocation tables. The
inventory module owns reservation, balance, and ledger writes, reached through
its public service inside the orchestrating transaction. Customer projections
never include reservation or location IDs.

## Consequences

- Partial shipments can be checked against their actual allocated stock.
- A forward migration adds the allocation table and its foreign keys, unique
  pair, positive quantity constraint, and lookup indexes.
- Fulfilment tests must cover one order line split across locations, overlapping
  drafts, and duplicate dispatch.

## Alternatives considered

| Option | Why not |
|---|---|
| Infer a location at dispatch | The choice can diverge from Phase 13 allocation. |
| Add a customer-selected location | Internal stock routing must stay private. |
| Store only a location ID on the shipment line | One line may draw from multiple locations. |
