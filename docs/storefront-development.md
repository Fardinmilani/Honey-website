# Storefront development (Phase 10)

Phase 10 delivers browsable, indexable catalog pages in both locales: product
listing and detail, category and collection indexes and detail, search, SEO
metadata, structured data, sitemaps, robots control, and ISR cache invalidation.

**Related:** [ADR-0028](adr/0028-cursor-pagination-seo.md) (cursor pagination vs
SEO), [ADR-0027](adr/0027-web-bff-and-i18n-runtime.md) (i18n + BFF),
[`seo-strategy.md`](seo-strategy.md), [`web-development.md`](web-development.md).

**Out of scope for Phase 10:** price display, stock counts, Add to Cart, cart,
checkout, reviews, procurement, inventory, supplier surfaces.

---

## Route map

Internal pathname keys (App Router filesystem) map to localized URL segments via
`packages/i18n/src/pathnames.ts`:

| Internal key | `fa` segment | `en` segment |
|---|---|---|
| `/` | `/` | `/` |
| `/products` | `/mahsoulat` | `/products` |
| `/products/[slug]` | `/mahsoulat/[slug]` | `/products/[slug]` |
| `/categories` | `/dasteha` | `/categories` |
| `/categories/[slug]` | `/dasteha/[slug]` | `/categories/[slug]` |
| `/collections` | `/majmooeha` | `/collections` |
| `/collections/[slug]` | `/majmooeha/[slug]` | `/collections/[slug]` |
| `/search` | `/jostoju` | `/search` |

```text
apps/web/src/app/[locale]/(storefront)/
├── page.tsx                    home (featured catalog sections + Hero)
├── products/
│   ├── page.tsx                product listing
│   └── [slug]/page.tsx         product detail (PDP)
├── categories/
│   ├── page.tsx                category index
│   └── [slug]/page.tsx         category detail + filtered products
├── collections/
│   ├── page.tsx                collection index
│   └── [slug]/page.tsx         collection detail + filtered products
└── search/page.tsx             internal search results
```

Build locale-prefixed hrefs with `localizedHref` from `@honey/i18n`. Never
hardcode `/fa/mahsoulat` in components.

---

## API consumption

All catalog data flows through `apps/web/src/lib/catalog/api.ts`:

- Types from `@honey/contracts` generated OpenAPI schemas (`PublicProductDto`, etc.)
- HTTP via the **server-only** `apiFetch` client (`INTERNAL_API_URL`)
- Next.js data cache tags from `apps/web/src/lib/cache/tags.ts`
- **No** `@honey/backend`, `@honey/db`, or Prisma in `apps/web`

Public list endpoints use opaque **cursor** pagination (Phase 8). The web app
forwards `cursor` query params; it does not decode cursors or invent offset pages.

---

## Filters, sorts, and query parsing

Allow-lists live in `lib/catalog/api.ts` and `lib/catalog/query.ts`:

| List sorts | `newest`, `oldest`, `name`, `sort-weight` |
|---|---|
| Search sorts | `relevance`, `newest`, `name` |
| Filter keys | `honeyVarietal`, `originRegion`, `floralSource`, `categoryId`, `collectionId`, `minimumNetWeightGrams`, `maximumNetWeightGrams` |

`parseCatalogListSearchParams` / `parseSearchQuery` reject unknown keys, parse
UUIDs and numeric weights, and set:

- `hasFacets` — any filter or non-default sort (SEO: `noindex`)
- `hasCursor` — `?cursor=` present (SEO: `noindex`)

Unsupported query keys are tracked in `unsupportedKeys` for diagnostics.

---

## Cursor pagination and SEO

See [ADR-0028](adr/0028-cursor-pagination-seo.md).

| URL shape | Indexable? | Canonical |
|---|---|---|
| `/fa/mahsoulat` (no query) | Yes (when `WEB_INDEXING_ENABLED=true`) | Self |
| `/en/products?sort=name` | No (`noindex,follow`) | Listing path without query |
| `/en/products?cursor=…` | No | Listing path without query |
| `/en/search?q=honey` | No | N/A (search is always noindex) |
| Entity detail `/…/[slug]` | Yes (published) | Self |

`CatalogPagination` renders a single “next” link using the upstream
`nextCursor`. There is no page-number UI.

---

## Localized entity switching

Entity pages (PDP, category detail, collection detail) register per-locale slug
hrefs via `SetEntityLocaleHrefs` and `LocaleHrefsProvider`. The layout-owned
`LanguageSwitcher` reads translated slugs from context so switching language on a
product page lands on the same product in the other locale.

---

## Product gallery and images

- PDP uses `ProductGallery` with Next.js `<Image>` and remote patterns from
  `PUBLIC_MEDIA_BASE_URL` in `next.config.ts`
