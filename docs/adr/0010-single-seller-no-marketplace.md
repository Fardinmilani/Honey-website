# ADR-0010: Single-seller domain; marketplace concepts forbidden

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

This is one brand selling its own honey. Part of the range comes from our own
apiaries; when demand exceeds our production we buy from trusted suppliers,
package the honey ourselves, and sell it under our own brand.

E-commerce tutorials, boilerplates, schema references, and code-generation models
overwhelmingly assume a marketplace. Left unchecked, a `sellerId` appears on a
product "for flexibility", a supplier name leaks into a product page, and a
commission field shows up in an order. Each is individually small and collectively
turns a brand store into something we never agreed to build.

## Decision

The domain has exactly **one merchant of record**. The following are permanently
forbidden — not deferred, not configurable, not behind a flag:

- seller registration, onboarding, accounts, dashboards
- vendor storefronts, shop pages, seller profile pages
- commissions, take rates, revenue splits, payouts, settlements
- multi-seller carts, orders, shipments, or invoices
- seller ratings or seller-level reviews
- `sellerId` / `vendorId` / `merchantId` on any customer-facing entity

**Sourcing is internal.** `HarvestBatch.sourcingType` is `OWN_PRODUCTION` or
`SELECTED_SUPPLIER`, used for procurement, traceability, and planning.
`Supplier` lives only in the procurement module: no login, no public page, and
never present in a customer-facing API response.

## Enforcement

This is not a convention; it is checked:

- A CI contract test scans the public OpenAPI document for `seller`, `vendor`,
  `merchant`, `commission`, `supplier`, and `landedCost`, and fails the build on
  a match.
- `module-boundaries.md` forbids the `catalog` → `procurement` dependency edge,
  enforced by `dependency-cruiser`.
- [`AGENTS.md`](../../AGENTS.md) makes it a standing rule for every contributor,
  human or agent.

## Consequences

**Positive** — a dramatically simpler domain: one payout account, one tax
posture, one fulfilment pipeline, no settlement ledger; the storefront tells one
coherent brand story; leakage is caught by a build failure rather than by a
reviewer noticing.

**Negative / accepted** — if the business ever genuinely pivots to a marketplace,
this is a rewrite of the order, payment, and fulfilment domains, not a feature
addition. That trade is made deliberately: the cost of a hypothetical pivot is
lower than the cost of carrying marketplace complexity forever in a store that is
not one.

## Alternatives considered

| Option | Why not |
|---|---|
| Marketplace-ready schema "just in case" | Permanent complexity for a scenario nobody has asked for; invites accidental leakage of supplier data |
| A single "default seller" row | Every query grows a join and every response grows a field, for one constant value |
| Modelling suppliers as users | Suppliers are purchasing counterparties, not actors in our system. Giving them identity is the first step to a marketplace |
