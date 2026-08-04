# Domain Model

Conceptual model for the single-seller honey store. Field lists are indicative,
not a schema dump; the authoritative schema arrives in Phase 4 as Prisma models.

**Universal conventions**

- Identifiers are UUID v7 (time-ordered) unless a human-facing code is required.
- Money is `{ amountMinor: bigint, currency: string }` — integer minor units plus
  ISO-4217 ([ADR-0016](adr/0016-money-minor-units.md)). Never a float.
- Timestamps are `timestamptz`, stored in UTC.
- `locale` is a **string** column (BCP-47), never a database enum, so a new
  language needs no migration ([ADR-0009](adr/0009-locale-prefixed-routing.md)).
- Customer-visible text lives in sidecar `*_translation` tables keyed by
  `(parentId, locale)`.
- Audit columns on every mutable entity: `createdAt`, `updatedAt`, `createdBy`,
  `updatedBy`. Soft delete (`deletedAt`) only where history matters.
- **No `sellerId` anywhere.** **No moisture, lab, or medical fields anywhere.**

---

## 1. Bounded contexts

| Context | Owns | Customer-visible? |
|---|---|---|
| Identity | Users, credentials, sessions, roles, permissions, audit | Partly (own account only) |
| Catalog | Products, variants, media, categories, collections, translations | Yes |
| Pricing | Variant prices, coupons, promotions, tax rules | Yes (computed output only) |
| Sourcing | Apiaries, harvest batches, own-production vs. supplier origin | Partly (origin story only) |
| Procurement | Suppliers, purchase orders, goods receipts, landed cost | **No — internal only** |
| Inventory | Locations, stock levels, ledger, reservations | Availability band only |
| Cart | Carts, cart lines | Yes |
| Checkout | Checkout sessions, addresses, shipping quotes | Yes |
| Orders | Orders, order lines, snapshots, status history, returns | Yes (own orders) |
| Payments | Payments, attempts, transactions, refunds, provider events | Status only |
| Shipping | Zones, methods, rates, shipments, tracking | Yes |
| Content | Pages, articles, FAQ, media library | Yes |
| Reviews | Product reviews and moderation | Yes (approved only) |
| Notifications | Templates, deliveries, subscriptions | Indirect |
| Platform | Outbox, idempotency keys, jobs, settings, feature flags | No |

---

## 2. Identity

```
User
  id · email (citext, unique) · emailVerifiedAt · phone · phoneVerifiedAt
  displayName · preferredLocale · status(ACTIVE|SUSPENDED|DELETED)
  isStaff · lastLoginAt · createdAt · updatedAt

AuthCredential      userId · type(PASSWORD|TOTP|RECOVERY_CODE) · secretHash · createdAt · lastUsedAt
Session             id · userId · kind(CUSTOMER|STAFF) · tokenHash · ip · userAgentHash
                    createdAt · lastSeenAt · expiresAt · revokedAt
VerificationToken   userId · purpose(EMAIL|PHONE|PASSWORD_RESET) · tokenHash · expiresAt · consumedAt
Role                code · name                        (seeded, not user-creatable)
Permission          code                               (seeded constant list)
RolePermission      roleId · permissionId
UserRole            userId · roleId · grantedBy · grantedAt
AuditLog            id · actorUserId · action · subjectType · subjectId
                    beforeJson · afterJson · ip · requestId · createdAt   (append-only)
```

**Roles** — `OWNER`, `ADMIN`, `ORDER_MANAGER`, `INVENTORY_MANAGER`,
`CONTENT_EDITOR`, `SUPPORT`, `CUSTOMER`. There is no seller role and there never
will be. Authorization checks test **permissions**, not role names, so the role
set can evolve without touching call sites. Details in
[`security-model.md`](security-model.md).

Passwords are hashed with argon2id. Only hashes of session tokens and
verification tokens are stored, never the token itself.

---

## 3. Catalog

