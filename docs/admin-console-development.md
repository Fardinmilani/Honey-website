# Phase 17 — Admin Console

## Capability audit (2026-10-10)

Status: COMPLETE on 2026-10-11; all required Phase 17 gates passed. Changes remain
in the working tree for human review; Phase 18 is current but not started.
Preflight found a clean working tree and staging area, untracked `.env`, and
unchanged Hero media. Phase 16 is present in commit `5ff4e90`; its progress-table
wording was corrected to match the observed Git history in this phase.

Admin pages use `/fa/admin/**` and `/en/admin/**`. All protected operations retain
API-side staff-session and explicit-permission checks, CSRF on writes, existing
domain validation, and privileged-action auditing. Reads are private/no-store.
UI route guards and navigation are convenience checks only.

| Screen | Existing API / service | Permission | Step-up | Audit / CSRF | Pagination and gap |
|---|---|---|---|---|---|
| Catalog | `/v1/admin/catalog`: product detail, product/variant translations, publication, taxonomy writes, media attachment | `catalog:read`, `catalog:write`, `catalog:publish` | None currently required | Existing mutations audit; writes use API CSRF | Missing bounded product list and admin taxonomy reads |
| Media | `/v1/admin/media`: upload intent, completion, asset detail, alt text, private URL, safe deletion | `content:write` | None | Existing media auditing and API CSRF | Missing bounded asset-library query |
| Pricing | `/v1/admin/pricing`: variant prices, coupons, tax rates | `pricing:read`, `pricing:write` | Price creation needs existing identity step-up seam | Existing mutation audit and API CSRF | Existing list methods need bounded paging |
| Inventory | `/v1/admin/inventory`: locations, items, planning, ledger, adjustments, reconciliation | `inventory:read`, `inventory:adjust` | None currently required | Existing append-only ledger/audit; API CSRF | Item and ledger cursors exist; retain optimistic version validation |
| Sourcing | `/v1/admin/sourcing`: apiaries, harvest batches, allocations, own-production intake | `inventory:read`, `inventory:adjust` | None currently required | Existing mutation audit; API CSRF | Preserve current batch/intake invariants and bounded queries |
| Procurement | `/v1/admin/procurement`: suppliers, purchase orders, transitions, receipts, landed cost | `procurement:read`, `procurement:write` | None currently required | Existing audit; API CSRF; receipt idempotency key | Cursor lists exist; receipts remain transactional inventory inbound |
| Orders | `/v1/admin/fulfilment`: staff detail, shipment creation, dispatch, delivery, pre-shipment cancellation; `/v1/admin/payments/:paymentId/refunds` | `order:read`, `order:write`, `order:cancel`, `order:refund` | Refund already requires identity step-up | Existing audit, CSRF and shipment/refund idempotency | Missing bounded staff order list, notes, and safe payment capability projection |
| Customers | Identity owns customer records; Orders owns customer order history | `customer:read`; history also `order:read` | None | Privileged lookup must audit | Missing bounded safe customer lookup; no credentials/session secrets in DTOs |
| Settings | `/v1/admin/shipping/configuration`, zones/methods/rates; pricing tax-rate seam | `settings:read`, `settings:write`; tax uses existing pricing permissions | Retain existing policy | Existing settings audit and API CSRF | Expose supported shipping/tax configuration only; no arbitrary JSON/feature-flag editor |
| Audit | Identity owns audit records | `audit:read` | None | Read-only, staff-only, private/no-store | Missing bounded filtered audit query; omit raw secret-bearing metadata |
| Staff sign-in / step-up | `/v1/auth/login`, `/v1/auth/staff/totp/confirm`, `/v1/me`, `/v1/me/step-up`, logout | Existing identity policies | Existing TOTP/session TTL | Existing auth audit and CSRF | Explicit BFF routes and localized UI missing; no second authentication system |

