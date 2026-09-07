# ADR-0028: Cursor pagination and catalog SEO indexation

**Status:** Accepted
**Date:** 2026-08-09
**Phase:** 10

## Context

Phase 8 delivered a public catalog API with **opaque cursor-only** list
pagination. Cursors are signed, locale-scoped fingerprints — not offsets, not
page numbers, and not stable across filter or sort changes.

The original SEO strategy document described indexable catalog URLs with
`?page=n` self-canonical pagination. That model assumes offset pagination the
API does not provide and would encourage crawlers to treat every cursor value as
a distinct indexable surface.

Introducing offset pagination or a page-number ↔ cursor translation layer in the
database would duplicate Phase 8 semantics, widen the attack surface for cache
poisoning, and create false “page 3” URLs that break when the catalog changes.

## Decision

- **Keep the Phase 8 cursor API unchanged.** The storefront forwards `cursor`
  query parameters to upstream list endpoints; it does not invent offset
  pagination or decode cursors into page numbers.
- **Indexable catalog URLs are filterless, sort-default, and cursorless only.**
  The canonical URL for a listing is the locale-prefixed path with no query
  string (for example `/fa/mahsoulat`, `/en/products`).
- **`?cursor=` and facet query parameters emit `noindex,follow`.** Filtered,
  sorted, and paginated-next views remain crawlable for link discovery but must
  not compete with the canonical first page in the index.
- **Do not add a page-number ↔ cursor database layer** or synthetic `?page=n`
  URLs in the web app or API.
- **Sitemaps include only canonical entity URLs and the first-page listing
  paths** — never cursor values, never facet combinations. Product, category, and
  collection detail URLs are always included when published; listing sitemaps
  reference the default first page only.

See also the updated [`seo-strategy.md`](../seo-strategy.md) and
[`storefront-development.md`](../storefront-development.md).

## Consequences

### Positive

- One pagination model end to end; no duplicate list semantics between API and
  web.
- Crawl budget stays bounded: infinite facet and cursor combinations are
  explicitly `noindex` and disallowed in `robots.txt`.
- Sitemap generation stays deterministic without encoding opaque cursors.

### Negative / accepted costs

- “Page 2” list URLs are not indexable and do not appear in sitemaps — acceptable
  because cursor pages are not stable canonical surfaces.
- Historical SEO copy referencing `?page=n` is superseded by this ADR for
  catalog listings.
- Rich-result `Offer` markup on products waits for Phase 12 pricing and Phase 11
  availability bands; Phase 10 ships `Product` JSON-LD without commerce fields.

## Alternatives considered

| Option | Why not |
|---|---|
| Add offset/`?page=n` pagination to the API | Duplicates Phase 8 cursor model; unstable under concurrent writes |
| Map `?page=n` ↔ cursor in the web layer only | False canonicals; cursors drift when filters change |
| Index cursor URLs | Infinite near-duplicate index; opaque tokens are not user-facing URLs |
| Decode cursors to offsets in Postgres | Leaks implementation detail; breaks cache fingerprinting |
