# Product Scope

**Status:** authoritative. If a feature is not described here, it is not in the
product. Proposals go to `docs/progress.md` under *Unresolved decisions*.

---

## 1. Business model

A **single-seller, single-brand** direct-to-consumer online honey store.

- Every product is sold under **our own brand**.
- Part of the range is **produced by our own operation** (our apiaries).
- When demand exceeds our own production, we **buy high-quality honey from
  trusted suppliers**, package it ourselves, and sell it under our own brand.
- Sourcing is an **internal supply-chain fact**, used for procurement, traceability,
  and inventory planning. It is not a customer-facing seller identity.

There is exactly one merchant of record: us.

### 1.1 Explicitly not a marketplace

The following are permanently out of scope and must never be modelled, named,
or referenced anywhere in the codebase:

- seller registration, onboarding, accounts, or dashboards
- vendor storefronts, shop pages, or seller profile pages
- commissions, take rates, revenue sharing, payouts, or settlements
- multi-seller carts, multi-seller orders, per-seller shipments or invoices
- seller ratings or seller-level reviews
- `sellerId` / `vendorId` / `merchantId` on any customer-facing entity

`Supplier` exists only inside procurement. A supplier has no login, no public
page, and never appears in a customer-facing API response.

### 1.2 Explicitly forbidden claims

Never present, store, or model:

- moisture percentage, water content, HMF, diastase, sugar profile, or any other
  laboratory measurement
- laboratory reports, certificates of analysis, purity scores, or "lab tested"
  badges
- medical or therapeutic claims: treating, curing, preventing, or relieving any
  condition; immunity, detox, weight loss, allergy relief, antibacterial or
  antimicrobial properties
- health-benefit comparisons against other foods

**Permitted product language** — origin, craft, and sensory character:

varietal / floral source · region and altitude · harvest season · apiary ·
harvest batch · colour · aroma · texture · crystallisation behaviour · taste
notes · pairing suggestions · jar size · packaging · storage advice

---

## 2. Audiences

| Audience | Access | Needs |
|---|---|---|
| **Visitor** (anonymous) | Public storefront | Browse, read, add to cart, start checkout |
| **Customer** (registered) | Account area | Orders, addresses, profile, order tracking |
| **Staff** (admin console) | `/{locale}/admin`, permission-gated | Operate catalog, inventory, procurement, orders, content |

There is no fourth audience. In particular there is no seller audience.

Staff roles are defined in [`security-model.md`](security-model.md): `OWNER`,
`ADMIN`, `ORDER_MANAGER`, `INVENTORY_MANAGER`, `CONTENT_EDITOR`, `SUPPORT`.

---

## 3. In scope — storefront

### 3.1 Home
- Hero section anchored on the existing desktop/mobile videos with poster stills
  and a reduced-motion fallback (`apps/web/public/media/hero/`).
- Brand story, featured products, collections, editorial highlights.

### 3.2 Catalog
- Category and collection listing pages with pagination.
- Filtering by varietal / floral source, region, jar size, price range, availability.
- Sorting by relevance, price, newest.
- Search across localized product names, descriptions, and tasting notes.

### 3.3 Product detail
- Localized name, description, tasting notes, pairing suggestions, story.
- Variant selection (jar size, packaging).
- Gallery: images and optional short video.
- Origin block: region, apiary, harvest season, floral source, harvest batch.
- Availability and price, both server-computed.
- Related products.

### 3.4 Cart and checkout
- Persistent cart for both guests and signed-in customers.
- Server-recomputed line prices, discounts, and totals on every read.
- Checkout: contact details, shipping address, shipping method, payment.
- Stock reservation held for the duration of checkout.
- Coupon entry with server-side validation.
- Order confirmation page and confirmation email in the customer's locale.

### 3.5 Account
- Registration, sign-in, sign-out, password reset, email verification.
- Order history with immutable order detail.
- Address book.
- Profile and locale preference.