The new transport/query seams belong to their existing backend modules. No admin
repository may reach into another module's tables. No generic catch-all proxy,
database console, analytics surface, Phase 18 CMS, or worker dashboard is added.
CSV order export has no existing backend capability and is omitted.

## Accepted note-permission decision

The human approved a dedicated `order:note` permission on 2026-10-10. It is granted
to OWNER, ADMIN, ORDER_MANAGER, and SUPPORT. SUPPORT retains read and note access
without `order:write`, cancellation, refund, or shipment permissions. Persisted
seed IDs must remain stable; deployed databases require a forward migration.
Notes are bounded plain text, internal only, and audited.

## Accepted browser-policy proposal

Current web CSP is global: `connect-src 'self'` blocks the required browser upload
to MinIO/S3, and `script-src 'self' 'unsafe-inline'` conflicts with the prompt's
admin script policy. The proposed change is restricted to localized admin pages:

- Add only the validated, server-configured `S3_BROWSER_ENDPOINT` origin to
  `connect-src` for direct presigned uploads. No wildcard or client-supplied origin.
- Add only the configured `PUBLIC_MEDIA_BASE_URL` origin to admin image/media
  sources for actual asset previews. Keep private signed URLs out of logs.
- Replace admin script `unsafe-inline` with a fresh per-request nonce, propagated
  to Next.js rendering. Do not add `unsafe-eval` or relax frame/object/form rules.
- Keep existing storefront policy, HTTPS/HSTS behavior, session cookies, CSRF,
  explicit MinIO CORS origins, and all other security headers intact.
- Test nonce uniqueness, invalid-origin rejection, real upload behavior, and
  sign-in/step-up hydration under the production admin CSP.

AGENTS.md §4.6 requires explicit human approval for widening a security policy.
The human approved this exact scoped proposal on 2026-10-10; approval is also
recorded in `progress.md`.

## UI direction

UI/UX Pro Max's verified “backoffice admin minimal dense” result supports a
minimal operational shell, clear tables, visible labels, restrained emphasis,
and compact spacing. Existing repository tokens, system fonts, and semantic CSS
classes remain authoritative. Both locales receive complete UI copy. Logical
properties, bidi isolation, keyboard focus, 44px controls, inline validation,
real pending/error/empty states, and reduced-motion support are required.

## Verification

The exact results and file inventory are recorded in
[`phase17-completion-report.md`](phase17-completion-report.md). All required
checks completed successfully on 2026-10-11. The capability
audit above describes the pre-implementation gaps; module-owned bounded query
seams now close them. A skipped or unavailable check is not a pass.

### Local review

