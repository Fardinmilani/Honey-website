# ADR-0003: Next.js App Router for storefront and admin

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

The storefront needs static-first rendering, excellent Core Web Vitals with a
video hero, per-locale metadata and structured data, and RTL/LTR support. The
admin console needs rich interactivity but has a small audience and no SEO
requirement. Building two frontends would duplicate the design system, the API
client, the i18n setup, and the session handling.

## Decision

One Next.js application (`apps/web`) on the App Router, containing both surfaces
as route groups:

```
app/[locale]/(storefront)/…    static-first, indexable
app/[locale]/(admin)/admin/…   dynamic, no-store, noindex
app/api/…                      BFF handlers only
```

- Server Components by default; `'use client'` only where interaction requires it.
- Storefront pages use ISR with tag-based invalidation; admin pages are always
  dynamic with `private, no-store`.
- `generateMetadata` produces per-locale titles, canonicals, hreflang, and
  Open Graph data.
- The BFF exists so the session cookie stays `httpOnly` and the API origin is
  never exposed to the browser.

## Consequences

**Positive** — one design system, one API client, one i18n setup, one deployment;
Server Components keep the shipped JavaScript small, which is what the
performance budget depends on; streaming and Suspense improve perceived speed;
first-class metadata and sitemap support.

**Negative / accepted** — the App Router's caching semantics are subtle and have
changed between versions, so cache behaviour needs explicit tests; the
server/client component split is a real source of mistakes; admin bundles must be
kept out of storefront routes, which the route-group split handles but does not
guarantee by itself; we are coupled to a fast-moving framework.

**Non-negotiable:** the admin route group is a *UX* boundary. Every admin request
is independently authorized by the API. Hiding navigation is not access control.

## Alternatives considered

| Option | Why not |
|---|---|
| Separate SPA for admin | Duplicates design system, i18n, API client, and session handling for a small audience |
| Next.js Pages Router | No Server Components; weaker metadata and layout primitives |
| Astro storefront + SPA admin | Two frameworks, two build systems, two sets of conventions |
| Server-rendered templates from NestJS | Loses the React design system and the RSC performance model |
