# Shipping and fulfilment development

Phase 15 extends the narrow Phase 13 `STANDARD` checkout quote into a
server-owned shipping domain. The accepted launch adapter is `manual-flat`
([ADR-0014](adr/0014-shipping-provider-abstraction.md)); there is no carrier API,
label printing, provider webhook, or automatic tracking poll in this phase.
The existing checkout quote ID and confirmation boundary remain the path to an
order ([ADR-0038](adr/0038-phase13-minimal-shipping-quote-boundary.md)).

## Ownership

| Module | Responsibility |
|---|---|
| `shipping` | Provider port, `manual-flat` adapter, zones, methods and translations, rates, and authoritative quotes. |
| `checkout` | Session, address and selected quote; re-quote and price-change reconfirmation before immutable order creation. |
| `fulfilment` | Shipment, shipment lines and source allocations, tracking events, and authorized lifecycle commands. |
| `inventory` | Consumed reservations, physical balances, append-only ledger, and reason-aware reconciliation. |
| `orders` | Immutable order snapshots, status history, and customer ownership. |

An orchestrating application service passes one transaction handle to each
owning module. No module reaches into another module's tables, and no provider
network call runs inside a transaction. The current `manual-flat` provider's
`createShipment` runs inside that transaction but is deterministic, in-process
work with no network I/O. A future carrier adapter must move its remote call
outside the stock-movement transaction
([module-boundaries.md](module-boundaries.md)).

## Quotes and checkout

The destination is resolved from the server-validated shipping address. Zone
matching uses configured country and province with explicit priority; an
ambiguous or unsupported match yields no method. Each active method has `fa`
and `en` presentation from its translation rows and one applicable rate for
the currency, effective time, authoritative cart subtotal, and total parcel
weight from product variants. The manual rule computes
`baseMinor + perKgMinor × ceil(weightGrams / 1000)` with integer minor-unit
arithmetic, unless its configured merchandise-subtotal threshold makes the
quote zero. A missing,
overlapping, expired, or invalid rule fails closed. The free-shipping threshold
is a configured rate rule, while a `FREE_SHIPPING` coupon is a separate pricing
decision applied against the authoritative quoted amount. Neither can create a
negative shipping charge.

The local seed creates the `STANDARD` method bound to provider code
`manual-flat`, with Persian and English names and a configured rate. The
method code is the customer's selection; the provider code selects the internal
adapter. Docker PostgreSQL can serve both the API and a disposable test
database, so test seeding does not require changing existing local order or
inventory data.

The current schema makes method codes globally unique and binds each method to
one zone. The launch `STANDARD` method therefore serves one configured zone;
its code cannot be repeated for a second zone with a different rate. Geographic
expansion needs a deliberate method-code and rate-policy decision before
configuration.

A quote is stored against the checkout session with a server ID, method code,
amount, currency, and expiry. The client may select an available method or quote
ID; it cannot send a shipping price, discount, stock figure, or payment state.
An address or cart change invalidates the selected quote. Checkout confirmation
recomputes the server quote before creating an order. When the payable result
changes, it returns the existing `PRICE_CHANGED` reconfirmation response with
the safe new amount. The first confirmation creates no order. The eventual
order snapshots the method, destination, shipping charge and discount outcome;
historical order detail never recomputes them from live rates.

## Preparation, dispatch, and tracking

Only an order with provider-verified paid state and valid allocation may enter
fulfilment. Staff endpoints require an explicit order/fulfilment permission at
the API. A `PENDING` shipment can contain some or all remaining order-line
quantities, with an optional validated tracking number. Draft creation and
tracking entry do not decrement inventory. The manual provider records staff
tracking events and makes no claim of a live carrier integration. Phase 15's
manual path uses `PENDING`, `IN_TRANSIT`, and `DELIVERED`; existing enum values
for labels and returns do not activate those out-of-scope workflows.

The physical boundary is staff-confirmed handover. Moving a draft shipment to
`IN_TRANSIT` atomically records its shipped quantity and consumes stock from the
actual Phase 13 allocated locations. For quantity `q`, a `FULFILMENT` ledger
entry has `delta = -q`: `onHand -= q`, `allocated -= q`, and `reserved` stays
unchanged ([ADR-0039](adr/0039-phase15-physical-fulfilment-and-allocation-release.md)).
Shipment line allocations link each line quantity to its consumed reservation,
so a split-location order is never decremented from an arbitrary location
([ADR-0040](adr/0040-shipment-line-allocation-provenance.md)). Locks follow
`(variant_id ASC, stock_location_id ASC)`. Dispatch, ledger, balances, status,
audit, and outbox either commit together or all roll back. Durable idempotency,
state checks, and row locks prevent a retry from shipping twice.

Order fulfilment status is derived from shipped line totals: zero shipped is
`UNFULFILLED`, some is `PARTIAL` with order status `PARTIALLY_FULFILLED`, and
all is `FULFILLED`. A later authorized manual `DELIVERED` event updates tracking
without a second stock movement. Neither payment success nor a customer browser
input sets shipment or delivery state. Customer tracking is available only
through owner-scoped order detail and excludes internal location, reservation,
provider payload, and staff-only data.

## Cancellation and returns boundary

Phase 15 does not add a shipment void state. Order cancellation is allowed only
when no shipment draft and no physical dispatch exists. It releases allocated stock with
`ALLOCATION_RELEASE -q`: `allocated -= q`, while `onHand` and `reserved` are
unchanged. `RESERVATION_RELEASE` applies only to an active reservation and is
not used for an already allocated order. A dispatched quantity is never
restocked merely because a shipment is cancelled, an order is refunded, or a
manual tracking event changes. Returns logistics and restock require a separate
workflow; Phase 15 does not activate one. The existing `ReturnRequest` record
does not imply automatic return or exchange behavior.

## Notifications and later phases

Phase 15 writes versioned shipment outbox events in the same transaction as
shipment state changes. After a dispatch or delivery transaction commits, the
fulfilment service directly sends a plain-text email through the existing SMTP
configuration. Subject and body use `Order.localeAtPurchase` (`fa` or `en`),
the immutable order number, and optional validated tracking details. A unique
`(shipmentId, eventType)` delivery row and a lease prevent concurrent request
replays from sending the same successful notification twice. A failed SMTP send
leaves the physical state committed and the delivery unsent; an authorized
dispatch or delivery replay retries it. There is no timer or queue consumer in
this phase. If SMTP accepts a message and the process stops before recording
`sentAt`, a later retry may send a duplicate; this unavoidable boundary of the
direct SMTP path is a delivery risk to monitor.

Phase 16 owns BullMQ dispatch, automatic retries, dead letters, and scheduled
tracking refresh. Phase 18 owns the general notification-template module.
Phase 17 owns the staff console. Phase 15 exposes only permission-gated staff
API operations; it adds no staff UI. A live carrier adapter, labels, route
optimization, and return processing stay outside this phase.

## Verification contract

Unit tests cover deterministic zone precedence, rate applicability and exact
arithmetic, quote expiry, free shipping, partial line bounds, and status
transitions. Real PostgreSQL tests cover multi-location physical movement,
duplicate and concurrent dispatch, cancellation release, nonnegative balances,
and ledger reconciliation. API tests prove permission and ownership checks,
CSRF, tampering rejection, and no internal field leaks. Playwright covers both
locales, quote changes, safe tracking, checkout regression, and accessibility.
The Phase 15 verifier, OpenAPI gates, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`, and applicable E2E tests must report actual results in
[progress.md](progress.md).
