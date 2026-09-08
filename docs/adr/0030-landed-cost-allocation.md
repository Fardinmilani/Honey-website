# ADR-0030: Landed-cost allocation uses line totals and a last-line remainder

**Status:** Accepted
**Date:** 2026-08-10
**Phase:** 11

## Context

Landed cost is `unit cost + allocated freight/duty/other acquisition costs`.
The Phase 4 schema stored line unit cost and tax but had nowhere to store
freight, duty, or other documented acquisition costs, and no allocation rule.

## Decision

Purchase orders store integer minor-unit acquisition extras:

- `freightCostMinor`
- `dutyCostMinor`
- `otherCostMinor`

`acquisitionExtras = freight + duty + other`.

Each line's merchandise total is server-derived:

`lineTotalMinor = unitCostMinor * quantityOrdered + taxMinor`.

Allocation:

1. If extras are 0 or there are no lines, every line's allocated extra is 0.
2. Otherwise extras are allocated in proportion to `lineTotalMinor`.
3. Integer division uses truncation toward zero.
4. The remainder (`extras - sum(floor shares)`) is added to the **last line
   ordered by `id` ascending**.
5. `landedLineMinor = lineTotalMinor + allocatedExtraMinor`.
6. `landedUnitMinor = landedLineMinor / quantityOrdered` (truncation); the
   per-unit figure is informational. Exactness is defined on **line totals**:
   `sum(landedLineMinor) === sum(lineTotalMinor) + extras`.

Landed cost is admin-only and is never a storefront price.

## Consequences

### Positive

- Deterministic, remainder-preserving, integer-only.
- Schema change is expand-only.

### Negative / accepted costs

- Lines with zero merchandise total receive extras only if they are the last
  line and a remainder exists (unusual; extras normally ride on costed lines).

## Alternatives considered

| Option | Why not |
|---|---|
| Allocate by quantity | Mixes jar counts with money; a 1-unit luxury line would under-absorb freight |
| Banker's rounding per line | Can fail exact-sum property tests |
| Separate cost document table | Unnecessary for Phase 11; extras are PO-level facts |