### 3.6 Content
- Static/editorial pages: about, our apiaries, sourcing story, shipping,
  returns, privacy, terms, contact, FAQ.
- All content localized per locale.

### 3.7 Cross-cutting
- Persian (RTL) and English (LTR) with locale-prefixed URLs.
- SEO: per-locale metadata, canonical, hreflang, sitemaps, structured data.
- Accessibility target WCAG 2.1 AA.
- Responsive from 360px to large desktop.

---

## 4. In scope — admin console

Lives at `/{locale}/admin` inside `apps/web`, permission-gated, server-authorized
by `apps/api`.

| Area | Capabilities |
|---|---|
| Catalog | Products, variants, media, categories, collections, per-locale translations, publish state |
| Pricing | Variant prices per currency, scheduled price changes, coupons |
| Inventory | Stock levels per location, adjustments with reasons, ledger view, reservations, low-stock alerts |
| Sourcing | Own-production vs. selected-supplier flag, apiaries, harvest batches, batch→variant allocation |
| Procurement | Suppliers, purchase orders, goods receipts, landed cost |
| Orders | Search, detail, status transitions, fulfilment, shipment creation, refunds, cancellation, notes |
| Content | Pages, articles, FAQ, homepage arrangement, per-locale editing |
| Reviews | Moderation queue (approve / reject) |
| Customers | Search, detail, order history, address history — read-mostly |
| Settings | Shipping zones/methods/rates, tax configuration, locale enablement, store profile |
| Audit | Immutable log of privileged actions |

---

## 5. Out of scope

### 5.1 Permanently out of scope
Marketplace features (§1.1) · laboratory, moisture, or medical claims (§1.2) ·
seller-facing anything · B2B wholesale portal with negotiated per-account pricing ·
dropshipping · user-generated storefronts.

### 5.2 Not in the current plan (would require a new phase and a business decision)
Subscriptions and recurring delivery · loyalty points · gift cards and store
credit · referral or affiliate programs · wishlists and saved carts sharing ·
live chat · AI recommendations · social feeds or gamification · native mobile
apps · multi-warehouse routing optimisation · marketplace-channel integrations
(Amazon, Digikala, etc.) · POS integration · additional currencies beyond the
launch decision.

The architecture is designed so several of these could be added later without a
rewrite, but none of them may be built, stubbed, or pre-wired now.

---

## 6. Languages

- Launch locales: **Persian (`fa`, RTL)** and **English (`en`, LTR)**.
- All content routes are locale-prefixed: `/fa/...` and `/en/...`.
- Adding a locale must require only configuration and content, never a change to
  the core domain model.
- Translated copy never lives inside UI components; it lives in message catalogs
  and per-entity translation records.

See [`i18n-strategy.md`](i18n-strategy.md).

---

## 7. Visual identity

Premium, natural, minimal. Inspired by the mountains and wildflowers of
Azerbaijan: warm honey ambers, deep forest and slate greens, stone neutrals,
generous whitespace, restrained motion, editorial photography, and a display/text
type pairing that works in both Persian and Latin scripts.

The existing Hero videos are the homepage visual anchor and are treated as fixed
brand assets. Motion must respect `prefers-reduced-motion`, and the poster stills
serve as the LCP image and the reduced-motion fallback.

---

## 8. Success criteria for launch

**Functional** — a customer can browse in either language, add to cart, check
out, pay, receive a confirmation, and track the order; staff can operate catalog,
inventory, procurement, orders, and content end to end.

**Quality** — Core Web Vitals in the "good" band on mobile for home, listing, and
product pages; WCAG 2.1 AA on all storefront flows; both locales render correctly
in RTL and LTR with no layout regressions.

**Correctness** — no order is ever created with a client-supplied price; stock
never goes negative; orders are immutable snapshots; every payment state change
is provider-verified.

**Operability** — one-command local environment; automated backups with a
rehearsed restore; structured logs and traces; documented runbooks.
