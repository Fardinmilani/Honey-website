# Catalog development

Phase 8 implements the catalog domain and HTTP API without a storefront or admin
interface. Business rules live in `packages/backend/src/modules/catalog`; the
NestJS controllers only validate and map HTTP requests.

## Ownership and boundaries

Catalog exclusively owns products, variants, translations, categories,
collections, their membership rows, product-media attachments, and slug history.
It does not read pricing, inventory, procurement, or media tables. Media asset
validation and canonical public URLs come from the Phase 7 `MediaService` through
`CatalogMediaPort`; storage keys and private URLs never cross that port.

`Product` is the localized editorial item. `ProductVariant` is its sellable SKU
identity and carries weight, jar/packaging keys, dimensions, deterministic
position, and default state. Phase 8 intentionally has no price, currency, stock,
discount, or purchasability field. Pricing becomes enforceable in Phase 12 and
inventory in Phase 11.

The established `BatchAllocation` model remains the only variant-to-harvest
relationship. Phase 8 does not add a product-level harvest shortcut. Admin
product records may show the existing product-owned sourcing type and apiary ID;
public DTOs show neither and contain no procurement counterparty information.

## Publication

Products and collections move through explicit draft, publish, and archive
commands. A product can publish only when:

- every configured enabled locale has a complete product translation;
- every published variant has every enabled locale;
- at least one variant is published and exactly one active published variant is
  the product default;
- the primary category is active and assigned to the product;
- every attachment resolves to a processed public media asset;
- slugs are unambiguous and stored rich content is in canonical sanitized form.

Adding an enabled locale therefore blocks publication until catalog content is
translated; no schema migration is needed. Publication and archive updates,
audit rows, and outbox events share one PostgreSQL transaction. The later
current-price invariant is deliberately deferred to Phase 12.

## Locales and slugs

Public locale resolution order is explicit `?locale=`, `Accept-Language`, an
authenticated user's stored preference when a valid optional session exists,
then the configured default. Unsupported explicit locales return 422. API paths
never contain a locale and every response echoes `meta.locale`.

Slugs use NFC/NFKC normalization, lowercase Latin, Persian Yeh/Kaf
canonicalization, one hyphen separator, and bounded Persian/Latin letters and
digits. Paths, dots, traversal sequences, controls, and empty values are
rejected. A published slug change records the old value once in the same
transaction. Old product, category, and collection slugs return the binding 301
redirect to the canonical versioned API route with the resolved locale query.

Story content supports only `p`, `br`, `strong`, `em`, `ul`, `ol`, `li`,
`blockquote`, and safe `a` elements. Other elements, arbitrary attributes,
event handlers, active content, and unsafe URL protocols are rejected before
storage.

## Public routes

| Route | Purpose |
|---|---|
| `GET /v1/catalog/products` | Published product list with cursor, filters, and sort |
| `GET /v1/catalog/products/:slug` | Localized product or permanent redirect |
| `GET /v1/catalog/search` | Locale-scoped PostgreSQL search |
| `GET /v1/catalog/categories` | Materialized category hierarchy |
| `GET /v1/catalog/categories/:slug` | Localized category |
| `GET /v1/catalog/categories/:slug/products` | Products assigned to a category |
| `GET /v1/catalog/collections` | Published curated collections |
| `GET /v1/catalog/collections/:slug` | Localized published collection |
| `GET /v1/catalog/collections/:slug/products` | Deterministically positioned collection products |

Lists/search use `public, max-age=60, stale-while-revalidate=300`; single reads
use `public, max-age=60, s-maxage=300`, ETag/`If-None-Match`, and
`Vary: Accept-Language`.

## Admin routes and permissions

All routes below `/v1/admin/catalog` require a staff session, CSRF for unsafe
cookie-authenticated requests, explicit permission metadata, audit records, and
`private, no-store` responses.

- `catalog:read` retrieves the full admin product editing record.
- `catalog:write` creates and updates products, variants, translations,
  taxonomies, memberships, default variants, and media attachments.
- `catalog:publish` alone publishes or archives products and collections.

Unknown DTO properties are rejected. Status, publication timestamps, audit
actors, media URLs/keys, prices, and stock are never accepted as general update
fields.

## Hierarchy, collections, and media

Category paths are UUID materialized paths, with maximum depth six by default.
Self-parenting, cycles, deleted parents, and moving beneath descendants are
rejected; descendants are rewritten atomically during a move. The database also
requires a product's primary category to remain in its membership set.

Collection membership is unique and positions are unique within a collection.
Only published, non-deleted collections are public. Product media roles are
`GALLERY`, `THUMBNAIL`, `LIFESTYLE`, and `VIDEO`; an optional variant must belong
to the same product. Contextual alt text is stored per enabled locale and falls
back to the asset-level localized alt text.

## Search, filters, sorts, and cursors

`honey_catalog_normalize` handles Arabic/Persian Yeh and Kaf, ZWNJ/spacing,
Persian/Arabic diacritics, Tatweel, Unicode normalization, and Latin case. A
`pg_trgm` GIN expression index backs locale-scoped search over localized name and
descriptive fields. SQL is parameterized and ranking has the product UUID as the
final stable tie-breaker.

Allowed product filters are category/collection ID, varietal, origin region,
floral source, and variant net-weight bounds. Allowed sorts are newest, oldest,
name, and sort weight; search also supports relevance. Unknown or deferred
filters/sorts return 422.

Cursors are base64url-encoded version-1 records carrying the last sort value and
UUID plus a SHA-256 fingerprint of locale, sort, and normalized filters. They
cannot be reused across another locale/filter and malformed cursors return 422.
Limits default to 24 and are capped at 100; public offset pagination is absent.

## Cache behavior

`CatalogCache` has Redis and in-memory implementations. Keys are canonical and
locale-aware. Entries have a 60-second default TTL and register bounded tags for
products, slugs, lists, searches, categories, and collections. Every catalog
mutation invalidates its entity plus affected list/search tags. When Redis is
unavailable, reads use PostgreSQL; a failed invalidation may leave only bounded
public data until TTL expiry. Admin responses are never cached and there is no
background invalidation worker in Phase 8.

## Commands

```sh
pnpm --filter @honey/backend test -- --run test/catalog.test.ts test/catalog.integration.test.ts
pnpm --filter @honey/api test -- --run test/catalog.test.ts
pnpm db:test
pnpm api:openapi:generate
pnpm api:openapi:check
pnpm phase8:verify
```

The integration suite creates an isolated PostgreSQL database from the complete
migration history and uses real Redis. The deterministic seed is run twice by
`pnpm db:test`. Phase 8 adds no Next.js, storefront/admin UI, worker processor,
external search engine, or object-storage seed object. The protected Hero files
remain static, untouched, and outside object storage.
