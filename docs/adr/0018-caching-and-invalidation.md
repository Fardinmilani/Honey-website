# ADR-0018: Layered caching with event-driven invalidation

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

Catalog reads dominate traffic and are nearly static; cart and checkout reads are
per-user and must never be shared. The performance budget (LCP ≤ 2.5 s on mobile)
is not reachable by rendering every product page on demand. But a stale price
shown to a customer is a commercial and trust problem, and a cached response
served across locales is a visible bug.

## Decision

**Cache aggressively where content is public; never cache anything personal.**

| Layer | Caches | Invalidation |
|---|---|---|
| CDN / edge | Hashed static assets, hero media, ISR HTML | Immutable for hashed assets; tag purge for HTML |
| Next.js data cache | RSC fetches of public catalog and content | `revalidateTag` on domain events |
| API response cache (Redis) | Public reads, keyed by route + locale + currency + normalized query | Explicit purge on events; 30–300 s TTL as a backstop |
| API in-process | Config, feature flags, locale metadata | Process lifetime |

**Rules**

1. **Cache keys always include locale and currency.** `Vary: Accept-Language,
   X-Currency` on every cacheable response. A Persian response must never reach
   an English request.
2. **Authenticated responses are `private, no-store`** end to end: cart,
   checkout, account, admin. No exceptions, no "just the header" caching.
3. **Invalidation is event-driven, not TTL-driven.** A domain event
   (`product.published`, `price.changed`, `content.published`) goes to the outbox;
   the worker purges the Redis keys and calls the web app's revalidation hook.
   TTL exists only as a backstop for a missed event.
4. **Cached prices and availability are advisory.** Authoritative values are
   recomputed at add-to-cart and again inside the checkout transaction. This is
   what makes aggressive caching safe: a stale page cannot produce a wrong charge.
5. **A cache miss must always be correct.** Nothing exists only in cache; every
   entry is reconstructible from Postgres.

Tags: `product:{id}`, `category:{slug}`, `collection:{slug}`, `content:{key}`,
`locale:{locale}`.

## Consequences

**Positive** — catalog pages serve from the edge at CDN latency; a price change
propagates in seconds rather than waiting out a TTL; personal data is
structurally excluded from shared caches; correctness at checkout does not depend
on cache freshness anywhere upstream.

**Negative / accepted** — four cache layers is real complexity, and reasoning
about a stale value means knowing which layer holds it, so cache behaviour gets
explicit tests; event-driven invalidation depends on the outbox and worker being
healthy, hence the TTL backstop; including locale and currency in every key
multiplies entries (acceptable — the catalog is small); a mass invalidation (for
example a site-wide price change) can produce a thundering herd, mitigated by
`stale-while-revalidate` and staggered purges.

## Alternatives considered

| Option | Why not |
|---|---|
| TTL-only invalidation | Either stale prices or a uselessly short TTL |
| No caching | Cannot meet the performance budget; every request hits Postgres |
| Cache authenticated responses per user | Enormous key space and a serious risk of cross-user leakage |
| Full static export | Prices, stock, and content change too often; no personalization path |
| Purge everything on any change | Thundering herd and wasted recomputation across the whole catalog |
