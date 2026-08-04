# SEO Strategy

**Scope:** URL architecture, per-locale metadata, hreflang, structured data,
sitemaps, crawl control, and the performance work that search ranking actually
depends on.

**Related:** [`i18n-strategy.md`](i18n-strategy.md),
[ADR-0009](adr/0009-locale-prefixed-routing.md)

---

## 1. Objectives

1. Every page is reachable, crawlable, and indexable under exactly **one**
   canonical URL per locale.
2. Persian and English versions are correctly cross-declared so neither
   cannibalizes the other.
3. Rich results for products, breadcrumbs, FAQs, and the organization — with
   **zero** health, laboratory, or moisture properties.
4. Core Web Vitals in the "good" band on mobile, including a video hero.
5. URLs survive content edits: slug changes redirect, they never 404.

---

## 2. URL architecture

```
https://example.com/                      → 307 to negotiated locale, never indexed
https://example.com/fa                    → Persian home
https://example.com/en                    → English home
https://example.com/fa/mahsoulat          → Persian product listing
https://example.com/fa/mahsoulat/asal-konar
https://example.com/en/products/sidr-honey
https://example.com/fa/majmooeha/kuhestani
https://example.com/en/about
```

**Rules**

| Rule | Reason |
|---|---|
| Every content URL carries a locale prefix, including the default locale | One page, one URL. Serving `/` and `/fa` identically creates duplicate content with an ambiguous canonical |
| Lowercase, hyphenated, ASCII slugs | Readable in logs, analytics, ads, and shared text; no percent-encoding |
| No trailing slash | Consistent, enforced by a single redirect rule |
| Persian route segments are transliterated, not Persian script | A percent-encoded UTF-8 URL is unreadable everywhere a URL appears as plain text |
| Filters and sorting are query parameters, never path segments | Prevents an infinite crawlable path space |
| Slugs are per-locale and stored in the translation table | `product_translation(locale, slug)` is unique |
| Pagination is `?page=n`, self-canonical | Page 2 is a real page with real content, not a duplicate of page 1 |

**Slug changes** write a `slug_history` row and the old URL issues a permanent
`301` to the new one, forever. Link equity is expensive to earn and trivial to
throw away.

---

## 3. Canonical and hreflang

Every page emits a **self-referencing canonical** plus a complete, reciprocal set
of `hreflang` alternates:

```html
<link rel="canonical"   href="https://example.com/fa/mahsoulat/asal-konar" />
<link rel="alternate" hreflang="fa-IR"     href="https://example.com/fa/mahsoulat/asal-konar" />
<link rel="alternate" hreflang="en"        href="https://example.com/en/products/sidr-honey" />
<link rel="alternate" hreflang="x-default" href="https://example.com/en/products/sidr-honey" />
```

**Rules**

- Canonicals are absolute, on the production origin, and self-referencing.
  A cross-locale canonical would tell Google the other language does not deserve
  indexing.
- hreflang sets are **reciprocal and complete**: every locale's page lists every
  locale including itself. A one-way declaration is ignored.
- `x-default` points at the **English** version: it serves users whose language
  does not match any of ours, and English is the broader fallback. The primary
  market is Iran and `fa` is the default locale, but `x-default` is about the
  unmatched visitor, not about market priority.
- Alternates are only emitted for locales where the entity is **actually
  published**. Pointing hreflang at a fallback page is worse than omitting it.
- The root `/` is `noindex` and redirects with `307`, never `301` — the
  destination depends on the visitor, so it must not be cached as permanent.
- The alternate map is generated from the locale config and the entity's
  translations. It is never hand-written per page, because hand-written hreflang
  is where reciprocity breaks.

---

## 4. Metadata

Generated per route via `generateMetadata`, sourced from the content translation
row with a catalog-driven fallback pattern. No page ships a default or duplicated
title.

| Element | Rule |
|---|---|
| `<title>` | Unique per page per locale, ≤ 60 chars, pattern `{page} — {brand}` in the locale's own word order |
| `meta description` | Unique, 140–160 chars, written per locale — never machine-translated from the other locale |
| `<html lang>` / `dir` | From locale config |
| Open Graph | `og:title`, `og:description`, `og:image` (1200×630, per locale), `og:type`, `og:url` (canonical), `og:locale`, `og:locale:alternate` for every other locale |
| Twitter | `summary_large_image` |
| `robots` | `index,follow` by default; `noindex` on cart, checkout, account, admin, search results, and filtered facets |
| Favicons / manifest | Per-brand, with a locale-aware `name` in the web manifest |

Titles and descriptions are **authored per locale**, not translated word for word.
A Persian title that reads like translated English performs badly with both search
engines and readers.

