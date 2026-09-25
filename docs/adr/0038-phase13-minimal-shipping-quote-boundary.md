# ADR-0038: Minimal Phase 13 checkout shipping quote boundary

**Status:** Accepted  
**Date:** 2026-09-12  
**Phase:** 13  
**Refines:** [ADR-0014](0014-shipping-provider-abstraction.md)

## Context

An immutable order needs an authoritative shipping amount before confirmation,
but the full shipping provider, zone, method, rate, carrier, and fulfilment work
belongs to Phase 15. Using the zero-value development seed as a shipping total
would fabricate money; accepting a client total would violate the server-
authority boundary. Deferring every quote would make a truthful Phase 13 order
transaction impossible.

## Decision

Phase 13 owns a deliberately narrow checkout quote seam for one server-defined
`STANDARD` method. The server creates and selects a `ShippingQuote` with an ID,
amount, currency, and expiry from server configuration or approved server data.
It re-quotes for the shipping address immediately before order confirmation and
snapshots the resulting method and amount in the order.

Development and test may supply a deterministic quote fixture. Production must
have valid quote configuration/data for the requested destination and currency;
missing, expired, invalid, or mismatched data fails closed before an order is
created. An explicit zero amount is valid only when it is returned by that
authoritative server quote, never because checkout assumes free shipping.

Phase 13 does not introduce a carrier, `ShippingProvider`, shipping zone/method
or rate matrix, customer-selectable shipping catalogue, shipment, tracking, or
fulfilment. Phase 15 expands this seam with the full shipping domain and provider
abstraction while preserving the server-authoritative quote and re-quote rule.
For Phase 13, this narrows ADR-0014's original full-port/manual-flat delivery
from a Phase 1 decision to Phase 15 work; ADR-0014's server-authoritative quote
principle remains in force.

## Consequences

**Positive** — Phase 13 can create exact, truthful order totals; test behavior is
deterministic without becoming production policy; quote expiry and address changes
are safe; and Phase 15 retains a clean, bounded expansion path.

**Negative / accepted** — Phase 13 supports only `STANDARD` checkout shipping;
production deployment must provide valid data before accepting orders; and the
full operations configuration experience remains deferred to Phase 15.

## Alternatives considered

| Option | Why not |
|---|---|
| Hardcode shipping to zero | Invents a monetary value and turns a seed fixture into policy. |
| Let the browser submit a total | Client-supplied money is rejected as tampering. |
| Pull all shipping work into Phase 13 | Violates the phase ceiling and delays the checkout safety work behind carrier/fulfilment scope. |
| Create an order without shipping | Breaks the immutable-order total and snapshot contract. |