```
Product
  id · sku? · brandLine? · status(DRAFT|PUBLISHED|ARCHIVED) · publishedAt
  primaryCategoryId · defaultVariantId
  honeyVarietal · floralSource[] · originRegion · originAltitudeBand
  harvestSeason · apiaryId?
  sourcingType(OWN_PRODUCTION|SELECTED_SUPPLIER)      ← internal, admin only
  sortWeight · createdAt · updatedAt · deletedAt

ProductTranslation
  productId · locale · name · slug · shortDescription · description
  tastingNotes · pairingSuggestions · storyHtml
  metaTitle · metaDescription
  UNIQUE(productId, locale) · UNIQUE(locale, slug)

ProductVariant
  id · productId · sku (unique) · status
  netWeightGrams · jarSizeLabelKey · packagingTypeKey
  barcode? · weightGramsShipping · dimensionsMm
  position · isDefault · createdAt · updatedAt · deletedAt

VariantTranslation      variantId · locale · name · UNIQUE(variantId, locale)

ProductMedia
  id · productId · variantId? · mediaAssetId · role(GALLERY|THUMBNAIL|LIFESTYLE|VIDEO)
  position · altTextByLocale (jsonb)

Category / CategoryTranslation      hierarchy (parentId, path), per-locale name + slug
Collection / CollectionTranslation  curated, editorial groupings
ProductCategory                     many-to-many
ProductCollection                   many-to-many

SlugHistory
  entityType · entityId · locale · oldSlug · changedAt      → drives 301 redirects
```

**Product vs. variant.** A `Product` is the honey — its varietal, origin, story,
and imagery. A `ProductVariant` is the thing with a SKU, a price, and stock: a
specific jar size and packaging. Every product has at least one variant. Carts,
inventory, and orders reference **variants only**.

**Forbidden fields, restated:** no `moisturePercent`, `waterContent`, `hmf`,
`diastase`, `labReportUrl`, `purityScore`, `healthBenefits`, or anything of that
family. Origin, craft, and sensory description only.

---

## 4. Sourcing — own production vs. selected supplier

Sourcing answers "where did this honey come from" for **traceability and
procurement planning**. It is never a storefront seller identity.

```
Apiary
  id · code · name · region · altitudeBand · notes · isOwnOperation
  (localized presentation via ApiaryTranslation)

HarvestBatch
  id · batchCode (unique, human-readable)
  sourcingType(OWN_PRODUCTION|SELECTED_SUPPLIER)
  apiaryId?              ← set when OWN_PRODUCTION
  supplierId?            ← set when SELECTED_SUPPLIER, internal only
  harvestSeason · harvestYear · floralSource[] · receivedAt
  quantityKg · notes(internal)

BatchAllocation
  id · harvestBatchId · variantId · quantityUnits · packedAt · notes
```

**Invariants**

- `sourcingType = OWN_PRODUCTION` ⟹ `apiaryId` set, `supplierId` null.
- `sourcingType = SELECTED_SUPPLIER` ⟹ `supplierId` set, `apiaryId` optional.
- Enforced by a database `CHECK` constraint, not only in application code.
- `supplierId` **must never** appear in a customer-facing API response. This is
  asserted by a contract test over the public OpenAPI document.

**What the customer sees.** Region, altitude band, harvest season, floral source,
and — for our own apiaries — the apiary story. Never the supplier's name, never a
"sourced from a third party" label. Everything is our brand, because everything
*is* our brand: we buy raw honey, we package it, we stand behind it.

---

## 5. Procurement — internal only

