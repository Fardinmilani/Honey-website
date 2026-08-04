# ADR-0008: REST + OpenAPI, not GraphQL

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

The client set is small and fully known: our own web app, the admin console
inside it, and inbound webhooks. Catalog reads dominate traffic and benefit
enormously from HTTP caching at the CDN and in Redis. We need a typed client for
the frontend and a contract that cannot silently drift from the implementation.

## Decision

REST over HTTPS with JSON, contracted by an OpenAPI 3.1 document generated from
the code, committed to `packages/contracts/openapi.json`, and used to generate
the frontend's typed client.

- Path versioning (`/v1`), additive within a major version.
- RFC 9457 `application/problem+json` for errors, with stable machine `code`s.
- Cursor pagination; explicit allow-lists for filtering and sorting.
- CI enforces: no drift between code and the committed document, no breaking
  change without a version bump, Spectral lint rules, and a **forbidden-field
  scan** for `supplier`, `landedCost`, `moisture`, `lab`, and related vocabulary.

## Consequences

**Positive** — HTTP caching works exactly as designed, which matters most on the
highest-traffic paths; per-endpoint metrics and rate limits are trivial; no
query-complexity or N+1 attack surface; the generated client turns a backend
rename into a frontend compile error; the forbidden-field scan gives us a
*mechanical* guarantee that supplier data cannot leak, rather than a review habit.

**Negative / accepted** — clients occasionally over-fetch or need two round
trips; adding a field for one screen means changing a shared response; the
document must be regenerated and committed on every contract change (enforced by
the CI drift check, so it cannot be forgotten).

## Alternatives considered

| Option | Why not |
|---|---|
| GraphQL | Solves over-fetching we do not have, and creates caching and query-complexity problems we would have to solve |
| tRPC | Excellent DX for a TypeScript-only client set, but no language-agnostic contract, weaker HTTP caching, and awkward for webhooks and future non-TS consumers |
| gRPC | Poor browser story; unnecessary for our latency profile |
| No formal contract | Drift between frontend and backend is the failure mode we are explicitly engineering against |