Follow the existing [identity setup](identity-development.md#local-setup) and
safe `.env.example` configuration. The optional seeded owner requires an
externally generated Argon2id `SEED_STAFF_PASSWORD_HASH`; no plaintext password
or shared admin credential was added. Keep the web origin consistent with
`API_ALLOWED_ORIGINS` and `MEDIA_UPLOAD_ALLOWED_ORIGINS`. Storage upload and
preview origins must match `S3_BROWSER_ENDPOINT` and `PUBLIC_MEDIA_BASE_URL`.

Start `pnpm api:dev` and `pnpm --filter @honey/web dev` in separate terminals,
then open `http://localhost:3000/fa/admin/sign-in` or
`http://localhost:3000/en/admin/sign-in`. First staff sign-in guides authenticator
enrollment; later sign-ins require its current code. Price and refund writes
request a fresh code through the existing step-up service. The note migration
revokes affected prior STAFF sessions, so existing staff must sign in again.

`pnpm phase17:test:e2e` exercises admin workflows against disposable PostgreSQL,
Redis cache namespaces and temporary MinIO storage. `pnpm test:e2e --workers=2`
runs the complete existing storefront suite against its own disposable database.
Neither command resets the developer database. Set the real database connection
and `MEDIA_MINIO_TESTS=true` when running `pnpm test` to include every
environment-dependent integration case.

## Exact transport matrix

Every admin route below declares STAFF at its controller. API CSRF applies to all unsafe requests; reads are private/no-store. Permissions come from controller metadata, not role names. Existing write services remain responsible for their audit and resource/state checks. Refund and price writes use the identity step-up TTL.

| Method | Endpoint | Permission | Idempotency key | Body / query schema |
|---|---|---|---|---|
| GET | `/v1/admin/catalog/products` | 'catalog:read' | Existing domain state/idempotency policy | Query: cursor, limit, q, status |
| GET | `/v1/admin/catalog/categories` | 'catalog:read' | Existing domain state/idempotency policy | Query: cursor, limit |
| GET | `/v1/admin/catalog/collections` | 'catalog:read' | Existing domain state/idempotency policy | Query: cursor, limit |
| POST | `/v1/admin/catalog/products` | 'catalog:write' | Existing domain state/idempotency policy | Body: sku, brandLine, honeyVarietal, floralSources, originRegion, originAltitudeBand, harvestSeason, sourcingType, apiaryId, sortWeight |
| GET | `/v1/admin/catalog/products/:id` | 'catalog:read' | Existing domain state/idempotency policy | No body fields |
| PUT | `/v1/admin/catalog/products/:id` | 'catalog:write' | Existing domain state/idempotency policy | Body: sku, brandLine, honeyVarietal, floralSources, originRegion, originAltitudeBand, harvestSeason, sourcingType, apiaryId, sortWeight |
| PUT | `/v1/admin/catalog/products/:id/translations` | 'catalog:write' | Existing domain state/idempotency policy | Body: locale, name, slug, shortDescription, description, tastingNotes, pairingSuggestions, storyHtml, metaTitle, metaDescription |
| POST | `/v1/admin/catalog/products/:id/variants` | 'catalog:write' | Existing domain state/idempotency policy | Body: sku, netWeightGrams, jarSizeLabelKey, packagingTypeKey, barcode, weightGramsShipping, dimensionsMm, position |
| PUT | `/v1/admin/catalog/products/:id/variants/:variantId` | 'catalog:write' | Existing domain state/idempotency policy | Body: sku, netWeightGrams, jarSizeLabelKey, packagingTypeKey, barcode, weightGramsShipping, dimensionsMm, position |
| PUT | `/v1/admin/catalog/products/:id/variants/:variantId/translations` | 'catalog:write' | Existing domain state/idempotency policy | Body: locale, name |
| POST | `/v1/admin/catalog/products/:id/variants/:variantId/publish` | 'catalog:publish' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/catalog/products/:id/variants/:variantId/archive` | 'catalog:publish' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/catalog/products/:id/variants/:variantId/default` | 'catalog:write' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/catalog/products/:id/publish` | 'catalog:publish' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/catalog/products/:id/archive` | 'catalog:publish' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/catalog/categories` | 'catalog:write' | Existing domain state/idempotency policy | Body: parentId, sortWeight |
| POST | `/v1/admin/catalog/categories/:id/move` | 'catalog:write' | Existing domain state/idempotency policy | Body: parentId |
| PUT | `/v1/admin/catalog/categories/:id` | 'catalog:write' | Existing domain state/idempotency policy | Body: sortWeight |
| PUT | `/v1/admin/catalog/categories/:id/translations` | 'catalog:write' | Existing domain state/idempotency policy | Body: locale, name, slug, description, metaTitle, metaDescription |
| POST | `/v1/admin/catalog/collections` | 'catalog:write' | Existing domain state/idempotency policy | Body: sortWeight |
| PUT | `/v1/admin/catalog/collections/:id` | 'catalog:write' | Existing domain state/idempotency policy | Body: sortWeight |
| PUT | `/v1/admin/catalog/collections/:id/translations` | 'catalog:write' | Existing domain state/idempotency policy | Body: locale, name, slug, description, metaTitle, metaDescription |
| POST | `/v1/admin/catalog/collections/:id/publish` | 'catalog:publish' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/catalog/collections/:id/archive` | 'catalog:publish' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/catalog/products/:id/categories` | 'catalog:write' | Existing domain state/idempotency policy | Body: categoryId, primary |
| DELETE | `/v1/admin/catalog/products/:id/categories/:relationId` | 'catalog:write' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/catalog/products/:id/collections` | 'catalog:write' | Existing domain state/idempotency policy | Body: collectionId, position |
| DELETE | `/v1/admin/catalog/products/:id/collections/:relationId` | 'catalog:write' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/catalog/products/:id/media` | 'catalog:write' | Existing domain state/idempotency policy | Body: variantId, mediaAssetId, role, position, altTextByLocale |
| PATCH | `/v1/admin/catalog/products/:id/media/:attachmentId` | 'catalog:write' | Existing domain state/idempotency policy | Body: role, position, altTextByLocale |
| DELETE | `/v1/admin/catalog/products/:id/media/:attachmentId` | 'catalog:write' | Existing domain state/idempotency policy | No body fields |
| GET | `/v1/admin/fulfilment/orders/:orderId` | 'order:read' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/fulfilment/orders/:orderId/shipments` | 'order:write' | Required | Body: lines, trackingNumber |
| POST | `/v1/admin/fulfilment/shipments/:shipmentId/dispatch` | 'order:write' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/fulfilment/shipments/:shipmentId/deliver` | 'order:write' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/fulfilment/orders/:orderId/cancel` | 'order:cancel' | Existing domain state/idempotency policy | No body fields |
| GET | `/v1/admin/customers` | 'customer:read' | Existing domain state/idempotency policy | Query: cursor, limit, q |
| GET | `/v1/admin/audit` | 'audit:read' | Existing domain state/idempotency policy | Query: cursor, limit, actorUserId, action, subjectType, subjectId, from, to |
| GET | `/v1/admin/inventory/locations` | 'inventory:read' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/inventory/locations` | 'inventory:adjust' | Existing domain state/idempotency policy | Body: code, name, type, isSellable, isDefault |
| PATCH | `/v1/admin/inventory/locations/:id` | 'inventory:adjust' | Existing domain state/idempotency policy | Body: code, name, type, isSellable, isDefault |
| GET | `/v1/admin/inventory/items` | 'inventory:read' | Existing domain state/idempotency policy | Query: cursor, limit |
| GET | `/v1/admin/inventory/items/:variantId/:stockLocationId` | 'inventory:read' | Existing domain state/idempotency policy | No body fields |
| PATCH | `/v1/admin/inventory/items/:variantId/:stockLocationId/planning` | 'inventory:adjust' | Existing domain state/idempotency policy | Body: reorderPoint, safetyStock |
| GET | `/v1/admin/inventory/ledger/:variantId` | 'inventory:read' | Existing domain state/idempotency policy | Query: cursor, limit |
| POST | `/v1/admin/inventory/adjustments` | 'inventory:adjust' | Existing domain state/idempotency policy | Body: variantId, stockLocationId, delta, reason, note, expectedVersion |
| POST | `/v1/admin/inventory/reconciliation` | 'inventory:adjust' | Existing domain state/idempotency policy | Body: repair |
| GET | `/v1/admin/media` | 'content:write' | Existing domain state/idempotency policy | Query: cursor, limit, kind, visibility, assetId |
| POST | `/v1/admin/media/upload-intents` | 'content:write' | Existing domain state/idempotency policy | Body: declaredMimeType, declaredBytes, visibility, altTextByLocale |
| POST | `/v1/admin/media/upload-intents/:uploadId/complete` | 'content:write' | Existing domain state/idempotency policy | No body fields |
| GET | `/v1/admin/media/:assetId` | 'content:write' | Existing domain state/idempotency policy | No body fields |
| PATCH | `/v1/admin/media/:assetId/alt-text` | 'content:write' | Existing domain state/idempotency policy | Body: altTextByLocale |
| POST | `/v1/admin/media/:assetId/private-url` | 'content:write' | Existing domain state/idempotency policy | No body fields |
| DELETE | `/v1/admin/media/:assetId` | 'content:write' | Existing domain state/idempotency policy | No body fields |
| GET | `/v1/admin/orders` | 'order:read' | Existing domain state/idempotency policy | Query: cursor, limit, q, status, paymentStatus, fulfilmentStatus, customerId |
| GET | `/v1/admin/orders/:id` | 'order:read' | Existing domain state/idempotency policy | No body fields |
| GET | `/v1/admin/orders/:id/notes` | 'order:read' | Existing domain state/idempotency policy | Query: cursor, limit |
| POST | `/v1/admin/orders/:id/notes` | 'order:note' | Existing domain state/idempotency policy | Body: body |
| POST | `/v1/admin/payments/:paymentId/refunds` | 'order:refund' | Existing Phase 14 contract; console does not use it | Body: amountMinor, reason |
| POST | `/v1/admin/payments/:paymentId/refund-requests` | 'order:refund' | Required for the console; legacy `/refunds` keeps its original contract | Body: amountMinor, reason |
| GET | `/v1/admin/pricing/variant-prices/page` | 'pricing:read' | Existing domain state/idempotency policy | Query: cursor, limit, variantId |
| GET | `/v1/admin/pricing/coupons/page` | 'pricing:read' | Existing domain state/idempotency policy | Query: cursor, limit, status |
| GET | `/v1/admin/pricing/tax-rates/page` | 'pricing:read' | Existing domain state/idempotency policy | Query: cursor, limit |
| PATCH | `/v1/admin/pricing/coupons/:id/status` | 'pricing:write' | Existing domain state/idempotency policy | Body: status, expectedStatus |
| PUT | `/v1/admin/pricing/tax-rates/:id` | 'pricing:write' | Existing domain state/idempotency policy | Body: code, rateBps, country, region, isInclusive, isActive |
| GET | `/v1/admin/pricing/variant-prices` | 'pricing:read' | Existing domain state/idempotency policy | Query: variantId |
| POST | `/v1/admin/pricing/variant-prices` | 'pricing:write' | Existing domain state/idempotency policy | Body: variantId, amountMinor, compareAtMinor, currency, validFrom, validTo |
| GET | `/v1/admin/pricing/coupons` | 'pricing:read' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/pricing/coupons` | 'pricing:write' | Existing domain state/idempotency policy | Body: code, type, value, currency, minSubtotalMinor, maxDiscountMinor, startsAt, endsAt, usageLimitTotal, usageLimitPerUser, appliesTo, targetIds, status |
| GET | `/v1/admin/pricing/tax-rates` | 'pricing:read' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/pricing/tax-rates` | 'pricing:write' | Existing domain state/idempotency policy | Body: code, rateBps, country, region, isInclusive, isActive |
| GET | `/v1/admin/procurement/suppliers` | 'procurement:read' | Existing domain state/idempotency policy | Query: cursor, limit, status |
| GET | `/v1/admin/procurement/suppliers/:id` | 'procurement:read' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/procurement/suppliers` | 'procurement:write' | Existing domain state/idempotency policy | Body: code, legalName, contactName, email, phone, address, status, qualityRating, notes |
| PATCH | `/v1/admin/procurement/suppliers/:id` | 'procurement:write' | Existing domain state/idempotency policy | Body: code, legalName, contactName, email, phone, address, status, qualityRating, notes |
| GET | `/v1/admin/procurement/purchase-orders` | 'procurement:read' | Existing domain state/idempotency policy | Query: cursor, limit, status, supplierId |
| GET | `/v1/admin/procurement/purchase-orders/:id` | 'procurement:read' | Existing domain state/idempotency policy | No body fields |
| GET | `/v1/admin/procurement/purchase-orders/:id/landed-cost` | 'procurement:read' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/procurement/purchase-orders` | 'procurement:write' | Existing domain state/idempotency policy | Body: number, supplierId, currency, expectedAt, notes, destinationStockLocationId, freightCostMinor, dutyCostMinor, otherCostMinor, lines |
| POST | `/v1/admin/procurement/purchase-orders/:id/lines` | 'procurement:write' | Existing domain state/idempotency policy | Body: lines |
| POST | `/v1/admin/procurement/purchase-orders/:id/transition` | 'procurement:write' | Existing domain state/idempotency policy | Body: status |
| POST | `/v1/admin/procurement/purchase-orders/:id/receipts` | 'procurement:write' | Required | Body: stockLocationId, notes, lines |
| GET | `/v1/admin/shipping/configuration` | 'settings:read' | Existing domain state/idempotency policy | No body fields |
| PUT | `/v1/admin/shipping/zones/:id` | 'settings:write' | Existing domain state/idempotency policy | Body: name, countries, provinces, priority |
| PUT | `/v1/admin/shipping/methods/:id` | 'settings:write' | Existing domain state/idempotency policy | Body: code, zoneId, isActive, sortOrder, translations |
| PUT | `/v1/admin/shipping/rates/:id` | 'settings:write' | Existing domain state/idempotency policy | Body: methodId, currency, baseMinor, perKgMinor, freeOverSubtotalMinor, minWeightGrams, maxWeightGrams, validFrom, validTo |
| GET | `/v1/admin/sourcing/apiaries` | 'inventory:read' | Existing domain state/idempotency policy | No body fields |
| GET | `/v1/admin/sourcing/apiaries/:id` | 'inventory:read' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/sourcing/apiaries` | 'inventory:adjust' | Existing domain state/idempotency policy | Body: code, name, region, altitudeBand, notes, isOwnOperation |
| PATCH | `/v1/admin/sourcing/apiaries/:id` | 'inventory:adjust' | Existing domain state/idempotency policy | Body: code, name, region, altitudeBand, notes, isOwnOperation |
| POST | `/v1/admin/sourcing/apiaries/:id/translations` | 'inventory:adjust' | Existing domain state/idempotency policy | Body: locale, name, description |
| GET | `/v1/admin/sourcing/harvest-batches` | 'inventory:read' | Existing domain state/idempotency policy | Query: cursor, limit |
| GET | `/v1/admin/sourcing/harvest-batches/:id` | 'inventory:read' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/sourcing/harvest-batches` | 'inventory:adjust' | Existing domain state/idempotency policy | Body: batchCode, sourcingType, apiaryId, supplierId, harvestSeason, harvestYear, floralSources, receivedAt, quantityGrams, notes |
| GET | `/v1/admin/sourcing/harvest-batches/:id/allocations` | 'inventory:read' | Existing domain state/idempotency policy | No body fields |
| POST | `/v1/admin/sourcing/allocations` | 'inventory:adjust' | Existing domain state/idempotency policy | Body: harvestBatchId, variantId, quantityUnits, packedAt, notes |
| POST | `/v1/admin/sourcing/production-intake` | 'inventory:adjust' | Existing domain state/idempotency policy | Body: allocationId, stockLocationId, quantity, note |
| GET | `/v1/admin/payments/orders/:id` | 'order:read' | None | Query: cursor, limit; safe provider-capability/refund projection |
| GET | `/v1/admin/inventory/locations/page` | 'inventory:read' | None | Query: cursor, limit |
| GET | `/v1/admin/sourcing/apiaries/page` | 'inventory:read' | None | Query: cursor, limit |
| GET | `/v1/admin/sourcing/harvest-batches/:id/allocations/page` | 'inventory:read' | None | Query: cursor, limit |
