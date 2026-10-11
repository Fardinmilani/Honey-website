# Phase 17 — Admin Console report

**Completed:** 2026-10-11. **Status:** COMPLETE; ready for human review and commit.
All required Phase 17 gates passed. The 179 new and 78 modified files remain
unstaged in the working tree. Phase 18 is current but not started; no later-phase
implementation was added.

## Files created

- `apps/api/src/http/admin/admin-query.dto.ts`
- `apps/api/src/http/admin/stock-query.dto.ts`
- `apps/api/src/modules/catalog/admin-catalog-query.controller.ts`
- `apps/api/src/modules/identity/admin-identity.controller.ts`
- `apps/api/src/modules/orders/admin-orders.controller.ts`
- `apps/api/src/modules/payments/admin-payments.controller.ts`
- `apps/api/test/phase17.test.ts`
- `apps/api/vitest.config.mjs`
- `apps/web/e2e/admin-console.spec.ts`
- `apps/web/e2e/helpers/admin-auth.ts`
- `apps/web/playwright.admin.config.ts`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/audit/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/catalog/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/catalog/products/[id]/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/customers/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/error.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/inventory/items/[variantId]/[locationId]/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/inventory/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/layout.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/media/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/orders/[id]/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/orders/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/pricing/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/procurement/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/procurement/purchase-orders/[id]/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/procurement/suppliers/[id]/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/settings/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/sourcing/batches/[id]/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/(staff)/sourcing/page.tsx`
- `apps/web/src/app/[locale]/(admin)/admin/sign-in/page.tsx`
- `apps/web/src/app/api/bff/admin/audit/route.ts`
- `apps/web/src/app/api/bff/admin/auth/login/route.ts`
- `apps/web/src/app/api/bff/admin/auth/logout/route.ts`
- `apps/web/src/app/api/bff/admin/auth/step-up/route.ts`
- `apps/web/src/app/api/bff/admin/auth/totp/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/categories/[id]/move/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/categories/[id]/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/categories/[id]/translations/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/categories/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/collections/[id]/archive/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/collections/[id]/publish/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/collections/[id]/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/collections/[id]/translations/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/collections/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/archive/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/categories/[relationId]/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/categories/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/collections/[relationId]/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/collections/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/media/[attachmentId]/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/media/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/publish/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/translations/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/variants/[variantId]/archive/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/variants/[variantId]/default/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/variants/[variantId]/publish/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/variants/[variantId]/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/variants/[variantId]/translations/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/[id]/variants/route.ts`
- `apps/web/src/app/api/bff/admin/catalog/products/route.ts`
- `apps/web/src/app/api/bff/admin/customers/route.ts`
- `apps/web/src/app/api/bff/admin/fulfilment/orders/[orderId]/cancel/route.ts`
- `apps/web/src/app/api/bff/admin/fulfilment/orders/[orderId]/route.ts`
- `apps/web/src/app/api/bff/admin/fulfilment/orders/[orderId]/shipments/route.ts`
- `apps/web/src/app/api/bff/admin/fulfilment/shipments/[shipmentId]/deliver/route.ts`
- `apps/web/src/app/api/bff/admin/fulfilment/shipments/[shipmentId]/dispatch/route.ts`
- `apps/web/src/app/api/bff/admin/inventory/adjustments/route.ts`
- `apps/web/src/app/api/bff/admin/inventory/items/[variantId]/[stockLocationId]/planning/route.ts`
- `apps/web/src/app/api/bff/admin/inventory/items/[variantId]/[stockLocationId]/route.ts`
- `apps/web/src/app/api/bff/admin/inventory/items/route.ts`
- `apps/web/src/app/api/bff/admin/inventory/ledger/[variantId]/route.ts`
- `apps/web/src/app/api/bff/admin/inventory/locations/[id]/route.ts`
- `apps/web/src/app/api/bff/admin/inventory/locations/page/route.ts`
- `apps/web/src/app/api/bff/admin/inventory/locations/route.ts`
- `apps/web/src/app/api/bff/admin/inventory/reconciliation/route.ts`
- `apps/web/src/app/api/bff/admin/me/route.ts`
- `apps/web/src/app/api/bff/admin/media/[assetId]/alt-text/route.ts`
- `apps/web/src/app/api/bff/admin/media/[assetId]/private-url/route.ts`
- `apps/web/src/app/api/bff/admin/media/[assetId]/route.ts`
- `apps/web/src/app/api/bff/admin/media/route.ts`
- `apps/web/src/app/api/bff/admin/media/upload-intents/[uploadId]/complete/route.ts`
- `apps/web/src/app/api/bff/admin/media/upload-intents/route.ts`
- `apps/web/src/app/api/bff/admin/orders/[id]/notes/route.ts`
- `apps/web/src/app/api/bff/admin/orders/[id]/route.ts`
- `apps/web/src/app/api/bff/admin/orders/route.ts`
- `apps/web/src/app/api/bff/admin/payments/[paymentId]/refunds/route.ts`
- `apps/web/src/app/api/bff/admin/payments/orders/[id]/route.ts`
- `apps/web/src/app/api/bff/admin/pricing/coupons/[id]/status/route.ts`
- `apps/web/src/app/api/bff/admin/pricing/coupons/page/route.ts`
- `apps/web/src/app/api/bff/admin/pricing/coupons/route.ts`
- `apps/web/src/app/api/bff/admin/pricing/tax-rates/[id]/route.ts`
- `apps/web/src/app/api/bff/admin/pricing/tax-rates/page/route.ts`
- `apps/web/src/app/api/bff/admin/pricing/tax-rates/route.ts`
- `apps/web/src/app/api/bff/admin/pricing/variant-prices/page/route.ts`
- `apps/web/src/app/api/bff/admin/pricing/variant-prices/route.ts`
- `apps/web/src/app/api/bff/admin/procurement/purchase-orders/[id]/landed-cost/route.ts`
- `apps/web/src/app/api/bff/admin/procurement/purchase-orders/[id]/lines/route.ts`
- `apps/web/src/app/api/bff/admin/procurement/purchase-orders/[id]/receipts/route.ts`
- `apps/web/src/app/api/bff/admin/procurement/purchase-orders/[id]/route.ts`
- `apps/web/src/app/api/bff/admin/procurement/purchase-orders/[id]/transition/route.ts`
- `apps/web/src/app/api/bff/admin/procurement/purchase-orders/route.ts`
- `apps/web/src/app/api/bff/admin/procurement/suppliers/[id]/route.ts`
- `apps/web/src/app/api/bff/admin/procurement/suppliers/route.ts`
- `apps/web/src/app/api/bff/admin/shipping/configuration/route.ts`
- `apps/web/src/app/api/bff/admin/shipping/methods/[id]/route.ts`
- `apps/web/src/app/api/bff/admin/shipping/rates/[id]/route.ts`
- `apps/web/src/app/api/bff/admin/shipping/zones/[id]/route.ts`
- `apps/web/src/app/api/bff/admin/sourcing/allocations/route.ts`
- `apps/web/src/app/api/bff/admin/sourcing/apiaries/[id]/route.ts`
- `apps/web/src/app/api/bff/admin/sourcing/apiaries/[id]/translations/route.ts`
- `apps/web/src/app/api/bff/admin/sourcing/apiaries/page/route.ts`
- `apps/web/src/app/api/bff/admin/sourcing/apiaries/route.ts`
- `apps/web/src/app/api/bff/admin/sourcing/harvest-batches/[id]/allocations/page/route.ts`
- `apps/web/src/app/api/bff/admin/sourcing/harvest-batches/[id]/allocations/route.ts`
- `apps/web/src/app/api/bff/admin/sourcing/harvest-batches/[id]/route.ts`
- `apps/web/src/app/api/bff/admin/sourcing/harvest-batches/route.ts`
- `apps/web/src/app/api/bff/admin/sourcing/production-intake/route.ts`
- `apps/web/src/components/admin/admin-data.tsx`
- `apps/web/src/components/admin/admin-form.tsx`
- `apps/web/src/components/admin/admin-page.tsx`
- `apps/web/src/components/admin/admin-shell.tsx`
- `apps/web/src/components/admin/admin-sign-in.tsx`
- `apps/web/src/components/admin/catalog-forms.tsx`
- `apps/web/src/components/admin/inventory-forms.tsx`
- `apps/web/src/components/admin/media-controls.tsx`
- `apps/web/src/components/admin/order-forms.tsx`
- `apps/web/src/components/admin/pricing-forms.tsx`
- `apps/web/src/components/admin/procurement-forms.tsx`
- `apps/web/src/components/admin/shipping-forms.tsx`
- `apps/web/src/components/admin/sourcing-forms.tsx`
- `apps/web/src/lib/admin/bff.test.ts`
- `apps/web/src/lib/admin/bff.ts`
- `apps/web/src/lib/admin/client.ts`
- `apps/web/src/lib/admin/labels.ts`
- `apps/web/src/lib/admin/navigation.ts`
- `apps/web/src/lib/admin/server.ts`
- `apps/web/src/lib/admin/types.ts`
- `apps/web/src/lib/admin/validation.ts`
- `apps/web/src/styles/admin.css`
- `docs/admin-console-development.md`
- `docs/adr/0043-admin-order-note-permission.md`
- `docs/adr/0044-admin-query-and-browser-boundary.md`
- `docs/adr/0045-admin-refund-retry-idempotency.md`
- `docs/adr/0046-admin-refund-http-compatibility.md`
- `docs/phase17-completion-report.md`
- `packages/backend/src/modules/catalog/application/admin-catalog.service.ts`
- `packages/backend/src/modules/catalog/domain/admin-catalog.ts`
- `packages/backend/src/modules/catalog/infrastructure/prisma-admin-catalog.repository.ts`
- `packages/backend/src/modules/identity/application/admin-identity.service.ts`
- `packages/backend/src/modules/identity/domain/admin-identity.ts`
- `packages/backend/src/modules/identity/infrastructure/prisma-admin-identity.repository.ts`
- `packages/backend/src/modules/media/application/admin-media.service.ts`
- `packages/backend/src/modules/media/domain/admin-media.ts`
- `packages/backend/src/modules/media/infrastructure/prisma-admin-media.repository.ts`
- `packages/backend/src/modules/orders/application/admin-orders.service.ts`
- `packages/backend/src/modules/orders/domain/admin-orders.ts`
- `packages/backend/src/modules/orders/infrastructure/prisma-admin-orders.repository.ts`
- `packages/backend/src/modules/payments/application/admin-payments.service.ts`
- `packages/backend/src/modules/payments/domain/admin-payments.ts`
- `packages/backend/src/modules/payments/infrastructure/prisma-admin-payments.repository.ts`
- `packages/backend/src/modules/pricing/application/admin-pricing.service.ts`
- `packages/backend/src/modules/pricing/domain/admin-pricing.ts`
- `packages/backend/src/modules/pricing/infrastructure/prisma-admin-pricing.repository.ts`
- `packages/backend/src/platform/domain/admin-page.ts`
- `packages/backend/test/helpers/admin-test-database.ts`
- `packages/backend/test/phase17.integration.test.ts`
- `packages/backend/vitest.config.mjs`
- `packages/db/prisma/migrations/20261010120000_phase17_order_note_permission/migration.sql`
- `packages/db/prisma/migrations/20261010123000_phase17_refund_idempotency/migration.sql`
- `packages/db/test/admin-browser-fixture.ts`
- `packages/db/test/admin-test-database.ts`
- `packages/i18n/src/messages/en/admin.ts`
- `packages/i18n/src/messages/fa/admin.ts`
- `scripts/lib/admin-test-storage.mjs`
- `scripts/lib/verify-admin-boundary.mjs`
- `scripts/test-phase17-browser.mjs`
- `scripts/verify-phase17.mjs`

## Files modified

- `.github/workflows/ci.yml` — Add API/PostgreSQL/admin browser and structural gates; preserve existing gates.
- `PLANS.md` — Record phase state and observed Phase 16 commit.
- `apps/api/src/app.module.ts` — Register owned admin query controllers.
- `apps/api/src/http/auth/authorization.guard.ts` — Require fresh STAFF identity and explicit permissions; limit admin mutations per account.
- `apps/api/src/http/auth/authorization.ts` — Declare and verify mandatory STAFF metadata for every admin operation.
- `apps/api/src/http/auth/route-policy-verifier.ts` — Declare and verify mandatory STAFF metadata for every admin operation.
- `apps/api/src/modules/catalog/catalog.controller.ts` — Declare STAFF on admin controller and expose owned typed admin transport seam.
- `apps/api/src/modules/fulfilment/fulfilment.controller.ts` — Declare STAFF on admin controller and expose owned typed admin transport seam.
- `apps/api/src/modules/inventory/inventory.controller.ts` — Declare STAFF on admin controller and expose owned typed admin transport seam.
- `apps/api/src/modules/media/media.controller.ts` — Declare STAFF on admin controller and expose owned typed admin transport seam.
- `apps/api/src/modules/payments/payments.controller.ts` — Keep legacy refund contract and add mandatory keyed console refund operation.
- `apps/api/src/modules/pricing/pricing.controller.ts` — Declare STAFF on admin controller and expose owned typed admin transport seam.
- `apps/api/src/modules/procurement/procurement.controller.ts` — Declare STAFF on admin controller and expose owned typed admin transport seam.
- `apps/api/src/modules/shipping/shipping.controller.ts` — Declare STAFF on admin controller and expose owned typed admin transport seam.
- `apps/api/src/modules/sourcing/sourcing.controller.ts` — Declare STAFF on admin controller and expose owned typed admin transport seam.
- `apps/api/src/openapi/document.ts` — Document safe admin transport operation tags.
- `apps/web/playwright.config.ts` — Run ordinary storefront tests separately from the mandatory isolated admin suite.
- `apps/web/src/app/[locale]/(admin)/admin/layout.tsx` — Activate private dynamic admin layout and remove obsolete phase placeholder.
- `apps/web/src/app/[locale]/(admin)/layout.tsx` — Activate private dynamic admin layout and remove obsolete phase placeholder.
- `apps/web/src/lib/api-client/server.ts` — Support safe server request metadata/cookies for fixed admin BFF transports.
- `apps/web/src/lib/security-headers.test.ts` — Add and verify isolated admin nonce CSP and private noindex/no-store headers.
- `apps/web/src/lib/security-headers.ts` — Add and verify isolated admin nonce CSP and private noindex/no-store headers.
- `apps/web/src/middleware.ts` — Apply fresh nonce and exact configured storage/media origins only to localized admin.
- `docs/adr/README.md` — Index appended Phase 17 architecture decisions.
- `docs/progress.md` — Record implementation, approvals, exact verification and delivery risks.
- `docs/security-model.md` — Document dedicated note permission and admin browser/API security boundaries.
- `package.json` — Add Phase 17 verifier and isolated browser commands; dependencies unchanged.
- `packages/backend/src/modules/catalog/catalog.module.ts` — Register and export the module-owned admin query or shared bounded-page seam.
- `packages/backend/src/modules/catalog/index.ts` — Register and export the module-owned admin query or shared bounded-page seam.
- `packages/backend/src/modules/fulfilment/infrastructure/smtp-fulfilment-notification.adapter.ts` — Make concurrent notification identity creation atomic; retain fenced delivery lease.
- `packages/backend/src/modules/identity/domain/identity.ts` — Add note vocabulary, module-owned query providers and atomic audit write seam.
- `packages/backend/src/modules/identity/domain/ports.ts` — Add note vocabulary, module-owned query providers and atomic audit write seam.
- `packages/backend/src/modules/identity/identity.module.ts` — Add note vocabulary, module-owned query providers and atomic audit write seam.
- `packages/backend/src/modules/identity/index.ts` — Add note vocabulary, module-owned query providers and atomic audit write seam.
- `packages/backend/src/modules/identity/infrastructure/prisma-audit.writer.ts` — Add note vocabulary, module-owned query providers and atomic audit write seam.
- `packages/backend/src/modules/identity/infrastructure/prisma-identity.repository.ts` — Add note vocabulary, module-owned query providers and atomic audit write seam.
- `packages/backend/src/modules/inventory/application/inventory.service.ts` — Add bounded location/filter queries and owned server-derived available-to-sell detail.
- `packages/backend/src/modules/inventory/domain/inventory.ts` — Add bounded location/filter queries and owned server-derived available-to-sell detail.
- `packages/backend/src/modules/inventory/infrastructure/prisma-inventory.repository.ts` — Add bounded location/filter queries and owned server-derived available-to-sell detail.
- `packages/backend/src/modules/media/index.ts` — Register and export the module-owned admin query or shared bounded-page seam.
- `packages/backend/src/modules/media/media.module.ts` — Register and export the module-owned admin query or shared bounded-page seam.
- `packages/backend/src/modules/orders/index.ts` — Register and export the module-owned admin query or shared bounded-page seam.
- `packages/backend/src/modules/orders/orders.module.ts` — Register and export the module-owned admin query or shared bounded-page seam.
- `packages/backend/src/modules/payments/application/payments.service.ts` — Add durable staff refund retry key and safe read projection/provider registration.
- `packages/backend/src/modules/payments/domain/payments.ts` — Add durable staff refund retry key and safe read projection/provider registration.
- `packages/backend/src/modules/payments/index.ts` — Add durable staff refund retry key and safe read projection/provider registration.
- `packages/backend/src/modules/payments/infrastructure/prisma-payments.repository.ts` — Add durable staff refund retry key and safe read projection/provider registration.
- `packages/backend/src/modules/payments/payments.module.ts` — Add durable staff refund retry key and safe read projection/provider registration.
- `packages/backend/src/modules/pricing/application/pricing.service.ts` — Add recent TOTP price guard, safe paging and transactional tax audit seam.
- `packages/backend/src/modules/pricing/index.ts` — Add recent TOTP price guard, safe paging and transactional tax audit seam.
- `packages/backend/src/modules/pricing/infrastructure/prisma-pricing.repository.ts` — Add recent TOTP price guard, safe paging and transactional tax audit seam.
- `packages/backend/src/modules/pricing/pricing.module.ts` — Add recent TOTP price guard, safe paging and transactional tax audit seam.
- `packages/backend/src/modules/shipping/infrastructure/prisma-shipping-settings.repository.ts` — Execute transaction advisory lock without deserializing PostgreSQL void.
- `packages/backend/src/modules/sourcing/application/sourcing.service.ts` — Add bounded apiary/allocation page seams without changing sourcing invariants.
- `packages/backend/src/modules/sourcing/domain/sourcing-repository.port.ts` — Add bounded apiary/allocation page seams without changing sourcing invariants.
- `packages/backend/src/modules/sourcing/infrastructure/prisma-sourcing.repository.ts` — Add bounded apiary/allocation page seams without changing sourcing invariants.
- `packages/backend/src/platform/index.ts` — Register and export the module-owned admin query or shared bounded-page seam.
- `packages/backend/test/identity.integration.test.ts` — Add real refund replay proofs or adapt immutable migration-backed identity fixture setup.
- `packages/backend/test/payments.integration.test.ts` — Add real refund replay proofs or adapt immutable migration-backed identity fixture setup.
- `packages/backend/test/payments.test.ts` — Add real refund replay proofs or adapt immutable migration-backed identity fixture setup.
- `packages/contracts/openapi.json` — Regenerate documented HTTP contract and TypeScript transport types.
- `packages/contracts/src/generated/api.ts` — Regenerate documented HTTP contract and TypeScript transport types.
- `packages/db/prisma/schema.prisma` — Add nullable refund idempotency fields and unique payment/key pair.
- `packages/db/seed/data.ts` — Add stable note/price grants without widening SUPPORT shipping or finance access.
- `packages/db/test/run-integration.ts` — Verify exact stable grants and forward refund constraints in PostgreSQL.
- `packages/i18n/src/index.ts` — Add strict FA/EN admin message namespace, types and exact parity expectations.
- `packages/i18n/src/messages/en/index.ts` — Add strict FA/EN admin message namespace, types and exact parity expectations.
- `packages/i18n/src/messages/fa/index.ts` — Add strict FA/EN admin message namespace, types and exact parity expectations.
- `packages/i18n/src/messages/types.ts` — Add strict FA/EN admin message namespace, types and exact parity expectations.
- `packages/i18n/test/parity.test.mjs` — Add strict FA/EN admin message namespace, types and exact parity expectations.
- `scripts/verify-phase10.mjs` — Replace obsolete admin-absence checks with positive STAFF/permission boundaries and later-phase absence.
- `scripts/verify-phase11.mjs` — Replace obsolete admin-absence checks with positive STAFF/permission boundaries and later-phase absence.
- `scripts/verify-phase12.mjs` — Replace obsolete admin-absence checks with positive STAFF/permission boundaries and later-phase absence.
- `scripts/verify-phase13.mjs` — Replace obsolete admin-absence checks with positive STAFF/permission boundaries and later-phase absence.
- `scripts/verify-phase14.mjs` — Replace obsolete admin-absence checks with positive STAFF/permission boundaries and later-phase absence.
- `scripts/verify-phase15.mjs` — Replace obsolete admin-absence checks with positive STAFF/permission boundaries and later-phase absence.
- `scripts/verify-phase16.mjs` — Replace obsolete admin-absence checks with positive STAFF/permission boundaries and later-phase absence.
- `scripts/verify-phase7.mjs` — Replace obsolete admin-absence checks with positive STAFF/permission boundaries and later-phase absence.

## Decisions made

- [ADR-0043](adr/0043-admin-order-note-permission.md): human-approved `order:note`
  grants for OWNER, ADMIN, ORDER_MANAGER and SUPPORT. SUPPORT retains exactly
  `order:read`, `customer:read`, `order:note`; no shipping or financial grants.
- [ADR-0044](adr/0044-admin-query-and-browser-boundary.md): owning modules supply
  bounded admin queries and atomic audit writes. The human-approved admin CSP
  uses fresh script nonces and exact configured upload/media origins.
- [ADR-0045](adr/0045-admin-refund-retry-idempotency.md) and
  [ADR-0046](adr/0046-admin-refund-http-compatibility.md): durable payment-scoped
  refund retry keys on a new console operation; preserve the legacy HTTP contract.
- No dependency added or upgraded. The dependency lock is unchanged. Existing
  design tokens, system fonts, semantic CSS and the UI/UX Pro Max backoffice
  guidance define the restrained operational layout. No animation package added.
- Two forward migrations add the stable note grant and nullable refund key/hash
  with paired-field validation and payment/key uniqueness. Applied locally and
  in isolated test databases. Existing migration files remain immutable. The note
  migration revokes affected active STAFF sessions; those staff must sign in again.
- Existing Phase 7 and 10–16 absence assertions now verify the implemented admin
  security boundary and continued Phase 18 absence. Existing business, authorization,
  ledger, public vocabulary and deployment assertions remain active.
- Real browser testing uses disposable PostgreSQL databases, unique Redis cache
  namespaces and a separate temporary MinIO instance with one exact browser
  origin. It does not reset the developer database or expand existing MinIO CORS.
  The root `pnpm test:e2e` command now runs the unchanged full storefront suite
  through this isolated fixture, keeping its results independent of old local
  reservations and keeping test writes out of the developer's database.
- Inventory detail returns exact available-to-sell from its owning service,
  respecting sellable locations. Clients do not calculate authoritative balances.
- Shipping settings use an executable transaction lock without deserializing
  PostgreSQL's `void` lock result. Real PostgreSQL verifies all three settings
  writes, atomic audits and rejection of overlapping zones/rates.
- Concurrent fulfilment email delivery uses the existing unique identity with
  atomic insert-or-read before acquiring the existing fenced lease. The real SMTP
  regression verifies delivery ownership; no new notification surface is added.
- API/backend test runners allow two concurrent test workers to bound full Nest
  startup, database migration and crypto workloads. Every test, timeout, hook and
  assertion remains unchanged; concurrency proofs inside suites still compete.
  Earlier unbounded runs timed out under resource pressure. This runner setting
  addresses execution scheduling rather than changing the tested behavior.

### Routes and capability matrix

There are 18 localized pages, 14 STAFF API controllers, 101 explicit permission
operations and 88 concrete BFF route files. All unsafe transports enforce CSRF;
API session authentication rereads current permissions on every request. BFF
route files declare fixed upstream paths and method-specific schema allowlists.
There is no catch-all proxy or direct web access to backend/database packages.
The exact endpoint, body/query, permission and idempotency inventory is in
[`admin-console-development.md`](admin-console-development.md#exact-transport-matrix).

| Screen | FA route | EN route | API / required permission | Writes and step-up | Browser proof |
|---|---|---|---|---|---|
| Sign in | `/fa/admin/sign-in` | `/en/admin/sign-in` | Existing login, staff TOTP, logout | Password, TOTP enrollment/confirmation | Both locales, anonymous privacy, real enrollment, customer rejected |
| Overview | `/fa/admin` | `/en/admin` | `/v1/me`; STAFF session | Permission-derived working navigation | Real staff login and logout |
| Catalog | `/fa/admin/catalog` | `/en/admin/catalog` | Catalog product/taxonomy queries; `catalog:read` | Product, category, collection writes; `catalog:write/publish` | Draft creation; real list and filters |
| Product | `/fa/admin/catalog/products/[id]` | `/en/admin/catalog/products/[id]` | Existing catalog detail; `catalog:read` | Both translations, variants/defaults, media and taxonomy relations, publication | FA/EN translation gate, variants, media and public product |
| Media | `/fa/admin/media` | `/en/admin/media` | Media library/asset; `content:write` | Intent, direct upload, server completion, alt text, private preview, safe delete | Real MinIO upload/processing; unsupported file rejected |
| Pricing | `/fa/admin/pricing` | `/en/admin/pricing` | Bounded prices, coupons, taxes; `pricing:read` | Price requires recent TOTP; coupon state is optimistic; typed tax writes | Price denied then accepted after step-up, authoritative public cart, coupon state |
| Inventory | `/fa/admin/inventory` | `/en/admin/inventory` | Paged item/location queries; `inventory:read` | Locations; `inventory:adjust` | Real balances and location reads |
| Item / ledger | `/fa/admin/inventory/items/[variantId]/[locationId]` | `/en/admin/inventory/items/[variantId]/[locationId]` | Owned exact balance/ATS and ledger; `inventory:read` | Version-checked adjustment, reason/note, planning | Confirmed adjustment and persisted audit; receipt changes balance/ledger |
| Sourcing | `/fa/admin/sourcing` | `/en/admin/sourcing` | Apiary/batch pages; `inventory:read` | Apiary and translations, harvest batch; `inventory:adjust` | Real supplied batch for receipt |
| Harvest batch | `/fa/admin/sourcing/batches/[id]` | `/en/admin/sourcing/batches/[id]` | Batch and bounded allocation page; `inventory:read` | Allocation and own-production intake; `inventory:adjust` | Page read; existing Phase 11 real PostgreSQL domain invariants |
| Procurement | `/fa/admin/procurement` | `/en/admin/procurement` | Supplier/PO pages; `procurement:read` | Create supplier/PO; `procurement:write` | Real supplier and PO creation |
| Supplier | `/fa/admin/procurement/suppliers/[id]` | `/en/admin/procurement/suppliers/[id]` | Supplier detail; `procurement:read` | Typed edit with immutable stored code | Real supplier edit |
| Purchase order | `/fa/admin/procurement/purchase-orders/[id]` | `/en/admin/procurement/purchase-orders/[id]` | Detail and landed cost; `procurement:read` | Draft lines, valid transitions, keyed goods receipt | Submitted → confirmed → receipt; accepted stock and ledger |
| Orders | `/fa/admin/orders` | `/en/admin/orders` | Staff bounded filters; `order:read` | None in the list | Real order reads |
| Order | `/fa/admin/orders/[id]` | `/en/admin/orders/[id]` | Safe frozen order, notes, fulfilment and payment projection; `order:read` | `order:note/write/cancel/refund`; refunds require recent TOTP and retry key | SUPPORT plain-text XSS note, direct bypass denied, pre-shipment cancel, dispatch, partial refund |
| Customers | `/fa/admin/customers` | `/en/admin/customers` | Exact email/UUID lookup; `customer:read` | Audited lookup; order history also requires `order:read` | Exact real customer result, no authentication internals |
| Settings | `/fa/admin/settings` | `/en/admin/settings` | Shipping configuration; `settings:read`; tax uses pricing permission | Typed zone/method/rate and tax forms | Real zone create and persisted shipping audit |
| Audit | `/fa/admin/audit` | `/en/admin/audit` | Bounded actor/action/subject/date filters; `audit:read` | Read-only | Persisted inventory/shipping events; privacy integration |

### Authorization, finance, privacy and UX

The new HTTP surface has 20 operations relative to the Phase 16 contract:

| Method | New API path |
|---|---|
| GET | `/v1/admin/audit` |
| GET | `/v1/admin/catalog/categories` |
| GET | `/v1/admin/catalog/collections` |
| GET | `/v1/admin/catalog/products` |
| GET | `/v1/admin/customers` |
| GET | `/v1/admin/inventory/locations/page` |
| GET | `/v1/admin/media` |
| GET | `/v1/admin/orders` |
| GET | `/v1/admin/orders/{id}` |
| GET, POST | `/v1/admin/orders/{id}/notes` |
| POST | `/v1/admin/payments/{paymentId}/refund-requests` |
| GET | `/v1/admin/payments/orders/{id}` |
| PATCH | `/v1/admin/pricing/coupons/{id}/status` |
| GET | `/v1/admin/pricing/coupons/page` |
| PUT | `/v1/admin/pricing/tax-rates/{id}` |
| GET | `/v1/admin/pricing/tax-rates/page` |
| GET | `/v1/admin/pricing/variant-prices/page` |
| GET | `/v1/admin/sourcing/apiaries/page` |
| GET | `/v1/admin/sourcing/harvest-batches/{id}/allocations/page` |

| Tested principal or condition | Observed result |
|---|---|
| Anonymous | API queries reject with 401; private admin pages lead to sign-in |
| CUSTOMER, including a customer principal carrying the requested permission | API rejects with 403; real customer login cannot enter the admin workspace |
| STAFF without the declared permission | Each of the 15 new query entries in the API matrix rejects with 403 |
| STAFF with the declared permission | Valid query reaches its owning service; invalid limit/cursor rejects with 422 |
| OWNER | Real login, enrollment, reads and authorized operational writes succeed; database seed verifies all 24 grants |
| SUPPORT | Exact three seeded grants; note succeeds; shipment, cancellation, refund and pricing bypasses reject |
| Revoked session or removed permission | Next API request returns 401 or 403 respectively |
| Missing/mismatched CSRF or forbidden request fields | API/BFF reject before the domain mutation |
| Missing recent step-up | Price/refund are denied; fresh real TOTP enables the authorized operation |
| Repeated mutation by the same staff account | Configured account limit returns 429; a different account retains its own limit |

The database test also verifies the complete seven-role vocabulary and stable
seed IDs across two runs. Named-role browser workflows cover OWNER, SUPPORT and
CUSTOMER; the API matrix tests explicit permissions rather than assuming role
names authorize requests.

- Hidden navigation and page guards are UX checks. Every admin API operation
  requires fresh STAFF authentication plus an explicit permission. Anonymous,
  customer and wrong-permission requests are tested directly. SUPPORT can write
  notes and cannot create shipments, cancel or refund. Account-based mutation
  limiting returns 429 without limiting ordinary table navigation. Revoked
  sessions/permissions are denied on the next API request.
- Existing staff idle/absolute TTL, lockout, TOTP replay protection, cookie flags,
  server-owned `/me`, and five-minute step-up policy are reused. Enrollment secrets
  exist only during enrollment; credentials do not enter browser storage, trace,
  video, screenshots, action logs or client bundles. Credential inputs are removed
  before failure artifacts are captured. No second identity system is introduced.
- CSRF and strict origin checks protect BFF writes; API CSRF remains authoritative.
  Unsafe requests reject undeclared fields and malformed identifiers. Client
  totals, stock, order transitions and payment states are rejected or derived by
  existing authoritative services. Admin price configuration and bounded refund
  amount selection remain explicitly authorized domain operations.
- Real partial-refund replay/concurrency tests prove one keyed domain/provider
  effect and immutable order money. Refunds do not restock. Provider capabilities,
  remaining refundable cap and verified outcomes remain server-owned. The UI
  does not render a refund action for unsupported providers.
- Internal notes are bounded plain text. React renders the tested HTML-shaped
  note literally; no image or script is created. Publication requires enabled
  FA/EN product/variant translations and the existing catalog gate. An incomplete
  product returns `409 PRODUCT_PUBLICATION_INCOMPLETE`, then publishes after its
  actual required records are complete.
- Media selection checks supported MIME type and configured byte limits before
  starting an intent. Server authorization, actual-byte inspection, processing,
  checksums, visibility, alt text and deletion/reference policy remain intact.
  Private URLs are short-lived and never logged. Only synthetic test media was
  uploaded; no Hero file was copied to object storage or the media library.
- Exact customer lookup is audited by count without the query value. Staff users
  are excluded; phone numbers are masked. No credential, session, reset token or
  TOTP fields are projected. Audit shows safe identity/action/subject/request/time
  metadata and omits raw before/after JSON and IPs.
- Settings expose existing shipping and tax capabilities through typed forms.
  No credentials, provider secrets, environment values, feature flags, arbitrary
  JSON editor or secret settings are exposed. CSV export is omitted because no
  existing domain capability exists; CSV formula-injection testing is inapplicable.
- FA/EN catalogs have strict key parity. Logical CSS, language/direction metadata,
  isolated SKU/UUID/email/order text, locale-formatted numbers, exact integer money
  and explicit UTC dates preserve meaning. Forms have labels, validation feedback,
  error focus, real pending states, dirty-navigation confirmation and financial
  confirmation/step-up dialogs. Controls and disclosure summaries have 44px targets.
- All admin pages are dynamically rendered, private/no-store, noindex/nofollow
  and excluded from public sitemap/canonical content. Admin nonce CSP has no
  script `unsafe-inline` or `unsafe-eval`. The storefront's policy is unchanged.
- No analytics, bulk import/export, editorial CMS, reviews, notification editor,
  worker dashboard or other Phase 18–20 work was added. No marketplace identity,
  supplier exposure on the storefront, or prohibited product claim was introduced.

## Unresolved decisions

No Phase 17 human decision is pending. Note permission and admin CSP approvals
are recorded in [`progress.md`](progress.md). Existing production PSP, statutory
invoice, tax applicability, indexing domain and licensed-font decisions retain
their existing phase/launch boundaries and do not broaden this implementation.

## Risks

- A prior full browser run against the developer's existing database observed
  `INVENTORY_RESERVATION_DRIFT` and failed 50 of 101 cases. The database was not
  reset or repaired to hide this finding. The unchanged full suite passed against
  an isolated migrated/seeded database. Existing development inventory state needs
  separate investigation through its owning domain before reusing that dataset.
- Per-account admin mutation limits use the existing per-process store. A future
  deployment with multiple API replicas must preserve its intended aggregate
  limit; this phase adds no deployment or distributed limiter redesign.
- After an interrupted provider call, a keyed in-progress refund is not blindly
  reissued. It needs existing operational/provider reconciliation. The legacy
  API operation keeps its pre-existing partial-refund retry limitations.
- Domain reference fields use validated identifiers. There is no arbitrary entity
  browser or invented cross-module picker. Shipping configuration keeps the
  existing supported nested read seam; other operational lists are cursor-bounded.
- Runtime emitted the existing Next middleware deprecation and PostgreSQL client
  parallel-query warning during tests. Neither was suppressed or converted into
  a passing assertion. No opportunistic framework/library upgrade was performed.
  The full storefront run also logged `The destination stream closed early`
  while navigation cases completed; all 101 assertions passed. This output is
  retained in the verification log and was not hidden by changing browser checks.

## Acceptance checklist

| Criterion | Observed status |
|---|---|
| Every Phase 17 deliverable has a functional authorized screen | Met; route matrix above |
| API authorization survives client-guard bypass | Met; direct API/BFF negative matrices and real SUPPORT test |
| STAFF session, TOTP enrollment/login/step-up and logout work | Met; isolated browser and existing identity tests |
| Privileged writes leave persisted audit/ledger records | Met; PostgreSQL and browser proofs |
| Missing locale translations prevent publication | Met; 409 gate followed by valid publication |
| Media processing and private/public policies remain real | Met; real MinIO tests and browser upload |
| Inventory, sourcing, procurement, order money and provider rules remain authoritative | Met; existing real domain regression plus browser operations |
| FA/EN, RTL/LTR, responsive layout and accessibility | Met; both locales, five viewport widths, zero serious/critical axe findings |
| No fake controls, forbidden concepts/claims or Phase 18 entry points | Met; structural/public vocabulary checks and functional workflows |
| Hero, historical migrations, dependency lock, secrets, .env and staging integrity | Met; exact scope and results below |
| All required lint/type/build/test, contract, DB, Docker and browser gates | Met; actual commands and exact test counts below |
| Documentation complete; no staging, commit, tag, push or next-phase implementation | Met; Phase 17 COMPLETE, Phase 18 CURRENT but NOT STARTED; changes unstaged |

## Verification results

<!-- verification-results -->

The final root test run used the local PostgreSQL connection and
`MEDIA_MINIO_TESTS=true`. All environment-dependent cases ran against real
services. Exact results, including zero-test packages, are:

| Final suite | Passed | Failed | Skipped |
|---|---|---|---|
| Boundary checker | 22 | 0 | 0 |
| Backend — 39 files | 248 | 0 | 0 |
| API — 13 files | 74 | 0 | 0 |
| Web — 11 files | 57 | 0 | 0 |
| Worker — 8 files | 33 | 0 | 0 |
| i18n | 29 | 0 | 0 |
| UI | 5 | 0 | 0 |
| Contracts | 3 | 0 | 0 |
| Core / utils | 0 / 0 | 0 / 0 | 0 / 0 |
| Admin Playwright | 10 | 0 | 0 |
| Full existing storefront Playwright | 101 | 0 | 0 |

The database integration runner is a separate pass/fail verification: 75 tables,
31 enums, 35 PostgreSQL rejection proofs and identical seed fingerprints across
two runs. It also verifies indexed foreign keys, the seven-role vocabulary,
OWNER's 24 permissions and SUPPORT's exact three permissions.

| Command or concrete check actually run | Observed result |
|---|---|
| `pnpm format:check` | All checked files match Prettier |
| `pnpm lint` | Exit 0; 10 workspace tasks successful |
| `pnpm boundaries` | Exit 0; module/package boundaries valid |
| `pnpm typecheck` | Exit 0; 17 workspace tasks successful |
| `pnpm test` with real-infrastructure environment | Exit 0; 17 tasks successful; exact counts above |
| `pnpm build` | Exit 0; 10 tasks successful; actual API, web and worker outputs built |
| `pnpm stylelint` | Exit 0; no CSS warning accepted |
| `pnpm i18n:validate` | Exit 0; both message catalogs valid |
| `pnpm db:validate`, `pnpm db:generate`, `pnpm db:migrate:status` | Exit 0; schema/client valid; all 12 migrations applied |
| `pnpm api:openapi:check`, `pnpm api:openapi:lint`, `pnpm api:openapi:forbidden` | Exit 0; contract and generated types current; lint and public-field reachability checks pass |
| `pnpm api:openapi:breaking --base-ref HEAD` | Exit 0; no breaking change against the committed Phase 16 contract |
| `pnpm phase4:verify` through `pnpm phase17:verify` | All 14 commands exit 0; Phase 17 confirms 14 STAFF controllers, 101 explicit permission operations, 88 fixed BFF route files and 8 unchanged Hero assets |
| `pnpm phase17:test:e2e` | Exit 0; real PostgreSQL/Redis/MinIO, 10 passed, 0 failed, 0 skipped |
| `pnpm test:e2e --workers=2` | Exit 0; unchanged full storefront suite, 101 passed, 0 failed, 0 skipped; performance thresholds included |
| Axe in those browser runs | 5 admin and 17 storefront scans; zero serious/critical violations; minor/moderate findings are not represented as zero |
| Responsive and visual review | Admin 360, 390, 768, 1280 and 1920px; desktop EN and mobile FA screenshots inspected; existing storefront visual/Hero regressions pass |
| `pnpm docker:verify` | Exit 0; PostgreSQL, Redis, MinIO and Mailpit healthy; extensions, SMTP, buckets and anonymous policies verified |
| `pnpm api:docker:build`, `pnpm web:docker:build`, `pnpm worker:docker:build` | All exit 0; final images built from this phase's source |
| Final image smoke | Exit 0; all three run as UID 1000 and contain no `.env`; API readiness 200, anonymous admin 401/private/no-store; worker real Redis readiness; API/worker contain no Hero directory |
| `pnpm worker:smoke:sigterm` | Exit 0; active sitemap job completed, then worker exited 0 |
| Hero status, diff and Git object hashes | Status/diff empty; all 8 file hashes equal HEAD |
| Local MinIO Hero-name scan | Both configured buckets scanned, 1 object inspected, 0 Hero-name matches |
| Source and browser-output secret scan | 296 files; 0 recognized secret patterns, 0 private server-variable names in client output, 0 configured-value matches |
| `git diff --check`, Hero status/diff, `git ls-files .env`, `git diff --cached --name-only` | Exit 0; no whitespace errors; Hero output, tracked `.env` list and staging list all empty |
| `.env`, lock, old migrations and Git | Existing `.env` is ignored/untracked; lock and all historical migrations unchanged; staging empty; HEAD remains `5ff4e90`; no stage/commit/tag/push |

Configured-secret comparison had zero qualifying secret values in this local
environment. The source/client pattern and private-variable checks did run;
this does not claim a comparison against unavailable production secrets.
Local `.env` metadata still records its pre-existing 2026-08-05 modification
date; it was not rewritten or included in any executable image.

Earlier runs are retained as findings: the old developer-database browser run
had 51 passed, 50 failed and 0 skipped due to reservation drift. The unchanged
isolated suite subsequently passed, including the final root invocation above.
An API run while images built had 65 passed, 8 failed and 1 skipped; the skip
required `DATABASE_URL`. An unbounded backend
run had one test timeout and one cleanup-hook timeout. Bounded runner workers
resolved resource pressure while retaining every timeout and assertion. Earlier
environment-gated backend cases had 5 skips: one PostgreSQL platform case needed
`DATABASE_URL`, and two media plus two storage cases needed
`MEDIA_MINIO_TESTS=true`. The final full run has zero skipped cases. No required Phase 17 gate is
being replaced by a mock or an unexecuted assertion.

The optional CSV export is not implemented because no existing seam exists;
CSV formula-injection verification is consequently inapplicable. No cloud
deployment or production PSP credential check was requested or executed. No
test, validation, permission, security header or CI gate was weakened.
