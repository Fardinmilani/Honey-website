# ADR-0016: Money as integer minor units + currency code

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

Floating-point money is a guaranteed defect: `0.1 + 0.2 !== 0.3`, and errors
accumulate across line items, discounts, tax, and shipping until an order total
does not match the sum of its lines. Iranian Rial amounts are also large — a
mid-range order can exceed `Number.MAX_SAFE_INTEGER` once expressed in minor
units at scale — and JSON has no integer type distinct from `double`.

## Decision

Money is always a pair:

```ts
type Money = { amountMinor: bigint; currency: string };  // ISO-4217
```

- Stored as `amount_minor bigint` + `currency char(3)`. Never `float`, never
  `numeric`, never a bare number.
- Rates are basis points as integers (`tax_rate_bps = 900` → 9%), so percentages
  never introduce fractions either.
- In JSON, `amountMinor` is a **string** — `{"amountMinor": "48500000",
  "currency": "IRR"}` — because a JavaScript `number` cannot safely round-trip
  large integers.
- Arithmetic goes through a `Money` value object in `packages/core`. Adding two
  different currencies throws.
- **Rounding happens once**, half-up, at the end of the total computation.
  Per-line values keep the allocated remainder so `Σ lines === order total`
  exactly, with no cent left unaccounted.
- Formatting is a **presentation** concern: `Intl.NumberFormat` in the web layer.
  The API never returns a formatted string.
- Whether the Persian storefront displays Toman (IRR ÷ 10) is a formatter
  decision, not a domain one.

## Consequences

**Positive** — exact arithmetic, always; totals reconcile by construction;
currency is inseparable from amount, so a currency mix-up is a type error rather
than a silent wrong charge; single-point rounding makes discount allocation
auditable; adding a currency is data, not a schema change.

**Negative / accepted** — `bigint` is slightly awkward in TypeScript and must be
serialized deliberately (which is why JSON carries a string); every developer
must resist writing `price * quantity` on a raw number, which the value object
and lint rules discourage; zero-decimal currencies like IRR need explicit
exponent handling in the formatter so amounts are not divided by 100.

## Alternatives considered

| Option | Why not |
|---|---|
| Floating-point | Accumulating rounding errors in money. Never acceptable |
| `numeric`/`decimal` in Postgres | Correct in the database, but crosses into JavaScript as a string or a lossy number anyway; integers are simpler end to end |
| A decimal library everywhere | Extra dependency and conversion at every boundary for a problem integers already solve |
| Bare number with an implicit currency | The first multi-currency requirement becomes an audit of every call site |
| Storing formatted strings | Unsortable, unsummable, locale-contaminated data |
