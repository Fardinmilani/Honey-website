# ADR-0002: Modular monolith, not microservices

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

The core commerce operation — re-price the cart, verify reservations, create the
order, consume stock — must be atomic. Splitting catalog, inventory, and orders
into separate services would replace one database transaction with a distributed
saga, compensating actions, and eventual consistency, in exchange for
independent scaling we have no evidence we need. The team is small and there is
one product.

## Decision

One deployable API process containing all business modules, with boundaries
enforced in code rather than over the network.

- Each module owns its tables exclusively; no module reads another's tables.
- Cross-module calls go through published service interfaces (the module's
  `index.ts` barrel) or through domain events on the transactional outbox.
- The worker is a **separate process** but not a separate service: it shares the
  same application code and database, so it is a second runtime shape of the same
  monolith.
- Boundaries are checked mechanically by ESLint `no-restricted-imports`,
  `eslint-plugin-boundaries`, and `dependency-cruiser` in CI.

## Consequences

**Positive** — checkout is a single ACID transaction; one thing to deploy,
monitor, and debug; a stack trace crosses the whole flow; refactoring a boundary
is a code change, not a migration and a deprecation window; clean boundaries keep
future extraction cheap.

**Negative / accepted** — everything scales together; one bad module can exhaust
the process; boundaries erode unless the lint rules stay strict, which is
precisely why they are CI-blocking rather than advisory; the whole API redeploys
for a one-module change.

## Extraction criteria

A module may become its own deployable only when **all** hold, recorded in a new
ADR: a genuinely different scaling profile proven by production metrics; a
boundary stable for months with no leakage; no need to share a transaction with
another module; and the operational maturity to run another deployable.

## Alternatives considered

| Option | Why not |
|---|---|
| Microservices from day one | Distributed transactions for checkout; enormous operational cost for a small team |
| Unstructured monolith | Boundaries erode silently and extraction becomes impossible |
| Serverless functions | Cold starts on a latency-sensitive checkout; connection-pool pressure on Postgres |