```
Supplier
  id · code · legalName · contactName · email · phone · address
  status(ACTIVE|PAUSED|BLOCKED) · qualityRating(internal 1–5) · notes
  ── no user account, no login, no public page ──

PurchaseOrder
  id · number (unique) · supplierId
  status(DRAFT|SUBMITTED|CONFIRMED|PARTIALLY_RECEIVED|RECEIVED|CANCELLED)
  currency · expectedAt · placedBy · placedAt · notes

PurchaseOrderLine
  id · purchaseOrderId · description · variantId? · harvestBatchId?
  quantityOrdered · unitCostMinor · taxMinor · lineTotalMinor

GoodsReceipt
  id · purchaseOrderId · receivedAt · receivedBy · stockLocationId · notes

GoodsReceiptLine
  id · goodsReceiptId · purchaseOrderLineId · quantityAccepted
  quantityRejected · rejectionReason(internal) · harvestBatchId
```

A goods receipt is the **only** way stock enters the system from procurement, and
it always writes a `StockLedgerEntry`. Landed cost is `unitCost + allocated
freight/duty`, used for margin reporting; it is internal and never exposed.

Quality acceptance here is operational (packaging condition, sensory check,
quantity). It is **not** a laboratory process and produces no lab data.

---

## 6. Inventory

```
StockLocation
  id · code · name · type(WAREHOUSE|STUDIO|EXTERNAL) · isSellable · isDefault

InventoryItem                                    ← current state, one row per (variant, location)
  id · variantId · stockLocationId
  onHand           units physically present
  reserved         units held by ACTIVE reservations
  allocated        units committed to unfulfilled orders
  incoming         units on confirmed purchase orders
  reorderPoint · safetyStock · updatedAt · version(optimistic lock)
  UNIQUE(variantId, stockLocationId)
  CHECK (onHand >= 0 AND reserved >= 0 AND allocated >= 0)

StockLedgerEntry                                 ← append-only, the audit truth
  id · variantId · stockLocationId · delta(signed)
  reason(RECEIPT|RESERVATION|RESERVATION_RELEASE|ALLOCATION|FULFILMENT|
         RETURN|ADJUSTMENT|WRITE_OFF|TRANSFER_IN|TRANSFER_OUT|CORRECTION)
  refType · refId · note · actorUserId · createdAt
  ── never updated, never deleted ──
```

**Availability** (what a customer may add to the cart):

```
availableToSell(variant) = Σ over sellable locations of
    onHand − reserved − allocated
```

`InventoryItem` is a derived cache of the ledger, maintained inside the same
transaction as every ledger write. A nightly reconciliation job recomputes it from
the ledger and alerts on any drift; the ledger always wins.

**Display policy.** The storefront shows a band (`IN_STOCK`, `LOW_STOCK`,
`OUT_OF_STOCK`), not an exact count — exact counts are a competitive leak and an
invitation to scraping. Exact numbers are admin-only.

---

## 7. Stock reservations

Reservations exist so that a customer who reaches the payment page can actually
be sold what they are paying for, without letting a browsing cart block inventory
indefinitely.

```
StockReservation
  id · variantId · stockLocationId · quantity
  cartId? · checkoutSessionId? · orderId?
  status(ACTIVE|CONSUMED|RELEASED|EXPIRED)
  expiresAt · createdAt · consumedAt · releasedAt · releaseReason
```

**Lifecycle**

```
add to cart ──────────────▶ no reservation (availability is advisory only)
begin checkout ───────────▶ ACTIVE, TTL 15 min
payment page re-entered ──▶ TTL extended once, max total 30 min
order created ────────────▶ CONSUMED  → becomes `allocated`
payment failed/abandoned ─▶ RELEASED  → stock returns to available
TTL passes ───────────────▶ EXPIRED   → released by sweeper + lazily on read
```

**Concurrency rule.** Acquiring or releasing a reservation happens in a
serializable-safe transaction that takes a row lock on the target
`InventoryItem` (`SELECT … FOR UPDATE`), re-reads availability inside the lock,
and fails with `INSUFFICIENT_STOCK` rather than overselling. Locks are always
taken in ascending `variantId` order to make deadlocks impossible. The
`CHECK (onHand >= 0 …)` constraints are the last line of defence: overselling is
a database error, not a silent bug.

