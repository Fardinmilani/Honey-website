# ADR-0027: Custom `@honey/i18n` runtime, server-only API client, and explicit BFF

**Status:** Accepted
**Date:** 2026-08-08
**Phase:** 9

## Context

Phase 9 must wire Next.js App Router with bilingual locale-prefixed routes,
message catalogs, a typed path to the Nest API, and opaque session cookies
without pulling marketplace or catalog UI forward. Heavy i18n frameworks
(`next-intl`, full ICU runtimes) add coupling and version surface that the
Phase 9 key set does not need. A generic Next.js rewrite/proxy to the API would
blur the BFF boundary and risk cookie leakage or unauthenticated path forwarding.
Hero motion is already constrained by [ADR-0019](0019-hero-media-preservation.md)
to poster-first delivery and reduced-motion stills without loading video.

## Decision

- Ship a **custom `@honey/i18n` runtime** (locale config, catalogs, negotiation,
  pathname helpers, `Intl` formatters, `createTranslator`). Do **not** adopt
  `next-intl` or another heavy i18n framework for Phase 9.
- Call the API only through a **`server-only` client** that targets
  `INTERNAL_API_URL`, validates an allow-listed path prefix set
  (`/readyz`, `/livez`, `/v1/…`), and optionally forwards the opaque session
  cookie and CSRF header. Never expose session values to the browser bundle or
  `NEXT_PUBLIC_*`.
- Expose **explicit allow-listed BFF route handlers** only (Phase 9:
  `GET /api/bff/readyz`). Do **not** implement a generic API proxy or catch-all
  rewrite to upstream.
- Implement Hero motion with **native CSS and Web APIs**. Do **not** add GSAP
  (or equivalent) in Phase 9; revisit only if a later phase explicitly requires
  it and documents the dependency.

UI token/CSS strategy remains [ADR-0026](0026-ui-tokens-semantic-classes.md).
Hero asset immutability remains ADR-0019.

## Consequences

### Positive

- Locale and copy rules stay in one workspace package with CI parity checks.
- Session secrets stay on the server; client components cannot import the API
  client or session helpers.
- BFF surface is auditable and small; new routes must be named and reviewed.
- Hero LCP and reduced-motion guarantees stay independent of animation libraries.

### Negative / accepted costs

- Message interpolation is simple `{name}` placeholders, not full ICU plurals —
  adequate for Phase 9; later cart/checkout namespaces may need richer plural
  support.
- Each new BFF capability requires a dedicated route rather than a one-line proxy
  config — intentional friction.
- Complex scroll choreography beyond CSS/Web APIs waits for an explicit later
  decision.

## Alternatives considered

| Option | Why not |
|---|---|
| `next-intl` (or similar) | Extra framework for a small Phase 9 catalog and pathname map; negotiation and RTL already live in `@honey/i18n` |
| Catch-all `/api/proxy/[...path]` | Forwards arbitrary upstream paths; enlarges attack surface and session handling |
| Browser-side API client with tokens | Violates opaque-session model ([ADR-0015](0015-session-auth.md)); leaks auth material |
| GSAP for Hero in Phase 9 | Unnecessary for poster-first + progressive `<video>`; conflicts with the ADR-0019 reduced-motion “no video in DOM” rule unless carefully gated |
