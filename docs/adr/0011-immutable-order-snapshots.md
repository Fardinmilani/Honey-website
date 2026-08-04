# ADR-0011: Orders are immutable snapshots

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

An order is a legal and financial record of what was agreed at one moment. If
order lines referenced live catalog rows, then renaming a product, changing its
price, replacing its photo, or archiving it would silently rewrite history —
customer receipts, accounting exports, and dispute evidence would all change
retroactively. In a bilingual store the problem is worse: the customer bought
"عسل کنار" and must keep seeing that, whoever is looking at the order later.

## Decision

At creation, every order line copies everything needed to render and audit it,
and nothing about the order's financial or descriptive content is ever updated.

```
OrderLine
  productId, variantId              ← kept for reporting joins only, never for display
  skuSnapshot
  productNameSnapshot   jsonb       ← every locale available at purchase time
  variantNameSnapshot   jsonb
  attributesSnapshot    jsonb       ← jar size, packaging, varietal, origin, harvest season
  imageUrlSnapshot
  quantity, unitPriceMinor, discountAllocatedMinor,
  taxRateBps, taxAmountMinor, lineTotalMinor
  harvestBatchCodeSnapshot?         ← traceability; never the supplier
```

The order itself snapshots the shipping and billing addresses, the shipping
method, the coupon code, `localeAtPurchase`, and every total.

**Enforced by a database trigger**, not convention: `BEFORE UPDATE` on `"order"`
and `order_line` rejects changes to financial and snapshot columns. Only
`status`, `paymentStatus`, `fulfilmentStatus`, and `refundedTotalMinor` remain
mutable, and status changes are recorded in `order_status_history`.

Corrections happen through new records — refunds, credit notes, adjustments —
never by editing the original.

## Consequences

**Positive** — an order renders identically forever, even after the product is
renamed, re-priced, and archived; accounting exports are stable; disputes have
authoritative evidence; a Persian order can be shown to English-speaking support
because all locales were captured; catalog cleanup is safe because nothing
historical depends on live rows.

**Negative / accepted** — storage duplication (negligible next to the value);
snapshots must be complete at write time, since a field forgotten at creation is
unrecoverable later; a genuine correction requires an explicit compensating
record and a considered process, which is slower but is the correct behaviour for
financial data; reporting that joins live products must be written knowing the
join is for grouping, not for display.

## Alternatives considered

| Option | Why not |
|---|---|
| Reference live catalog rows | History rewrites itself on every catalog edit |
| Soft-delete and version the catalog instead | Every product read grows a temporal join; the complexity lands on the hottest path to protect the coldest one |
| Snapshot only the name and price | The first support question about "which jar size was this" has no answer |
| Snapshot only the purchase locale | Support staff in the other language cannot read the order |
| Event sourcing the whole domain | Correct, and far more machinery than this product needs |
