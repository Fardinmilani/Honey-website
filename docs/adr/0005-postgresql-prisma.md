# ADR-0005: PostgreSQL with Prisma

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

Commerce data is deeply relational and correctness-critical. Stock must never go
negative, order totals must reconcile exactly, and money movements must be
transactional. We also need per-locale unique slugs, partial indexes, `CHECK`
constraints, triggers for immutability, JSONB for order snapshots, and full-text
search — ideally without adding a second data store.

## Decision

PostgreSQL 16+ as the single system of record, accessed exclusively through
Prisma in `packages/db`.

- Business invariants that the database can enforce are enforced there:
  non-negative stock, sourcing shape, refund caps, per-locale slug uniqueness,
  immutability triggers on orders, append-only triggers on ledgers.
- Prisma Migrate for schema evolution; migrations are committed and immutable.
- `pg_trgm`, `unaccent`, and `tsvector` provide search until measurement says
  otherwise.
- Raw SQL is allowed via `$queryRaw` (parameterized) for the rare query Prisma
  models badly; `$queryRawUnsafe` is lint-banned.

## Consequences

**Positive** — ACID transactions make the checkout flow expressible as one
correct operation; the database is the last line of defence against application
bugs, which is exactly where you want it for stock and money; generated types
mean a schema change surfaces as a compile error; one engine to operate, back up,
and monitor.

**Negative / accepted** — Prisma's query builder cannot express everything, so
some queries drop to raw SQL; it does not model `CHECK` constraints or triggers,
so those live in hand-written migration SQL and must be tested explicitly;
connection pooling needs PgBouncer in transaction mode with Prisma configured to
match; Prisma's generated client is large and adds build time.

## Alternatives considered

| Option | Why not |
|---|---|
| Drizzle | Closer to SQL and lighter, but weaker migration tooling and a smaller ecosystem for the shape of team we have |
| TypeORM | Weaker type safety, historically unreliable migrations |
| Raw SQL + a query builder | Maximum control, but hand-maintaining types across a large schema is a durable tax |
| MySQL | Weaker JSONB, no partial indexes, weaker full-text for our needs |
| MongoDB | Transactional guarantees and relational integrity are the whole point here |