**Expiry.** A BullMQ repeatable job sweeps expired reservations every minute.
Because a sweeper can lag, availability reads also treat `ACTIVE` reservations
past `expiresAt` as released. Both paths are idempotent.

Rationale in [ADR-0012](adr/0012-stock-reservation-strategy.md).

---

## 8. Pricing

```
VariantPrice
  id · variantId · currency · amountMinor · compareAtMinor?
  validFrom · validTo?                    ← scheduled and historical prices
  UNIQUE(variantId, currency, validFrom)

TaxRate        id · code · name · rateBps · country · region? · isInclusive
Coupon
  id · code (unique, case-insensitive) · type(PERCENT|FIXED|FREE_SHIPPING)
  value · currency? · minSubtotalMinor? · maxDiscountMinor?
  startsAt · endsAt · usageLimitTotal · usageLimitPerUser · usedCount
  appliesTo(ALL|CATEGORY|COLLECTION|VARIANT) · targetIds[] · status
CouponRedemption   couponId · userId? · orderId · amountMinor · redeemedAt
```

**Price resolution** — for `(variant, currency, now)` take the `VariantPrice`
with the latest `validFrom <= now` that is not yet expired. There is exactly one
answer, and it is computed server-side on every add-to-cart, every cart read, and
again inside the checkout transaction.

**Total computation order** (fixed, so results are reproducible):

```
1. line subtotal        = unitPrice × quantity
2. line discounts       = allocated proportionally from order-level coupons
3. order subtotal       = Σ (line subtotal − line discount)
4. shipping             = provider quote for method + address + parcel set
5. tax                  = per configured rules, inclusive or exclusive
6. grand total          = subtotal + shipping + tax
7. rounding             = half-up at the currency's minor unit, applied once at
                          the end; per-line values keep the allocated remainder
                          so Σ lines == order total exactly
```

Coupon stacking is disallowed at launch: one coupon per order, validated server
-side. A client that sends a discount amount is rejected.

---

## 9. Cart and checkout

```
Cart
  id · userId? · anonymousId(cookie) · currency · locale
  status(ACTIVE|MERGED|CONVERTED|ABANDONED)
  couponCode? · expiresAt · createdAt · updatedAt

CartLine
  id · cartId · variantId · quantity · addedAt
  UNIQUE(cartId, variantId)
  ── stores no money: prices are recomputed on every read ──

CheckoutSession
  id · cartId · userId? · email · phone?
  shippingAddressId? · billingAddressId? · sameAsShipping
  shippingMethodCode? · shippingQuoteId?
  status(OPEN|AWAITING_PAYMENT|COMPLETED|EXPIRED|CANCELLED)
  reservationExpiresAt · idempotencyKey · createdAt · completedAt

Address
  id · userId? · fullName · phone · country · province · city
  postalCode · line1 · line2? · isDefaultShipping · isDefaultBilling
```

`CartLine` deliberately stores **no price**. Anything persisted can go stale and
be trusted by accident; recomputing is cheap and always right. Prices shown on a
cached page are advisory and are re-verified before money is taken.

**Cart merge.** When an anonymous cart owner signs in, lines are merged into the
user's cart by variant with quantities summed and clamped to available stock; the
anonymous cart becomes `MERGED`.

**Checkout confirm transaction** — one Postgres transaction, in this order:

1. Load the cart with row locks; reject if empty or already converted.
2. Re-price every line from `VariantPrice` at `now`.
3. Re-validate the coupon (window, limits, eligibility) and recompute discounts.
4. Re-quote shipping for the selected method and address.
5. Recompute tax and totals.
6. Verify every `StockReservation` is `ACTIVE`, unexpired, and sufficient.
7. Create `Order` + immutable `OrderLine` snapshots + address snapshots.
8. Mark reservations `CONSUMED`; move `reserved → allocated`; append ledger rows.
9. Mark the cart `CONVERTED` and the checkout session `AWAITING_PAYMENT`.
10. Write `OutboxEvent(order.created)`.
11. **Commit.**