---

## 5. Structured data

JSON-LD only, injected server-side, generated from typed builders in
`apps/web/src/lib/seo/`.

| Page | Types |
|---|---|
| All | `Organization`, `WebSite` (with `SearchAction`) |
| Product | `Product` + `Offer` + `BreadcrumbList` |
| Category / collection | `CollectionPage` + `BreadcrumbList` + `ItemList` |
| Article | `Article` + `BreadcrumbList` |
| FAQ page | `FAQPage` |
| Contact | `Organization` with `contactPoint` |

```jsonc
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "عسل کنار",
  "description": "…origin, harvest, and tasting notes only…",
  "image": ["https://cdn.example.com/…"],
  "brand":  { "@type": "Brand", "name": "…" },
  "category": "Honey",
  "inLanguage": "fa-IR",
  "offers": {
    "@type": "Offer",
    "url": "https://example.com/fa/mahsoulat/asal-konar",
    "priceCurrency": "IRR",
    "price": "4850000",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition",
    "seller": { "@type": "Organization", "name": "…" }   // us, always
  }
}
```

**Hard prohibitions in structured data**

- No `nutrition`, `healthClaim`, `MedicalEntity`, `Drug`, or any health-adjacent
  type or property.
- No moisture, water content, HMF, diastase, purity, or laboratory property —
  under any custom name.
- `seller` is always our own organization. There is no second seller, and there is
  no marketplace markup (`Offer.seller` variation, `AggregateOffer` across
  sellers) anywhere.
- `aggregateRating` and `review` are emitted only from genuine, moderated
  customer reviews, and only once reviews ship. Fabricated ratings are both a
  policy violation and a manual-action risk.

Every builder is unit-tested and validated against the Rich Results schema in CI,
plus a repo-wide regex test that fails the build if forbidden vocabulary appears
in any structured-data output.

---

## 6. Sitemaps

```
/sitemap.xml                  index
├── /sitemaps/static-fa.xml   home, about, contact, legal, FAQ
├── /sitemaps/static-en.xml
├── /sitemaps/products-fa.xml
├── /sitemaps/products-en.xml
├── /sitemaps/categories-fa.xml
├── /sitemaps/categories-en.xml
├── /sitemaps/articles-fa.xml
└── /sitemaps/articles-en.xml
```

- Each URL entry includes `<xhtml:link rel="alternate" hreflang="…">` for every
  published locale — the sitemap is the most reliable place to declare alternates
  at scale.
- `<lastmod>` reflects genuine content changes, not deploy time. A sitemap that
  claims everything changed today gets its `lastmod` ignored.
- Only canonical, indexable, published URLs. No redirects, no `noindex`, no
  parameters.
- Split at 45,000 URLs (below the 50,000 limit) and regenerated by a worker job
  on `product.published`, `content.published`, and nightly.
- Referenced from `robots.txt`.

---

## 7. robots.txt

```
User-agent: *
Allow: /

Disallow: /*/admin
Disallow: /*/cart
Disallow: /*/checkout
Disallow: /*/account
Disallow: /api/
Disallow: /*?*sort=
Disallow: /*?*page=
Disallow: /*?*filter=

Sitemap: https://example.com/sitemap.xml
```

Note that `Disallow` prevents **crawling**, not indexing. Private pages therefore
also send `X-Robots-Tag: noindex` and require authentication — robots.txt is a
crawl-budget tool, not an access control.

Staging and preview environments serve `Disallow: /` **and** `noindex`, enforced
by an environment check and asserted by an e2e test, because an indexed staging
site is a genuine and common disaster.

---

## 8. Crawl budget and indexation control

| Surface | Directive |
|---|---|
| Product, category, collection, article, static pages | `index, follow` |
| Paginated pages (`?page=2+`) | `index, follow`, self-canonical |
| Filtered / sorted facets | `noindex, follow` — near-infinite combinations |
| Internal search results | `noindex, follow` |
| Cart, checkout, account, admin | `noindex, nofollow`, auth-required |
| Out-of-stock products | Stay indexed with `availability: OutOfStock`; permanently discontinued products `410` and are removed from the sitemap |
| Empty categories | `noindex` until they have products |

Internal linking keeps every product within three clicks of the home page.
Breadcrumbs are rendered and marked up on every deep page. Orphan pages are
detected by a crawl in CI.

---

## 9. Performance — the ranking factor that is actually engineering

