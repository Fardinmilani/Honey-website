# ADR-0014: Shipping provider port; manual flat-rate first

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

At launch, fulfilment is small and hands-on: staff pack jars, hand them to a
courier, and enter a tracking number. Building a carrier API integration now
would be speculative work against an unchosen carrier. But shipping cost is money,
and money must never be client-supplied — so even a manual process needs a real
server-side quoting path.

## Decision

Define the full `ShippingProvider` port now; implement one simple adapter.

```ts
interface ShippingProvider {
  readonly code: string;
  quote(input): Promise<ShippingQuote[]>;
  createShipment(input): Promise<ShipmentResult>;
  getLabel?(shipmentRef): Promise<LabelResult>;
  track(trackingNumber): Promise<TrackingUpdate[]>;
  parseWebhook?(raw): Promise<VerifiedTrackingEvent>;
}
```

The launch adapter is **`manual-flat`**: zone-, weight-, and subtotal-based rates
configured in admin, with free-shipping thresholds; `createShipment` records a
staff-entered tracking number; `track` returns manually recorded events.

Shipping cost is always the server's quote. Quotes are stored with an expiry; an
expired quote is re-quoted inside the checkout transaction and the customer is
shown the change before confirming. A client-supplied shipping total is rejected
with `422` and a tampering audit event.

## Consequences

**Positive** — launches with the operation we actually have, while the seam for a
carrier API already exists; adding a carrier later is one adapter plus
configuration, with no change to checkout, orders, or the UI; shipping cost is
server-authoritative from day one; quote expiry prevents a stale price being
honoured after rates change.

**Negative / accepted** — manual tracking entry is staff work and can be
forgotten or mistyped (mitigated by validation and a reminder job); flat rates
approximate real cost, so margin per shipment varies; the port is designed
against carriers we have not integrated, so the first real integration will
probably reveal a missing parameter — the port is versioned internally and this
is expected rather than a failure.

## Alternatives considered

| Option | Why not |
|---|---|
| Integrate a carrier API now | Speculative against an unchosen carrier; the manual process is what exists at launch volume |
| Hardcode a flat rate with no abstraction | Shipping rules change constantly; the first real change becomes a code change |
| Let the client compute shipping | Client-supplied money is forbidden. Non-negotiable |
| A multi-carrier aggregator | Cost and vendor dependency well ahead of the volume that would justify them |