Only after commit does the API call the payment provider. `Idempotency-Key` is
mandatory: a retried confirm returns the original order rather than creating a
second one. If any step fails, the transaction rolls back and the reservation
survives so the customer can retry.

---

## 10. Orders — immutable snapshots

An order is a legal and financial record of what was agreed at a point in time.
It must render identically in five years even if the product was renamed,
re-priced, re-photographed, or deleted.

```
Order
  id · number (unique, human-readable, e.g. HNY-2026-000123)
  userId? · email · phone
  localeAtPurchase · currency
  status(PENDING_PAYMENT|PAID|PROCESSING|PARTIALLY_FULFILLED|FULFILLED|
         COMPLETED|CANCELLED|REFUNDED|PARTIALLY_REFUNDED|FAILED)
  paymentStatus(UNPAID|AUTHORIZED|PAID|PARTIALLY_REFUNDED|REFUNDED|FAILED)
  fulfilmentStatus(UNFULFILLED|PARTIAL|FULFILLED)
  subtotalMinor · discountTotalMinor · shippingTotalMinor
  taxTotalMinor · grandTotalMinor · refundedTotalMinor
  couponCodeSnapshot? · shippingMethodSnapshot(jsonb)
  shippingAddressSnapshot(jsonb) · billingAddressSnapshot(jsonb)
  placedAt · cancelledAt? · cancellationReason?
  ── financial fields are never recomputed after creation ──

OrderLine
  id · orderId · productId · variantId          ← references kept for reporting only
  skuSnapshot · productNameSnapshot(jsonb, per locale)
  variantNameSnapshot(jsonb, per locale)
  attributesSnapshot(jsonb)   jar size, packaging, varietal, origin, harvest season
  imageUrlSnapshot
  quantity · unitPriceMinor · discountAllocatedMinor
  taxRateBps · taxAmountMinor · lineTotalMinor
  harvestBatchCodeSnapshot?   ← traceability; NEVER the supplier
  ── immutable after creation ──

OrderStatusHistory   orderId · fromStatus · toStatus · reason · actorUserId · createdAt
OrderNote            orderId · body · isCustomerVisible · authorUserId · createdAt
ReturnRequest        orderId · lines[] · reason · status · requestedAt · resolvedAt
```

**Rules**

- Order and order-line rows are insert-only for all financial and descriptive
  fields. Enforced by a database trigger, not just convention.
- Rendering an order **never joins to live catalog data**. The snapshot is the
  display source.
- `productNameSnapshot` stores every locale available at purchase time, so an
  order placed in Persian can still be shown to English-speaking support staff.
- Corrections happen through new records — refunds, credit notes, adjustments —
  never by editing the original.
- Status transitions go through an explicit state machine with an allowed-
  transition table; an illegal transition is a `CONFLICT` error and is logged.
- Cancellation releases allocations back to stock via ledger entries.
- `harvestBatchCodeSnapshot` gives traceability from a delivered jar back to a
  batch. It resolves to a supplier only through the internal procurement tables,
  which are never exposed publicly.

---

## 11. Payments — provider abstraction

```ts
interface PaymentProvider {
  readonly code: string;                       // 'zarinpal' | 'stripe' | …
  readonly capabilities: {
    redirect: boolean; capture: boolean;
    partialRefund: boolean;
    webhooks: boolean;        // MAY be false — many domestic providers have none
    verifyReturn: boolean;    // redirect-then-server-verify support
  };

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  //   → { providerRef, redirectUrl?, clientSecret?, expiresAt }
  verifyReturn?(input: ProviderReturnInput): Promise<PaymentOutcome>;
  capture?(input: CaptureInput): Promise<PaymentOutcome>;
  refund(input: RefundInput): Promise<RefundOutcome>;
  parseWebhook?(raw: RawWebhook): Promise<VerifiedWebhookEvent>;  // verifies signature
  getStatus(providerRef: string): Promise<PaymentOutcome>;        // MANDATORY
}
```