| Metric | Target | How |
|---|---|---|
| LCP (mobile) | ≤ 2.5 s | The hero **poster `.webp` is the LCP element**, preloaded with `fetchpriority="high"`; video never blocks it |
| INP | ≤ 200 ms | Server Components by default; minimal client JavaScript; no hydration on static sections |
| CLS | ≤ 0.05 | Explicit `width`/`height` or `aspect-ratio` on every image and video; fonts with metric-compatible fallbacks; no injected banners above content |
| TTFB | ≤ 200 ms cached | ISR + CDN; tag-based invalidation instead of short TTLs |

### Hero media handling

The eight existing files under `apps/web/public/media/hero/` are the homepage
anchor and are treated as immutable, fingerprinted static assets served from the
CDN with a one-year cache.

```html
<video
  poster="/media/hero/desktop/honey-poster.webp"
  preload="none" muted playsinline loop autoplay
  aria-hidden="true">
  <source src="/media/hero/mobile/honey-scroll.webm"  type="video/webm" media="(max-width: 768px)">
  <source src="/media/hero/mobile/honey-scroll.mp4"   type="video/mp4"  media="(max-width: 768px)">
  <source src="/media/hero/desktop/honey-scroll.webm" type="video/webm">
  <source src="/media/hero/desktop/honey-scroll.mp4"  type="video/mp4">
</video>
```

- The poster is preloaded; the video is `preload="none"` and starts only after the
  poster has painted. A ~3.5 MB video must never compete with the LCP image.
- Mobile sources are selected by media query so a phone never downloads the
  desktop encode.
- `prefers-reduced-motion: reduce` renders `stills/hero-start.webp` and no
  `<video>` element at all — not a paused video, which still downloads.
- The hero is decorative: `aria-hidden`, no captions needed, and all heading text
  is real DOM text so it is indexable and translatable.
- Aspect ratio is reserved in CSS so there is no layout shift when the poster
  loads.

### Elsewhere

AVIF with WebP fallback for product imagery, responsive `srcset`, lazy loading
below the fold, `fetchpriority="high"` on the single LCP image per page, and route
-level code splitting with a shipped-JS budget enforced in CI.

---

## 10. Content and on-page

- One `<h1>` per page, describing that page, in that locale.
- Heading hierarchy is semantic, never chosen for visual size.
- Descriptive `alt` text per locale, stored on the media asset — decorative
  images get `alt=""`.
- Product copy covers origin, apiary, region, harvest season, floral source,
  colour, aroma, texture, crystallisation, taste notes, pairings, jar size, and
  storage. **Never** moisture, laboratory results, or any health claim — this is a
  product rule first and an SEO rule second, since health claims on food invite
  both regulatory action and search penalties.
- Persian and English content are independently authored. Machine-translated
  duplicate content ranks poorly and reads worse.
- FAQ content is genuine and marked up with `FAQPage`.

---

## 11. Redirects

| Situation | Response |
|---|---|
| Slug changed | `301` from the historical slug, permanently, from `slug_history` |
| Product discontinued | `410 Gone`, removed from the sitemap |
| Product temporarily unavailable | Stay `200`, `availability: OutOfStock` |
| Category merged | `301` to the surviving category |
| Locale-less content URL requested | `307` to the negotiated locale |
| Trailing slash | `301` to the canonical no-slash form |
| `http://` or `www.` | `301` to the canonical `https://` apex (or `www`, chosen once) |

Redirect chains are forbidden — always redirect to the final destination. Chains
are audited in CI against the route table.

---

## 12. Analytics and measurement

- Privacy-respecting, consent-gated analytics with locale, currency, and device
  as dimensions.
- Search Console verified for **both** locale directories, with hreflang and
  coverage errors triaged weekly.
- Real-user Core Web Vitals collected per route template and per locale — lab
  scores are a debugging tool, field data is the truth.
- Tracked: organic entrances per locale, indexation coverage, hreflang errors,
  404 and 410 rates, redirect-chain count, sitemap freshness, LCP/INP/CLS
  distributions per locale, and product-page conversion by locale.

---

## 13. Launch SEO checklist

- [ ] Every page has a unique, locale-authored title and description
- [ ] Self-referencing canonical on every page
- [ ] hreflang complete, reciprocal, and only for published translations
- [ ] `x-default` present and pointing at the English version
- [ ] Sitemap index live, referenced in `robots.txt`, alternates included
- [ ] `robots.txt` correct for production; staging fully blocked and `noindex`
- [ ] Structured data validates, with **no** health/lab/moisture properties
- [ ] No marketplace or multi-seller markup anywhere
- [ ] Slug-history redirects working; no redirect chains
- [ ] Core Web Vitals in the "good" band on mobile for home, listing, and product
- [ ] Hero poster is the LCP element; video does not block it
- [ ] `prefers-reduced-motion` path verified
- [ ] Both locales crawlable end to end with no orphan pages
- [ ] Search Console verified for both locale directories