- Formats: **AVIF** and **WebP** (configured in `images.formats`)
- Responsive `sizes` and explicit dimensions to limit CLS
- Hero assets under `public/media/hero/` remain immutable ([ADR-0019](adr/0019-hero-media-preservation.md))

---

## Metadata, canonical, and hreflang

- `generateMetadata` on each catalog route calls `buildCatalogMetadata` in
  `lib/seo/metadata.ts`
- Canonical origin from `NEXT_PUBLIC_SITE_URL` / `PUBLIC_SITE_URL` via
  `getSiteOrigin()` — **never** from request `Host` headers
- Reciprocal hreflang via `buildMetadataAlternates` / `buildLocaleAlternates`
- `x-default` points at the English URL when `en` is in the alternate set
- `WEB_INDEXING_ENABLED` defaults **false** (fail closed). When false, every
  page emits `noindex` via `pageRobots`

---

## JSON-LD (no Offer until Phase 12)

Typed builders in `apps/web/src/lib/seo/builders/`:

| Page | Types |
|---|---|
| Site shell | `Organization`, `WebSite` |
| Product detail | `Product`, `BreadcrumbList` |
| Category / collection listing | `CollectionPage`, `BreadcrumbList`, `ItemList` (first page, no facets) |

Phase 11 shows availability bands in the UI. **Product** JSON-LD still omits
`offers`, `price`, `availability`, `review`, and `aggregateRating`. `Offer` ships
only when Phase 12 provides authoritative pricing. Unit tests in
`builders.test.ts` and `json-ld.test.ts` forbid commerce and health vocabulary.

Inject JSON-LD with `JsonLdScript` (server-rendered `<script type="application/ld+json">`).

---

## Sitemaps

```
/sitemap.xml                         sitemap index
└── /sitemaps/{locale}/{type}        child sitemaps
    types: static, products, categories, collections
```

- Each URL entry includes reciprocal `xhtml:link` alternates where translations exist
- Only canonical, indexable URLs — no `?cursor=`, no facet combinations
- `lastmod` from genuine content timestamps, not deploy time

---

## robots.txt and staging protection

`apps/web/src/app/robots.ts` and `lib/seo/robots-policy.ts`:

| `WEB_INDEXING_ENABLED` | Behavior |
|---|---|
| `false` (default) | `Disallow: /` for all agents; pages also emit `noindex` |
| `true` + valid HTTPS origin | Allow `/`, disallow admin/cart/checkout/account/api and query patterns `sort=`, `cursor=`, `filter=` |

Staging and local dev stay blocked until a human enables indexing with a real
production HTTPS origin. Final apex-vs-`www` choice is a deployment decision,
not a Phase 10 blocker.

---

## Cache tags and invalidation

Fetch calls tag catalog reads (`catalog`, `catalog:products`, `product:{id}`, etc.).

`POST /api/bff/revalidate` accepts a **Bearer** token matching `WEB_REVALIDATE_SECRET`
and an allow-listed `scope` (`catalog`, `products`, `product`, …). The handler
maps scope + optional `id` / `slug` / `locale` to concrete tags via
`resolveRevalidateTags` — arbitrary client-supplied tag strings are rejected.

---

## Performance and E2E

| Spec | Coverage |
|---|---|
| `e2e/catalog.spec.ts` | robots, sitemap index, noindex default, localized nav hrefs |
| `e2e/performance.spec.ts` | mobile LCP and TTFB budgets on homepage |
| `e2e/locale-a11y.spec.ts` | axe, locale negotiation (Phase 9) |
| `e2e/hero-motion.spec.ts` | reduced motion, no video fetch (Phase 9) |
| `e2e/visual.spec.ts` | visual snapshots (Phase 9) |

```sh
pnpm test:e2e
pnpm test:e2e:performance
pnpm phase10:verify
```

Vitest unit tests under `apps/web/src/lib/seo/` cover metadata, alternates,
robots policy, and JSON-LD builders.

---

## Scope limits (Phase 10 ceiling)

**Do not add in Phase 10:**

- Price, currency, or “Add to Cart” UI
- Exact stock counts, locations, or supplier identity
- Cart, checkout, or payment routes
- Admin procurement or inventory screens (Phase 17)
- Review or rating structured data
- Generic API proxy or catch-all BFF routes

---

## Environment

| Variable | Role |
|---|---|
| `NEXT_PUBLIC_SITE_URL` / `PUBLIC_SITE_URL` | Canonical absolute origin for metadata, sitemaps, JSON-LD |
| `INTERNAL_API_URL` | Server-only catalog API base |
| `WEB_INDEXING_ENABLED` | Fail-closed indexing switch (default `false`) |
| `WEB_REVALIDATE_SECRET` | Bearer secret for cache invalidation webhook |
| `PUBLIC_MEDIA_BASE_URL` | Remote image host for Next.js image optimizer |

See `.env.example` for safe placeholders.