`getStatus` is required of every adapter; `verifyReturn` and `parseWebhook` are
optional and declared through `capabilities`. A provider that supports neither is
not integrable ([ADR-0022](adr/0022-payment-verification-sources.md)).

```
Payment
  id · orderId · provider · status(CREATED|PENDING|AUTHORIZED|PAID|FAILED|
                                   CANCELLED|EXPIRED|REFUNDED|PARTIALLY_REFUNDED)
  amountMinor · currency · providerRef · idempotencyKey
  createdAt · authorizedAt · paidAt · failedAt · failureCode

PaymentAttempt      paymentId · attemptNumber · status · providerRef
                    requestSummary(redacted) · responseSummary(redacted) · createdAt
PaymentTransaction  paymentId · type(AUTHORIZE|CAPTURE|REFUND|VOID|CHARGEBACK)
                    amountMinor · providerTxnRef · occurredAt · rawPayload(jsonb, redacted)
Refund              id · orderId · paymentId · amountMinor · reason
                    status · requestedBy · providerRef · createdAt · completedAt
ProviderEvent       provider · eventId(unique) · type · signatureValid
                    receivedAt · processedAt · rawBody · processingError
```

**Rules**

- The domain never imports a PSP SDK. Adapters live in
  `packages/backend/src/modules/payments/infrastructure/providers/<code>/` and map
  vendor payloads into `PaymentOutcome`. Adding a PSP is a new adapter plus
  configuration ([ADR-0022](adr/0022-payment-verification-sources.md), superseding
  [ADR-0013](adr/0013-payment-provider-abstraction.md)).
- **The browser never determines payment state.** Payment state changes only on a
  server-to-server, provider-verified outcome. A "success" query parameter is an
  untrusted hint that triggers verification.
- Three sources are equally authoritative: a **verified webhook**, a server-side
  **`verifyReturn`** after redirect, or a reconciliation **`getStatus`** poll.
  All three call the same `applyPaymentOutcome` function — one idempotent,
  monotonic state machine, so a terminal state is never walked back by a late
  message and concurrent arrivals serialize on a row lock.
- Webhooks, where the provider supports them: signature-verified, replay-protected
  via a unique `eventId` and a timestamp window, persisted raw before
  interpretation, then processed idempotently by the worker.
- **`providerRef`, `amountMinor`, and `currency` are verified** on every outcome.
  `Payment.amountMinor` must equal `Order.grandTotalMinor`. A mismatch does not
  mark the order paid — it raises a reconciliation alert.
- Reconciliation polling is mandatory for every provider, so neither a dropped
  webhook nor an abandoned redirect can strand an order.
- Card data never touches our infrastructure; only tokens and provider references
  are stored. Raw payloads are redacted before persistence.

---

## 12. Shipping — provider abstraction

```ts
interface ShippingProvider {
  readonly code: string;                        // 'manual-flat' | 'post-ir' | …
  quote(input: QuoteInput): Promise<ShippingQuote[]>;
  createShipment(input: CreateShipmentInput): Promise<ShipmentResult>;
  getLabel?(shipmentRef: string): Promise<LabelResult>;
  track(trackingNumber: string): Promise<TrackingUpdate[]>;
  parseWebhook?(raw: RawWebhook): Promise<VerifiedTrackingEvent>;
}
```

```
ShippingZone     id · name · countries[] · provinces[] · priority
ShippingMethod   id · code · zoneId · provider · isActive · sortOrder
                 (localized presentation via ShippingMethodTranslation)
ShippingRate     id · methodId · currency · baseMinor · perKgMinor
                 freeOverSubtotalMinor? · minWeightGrams · maxWeightGrams
ShippingQuote    id · checkoutSessionId · methodCode · amountMinor · currency
                 estimatedDaysMin/Max · expiresAt · providerPayload(jsonb)
Shipment         id · orderId · provider · status(PENDING|LABEL_CREATED|
                    IN_TRANSIT|DELIVERED|FAILED|RETURNED)
                 trackingNumber · trackingUrl · shippedAt · deliveredAt
ShipmentLine     shipmentId · orderLineId · quantity
TrackingEvent    shipmentId · status · description · occurredAt · rawPayload
```

