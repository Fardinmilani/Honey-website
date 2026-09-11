# ADR-0033: Cart discount remainders use stable line-ID order

**Status:** Accepted
**Date:** 2026-09-10
**Phase:** 12

## Context

An order-level percentage or fixed coupon is applied to the eligible merchandise
subtotal, then allocated back to cart lines. Integer minor units cannot always
divide proportionally without a remainder. A non-deterministic remainder rule
would make the same cart produce different line totals, complicate auditing, and
break the exact cart-total invariant in [ADR-0016](0016-money-minor-units.md).

## Decision

The pricing module uses integer-only arithmetic in this order:

1. Determine eligible lines and their authoritative subtotals.
2. Derive and cap the coupon discount; it can never exceed the eligible subtotal.
3. Allocate each eligible line `floor(discount × lineSubtotal / eligibleSubtotal)`.
4. Give each remaining minor unit, one at a time, to eligible lines sorted by
   immutable `CartLine.id` in ascending lexical order.
5. Set each final merchandise line total to `lineSubtotal - allocatedDiscount`.

Ineligible lines receive zero discount. The allocation is bounded by each line
subtotal, and the sum of allocated discounts equals the derived coupon discount
exactly. The sum of final line totals equals the cart merchandise total exactly.

Percentage derivation and inclusive/exclusive tax calculations use the
integer half-up helper defined by the pricing module. `FREE_SHIPPING` has no
merchandise discount at cart time; it is represented as deferred until an
authoritative shipping quote exists.

## Consequences

### Positive

- The same cart, price set, and coupon always produces the same line totals.
- No decimal or floating-point arithmetic crosses the pricing boundary.
- Later checkout snapshots can retain a readily explainable allocation result.

### Negative / accepted costs

- The earliest lexical line IDs receive remainder units; this is intentional,
  deterministic, and not a customer-visible promotion rule.
- Cart lines must have stable identifiers before allocation.

## Alternatives considered

| Option | Why not |
|---|---|
| Give remainder to the largest subtotal | Needs an additional tie-break rule and changes allocations when a line quantity changes |
| Give remainder to the last line | Less intuitive to inspect and not aligned with ascending lock/order conventions |
| Round every line independently | Can create or lose a minor unit, violating the exact-total invariant |
| Use floating-point proportional shares | Loses exactness for large minor-unit values |
