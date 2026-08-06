# ADR-0025: Materialized catalog hierarchy, normalized PostgreSQL search, and tagged Redis cache

**Status:** Accepted
**Date:** 2026-08-06
**Phase:** 8

## Context

Catalog reads need stable category ancestry, Persian/English search without an
external search service, and short-lived public caching that never becomes the
source of truth. Catalog media also has to remain behind the Phase 7 public
application boundary.

## Decision

- Categories use an ID-based materialized path. Moves update the category and
  every descendant inside one PostgreSQL transaction, with a bounded depth and
  cycle checks in both the application and database.
- Search uses immutable PostgreSQL normalization functions plus a `pg_trgm` GIN
  expression index. The normalizer canonicalizes Arabic/Persian Yeh and Kaf,
  spacing and ZWNJ, safe diacritics, Tatweel, Unicode, and Latin case.
- Public catalog reads use a provider-neutral cache port. Redis keys bind locale,
  normalized filters, sort, and cursor; bounded tag sets invalidate affected
  products, slugs, taxonomies, lists, and searches. PostgreSQL remains
  authoritative and Redis failures fall through to it.
- Catalog repositories store media attachment IDs but never query media-owned
  tables. A narrow adapter calls the public media application service in a
  bounded batch for processed public URLs and trusted metadata.

## Consequences

### Positive

- Hierarchy reads and cursor ordering are deterministic.
- Equivalent Persian input is handled in PostgreSQL with a verified index plan.
- Cache loss cannot weaken publication or authorization rules.
- Storage keys and private media metadata stay outside catalog.

### Negative / accepted costs

- Category moves rewrite the bounded subtree in one transaction.
- Tag invalidation is best effort while Redis is unavailable; the 60-second TTL
  bounds stale public data.
- PostgreSQL search is intentionally smaller in scope than a dedicated engine.

## Alternatives considered

| Option | Why not |
|---|---|
| Adjacency list without paths | Descendant moves and ancestry reads would require repeated recursion at read time |
| Nested sets | High write amplification and unnecessary complexity for a shallow curated tree |
| External search service | Outside Phase 8 and adds operational state before measurement justifies it |
| Redis as catalog truth | Would make availability of a cache a correctness dependency |
| Direct media-table joins | Violates exclusive module ownership |