The launch adapter is `manual-flat`: zone- and weight-based rates configured in
admin, with tracking numbers entered by staff. It implements the same interface
as any carrier integration, so adding a carrier later changes configuration and
one adapter — nothing else
([ADR-0014](adr/0014-shipping-provider-abstraction.md)).

Shipping cost is always the server's quote. A client-supplied shipping total is
rejected. Quotes expire; an expired quote is re-quoted inside the checkout
transaction and the customer is shown the change before confirming.

---

## 13. Content, reviews, notifications

```
Page / PageTranslation          slug per locale, blocks(jsonb), SEO fields, publish state
Article / ArticleTranslation    editorial posts
FaqItem / FaqItemTranslation    grouped question/answer
MediaAsset      id · storageKey · mimeType · bytes · width · height · duration
                checksum · altTextByLocale(jsonb) · createdBy
MediaDerivative mediaAssetId · variant(thumb|card|hero|og) · format(webp|avif|jpg)
                width · storageKey

ProductReview   id · productId · userId? · orderId?   ← verified-purchase link
                rating(1–5) · title · body · locale
                status(PENDING|APPROVED|REJECTED) · moderatedBy · moderatedAt
                ── rejected if it contains a health claim; moderation guidance is
                   part of the admin UI copy ──

NotificationTemplate  code · locale · channel(EMAIL|SMS) · subject · body
NotificationDelivery  id · templateCode · channel · recipientHash · locale
                      status(QUEUED|SENT|FAILED|BOUNCED) · providerRef · sentAt
NewsletterSubscription  email · locale · status · confirmedAt · unsubscribedAt
```

Notifications are always rendered in the recipient's locale — for order emails
that means `Order.localeAtPurchase`, not the staff member's current UI language.

---

## 14. Platform

```
OutboxEvent      id · aggregateType · aggregateId · eventType · payload(jsonb)
                 occurredAt · publishedAt? · attempts · lastError
IdempotencyKey   key · scope · userId? · requestHash · responseStatus
                 responseBody(jsonb) · createdAt · expiresAt
Setting          key · valueJson · updatedBy · updatedAt
FeatureFlag      key · enabled · description
JobFailure       queue · jobId · name · payload(redacted) · error · failedAt
```

The outbox is written inside the business transaction and dispatched afterwards
by the worker. This is the mechanism that makes side effects exactly-once *from
the domain's point of view* even though delivery is at-least-once.

---

## 15. Invariants the system must never violate

1. `onHand`, `reserved`, and `allocated` are never negative — DB `CHECK`.
2. `availableToSell` never goes below zero — reservation transaction + `CHECK`.
3. Every stock movement has a matching `StockLedgerEntry` — same transaction.
4. Order financial fields are never updated after creation — DB trigger.
5. `Σ OrderLine.lineTotal − discounts + shipping + tax = Order.grandTotal` — asserted in the checkout transaction and by an integration test.
6. `Payment.amountMinor = Order.grandTotalMinor` at authorization time.
7. `refundedTotalMinor <= grandTotalMinor`.
8. A `HarvestBatch` has exactly one of `apiaryId` / `supplierId` per its `sourcingType` — DB `CHECK`.
9. No `supplierId`, supplier name, or landed cost ever appears in a public API response — contract test over the OpenAPI document.
10. Every published product has at least one published variant with a current price.
11. Every product and category has a translation for every enabled locale before it can be published.
12. No field name or enum value in the schema matches `/moisture|lab|hmf|diastase|purity|therapeut|medic|cure|treat/i` — asserted by a schema lint test in CI.
