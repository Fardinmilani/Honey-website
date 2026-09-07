# Web development

Phase 9 delivers the Next.js App Router foundation. Phase 10 adds the storefront
catalog pages, SEO, and structured data. See
[`storefront-development.md`](storefront-development.md) for the Phase 10 route map,
cache tags, and indexing rules.

Phase 9 scope: bilingual locale routing,
RTL/LTR shell, design tokens and primitives, Hero integration with protected
assets, a server-only API client with an explicit BFF probe, opaque session
cookie forwarding, security headers, Playwright/axe/visual coverage, and a
standalone web Docker image.

This is **not** the cart, checkout, or admin console.
Those belong to later phases. See [ADR-0027](adr/0027-web-bff-and-i18n-runtime.md),
[ADR-0026](adr/0026-ui-tokens-semantic-classes.md), and
[storefront-development.md](storefront-development.md) for Phase 10 catalog scope.

## App Router structure

```text
apps/web/src/
├── app/
│   ├── layout.tsx                 root pass-through
│   ├── page.tsx                   unused; `/` is redirected by middleware
│   ├── _unsupported-locale/       rewrite target for unknown locale segments
│   ├── api/bff/readyz/            explicit allow-listed BFF probe (not a proxy)
│   └── [locale]/
│       ├── layout.tsx             <html lang dir> from localeConfig; imports UI CSS
│       ├── (storefront)/          public shell, homepage, catalog (Phase 10)
│       │   ├── layout.tsx         header / footer / skip link
│       │   ├── page.tsx           Hero + home copy + featured catalog
│       │   ├── products/          listing + PDP
│       │   ├── categories/        index + detail
│       │   ├── collections/       index + detail
│       │   └── search/            search results (noindex)
│       └── (admin)/
│           ├── layout.tsx         admin route-group shell
│           └── admin/layout.tsx   noindex shell; no admin pages in Phase 9
├── components/                    hero, language switcher, shell
├── lib/
│   ├── api-client/                server-only typed client to INTERNAL_API_URL
│   ├── env.ts                     validated web env (server-only)
│   ├── session.ts                 opaque cookie read (server-only)
│   └── session-forward.ts         Cookie / CSRF header helpers for upstream
├── middleware.ts                  locale negotiate, cookie align, 307 from `/`
└── styles/global.css
```

`apps/web` never imports `@honey/backend` or `@honey/db`. Business data is
reached only over HTTP through the server API client (or not at all).

## Locale routing and negotiation

- Content routes are locale-prefixed: `/fa/...`, `/en/...`.
- Negotiation priority: `NEXT_LOCALE` cookie → `Accept-Language` → default `fa`
  (`negotiateLocale` in `@honey/i18n`).
- Visiting `/` issues a **307** redirect to `/{negotiatedLocale}`.
- A valid locale in the URL keeps the cookie aligned (`sameSite=lax`, not
  `httpOnly`, so the language switcher can cooperate with middleware).
- An unrecognized first segment is rewritten to `/_unsupported-locale` and does
  not render storefront chrome.

## RTL / LTR

`localeConfig` is the single source for `dir`, `bcp47`/`lang`, font token, and
labels. The `[locale]` layout sets:

```tsx
<html lang={config.bcp47} dir={config.dir}>
```

`fa` is RTL; `en` is LTR. Components do not branch on `if (locale === 'fa')` for
direction — CSS uses logical properties enforced by Stylelint.

## `@honey/i18n`

Custom lightweight runtime — **not** `next-intl`. Public surface:

- Locale config (`locales`, `defaultLocale`, `localeConfig`, cookie name)
- Message catalogs (`common`, `navigation`, `home`, `accessibility`, `errors`)
  with English key authority and Persian parity validation
- Pathname map: home `/` plus catalog routes (`/products`, `/categories`,
  `/collections`, `/search` and `[slug]` variants) — see
  [`storefront-development.md`](storefront-development.md)
- `Intl` formatters + digit normalization
- `createTranslator(locale)` with dotted keys (`t('home.headline')`)

See [`packages/i18n/README.md`](../packages/i18n/README.md). Validate with
`pnpm i18n:validate`.

## `@honey/ui`

Token CSS + semantic `.ui-*` classes (no Tailwind). Logical CSS only. Apps import
`@honey/ui/styles.css` once from the locale layout. Primitives: `Button`,
`Container`, `Inline`, `Link`, `Stack`, `VisuallyHidden`, plus `cx`.

Stylelint in `apps/web` (and package CSS paths) bans physical `left`/`right`
margin, padding, border, float, and `text-align: left|right`.

See [ADR-0026](adr/0026-ui-tokens-semantic-classes.md) and
[`packages/ui/README.md`](../packages/ui/README.md).

## Font policy

**System fallbacks only** in Phase 9. Stacks live in CSS variables
(`--font-persian`, `--font-latin-*`, `--font-body`, `--font-display`). Locale
layout applies `fontFamily` from `localeConfig`.

- No self-hosted brand font binaries
- No Google Fonts (or other remote webfont CDN)
- Licensed faces later replace stacks by overriding CSS variables only

Open question #10 (brand fonts) remains unresolved; Phase 9 does not claim fonts
are production-final.

## Language switcher

Header control switches between `fa` and `en` using `switchLocalePath` while
preserving the current pathname shape. Labels and `aria-*` come from i18n
(`accessibility.*`, locale labels). No hardcoded English/Persian UI strings in
components.

## Hero

Protected assets under `apps/web/public/media/hero/` remain immutable
([ADR-0019](adr/0019-hero-media-preservation.md), `AGENTS.md`).

| Behavior | Rule |
|---|---|
| Poster-first | WebP poster is the LCP candidate (`fetchPriority="high"`); static public URLs, not Next image optimizer |
| Video | Client-only progressive mount; `preload="none"`, muted, playsInline, loop |
| Reduced motion | `prefers-reduced-motion: reduce` → no `<video>` in the DOM → **no MP4/WebM network requests** |
| Viewport | Mobile vs desktop sources from `(max-width: 767px)` |
| Motion stack | Native CSS / Web APIs only; **no GSAP** in Phase 9 |

Stills under `stills/` remain available; motion path uses desktop/mobile posters
and scroll videos. Hero git status/diff against `HEAD` must stay empty.

## Server API client and BFF

- `lib/api-client` is **`server-only`**. It calls `INTERNAL_API_URL` with an
  allow-list of path prefixes (`/readyz`, `/livez`, `/v1/…`). Absolute upstream
  URLs are rejected.
- Types come from `@honey/contracts` generated OpenAPI types.
- There is **no generic reverse proxy**. The only Phase 9 BFF route is
  `GET /api/bff/readyz`, which probes upstream readiness and returns a small JSON
  or RFC 9457-style problem — it does not forward arbitrary paths or cookies.

## Session cookie forwarding

Opaque session cookies are read only in server code (`lib/session.ts`). When a
call opts in (`withSession` / `withCsrf`), the cookie and CSRF header are
forwarded to the API. Values must never enter Client Components, RSC props
serialized to the browser, or `NEXT_PUBLIC_*` env.

## Security headers

Set in `next.config.ts` for all paths:

- `Content-Security-Policy` (restrictive defaults; media/img from `'self'`)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy` (camera/mic/geo/payment/usb disabled)
- **`Strict-Transport-Security` only when the public site origin is HTTPS**
  (`NEXT_PUBLIC_SITE_URL` / `PUBLIC_SITE_URL`). `NODE_ENV=production` alone is
  not enough — local HTTP Docker must not emit HSTS.

`poweredByHeader` is off. Output mode is `standalone` for the Docker image.

## Accessibility, Playwright, and visuals

- Playwright config under `apps/web/playwright.config.ts`
- Specs: locale a11y (axe via `@axe-core/playwright`), Hero reduced-motion /
  no-video requests, visual snapshots for both locales
- Skip-to-content link and landmark structure in the storefront shell

```sh
pnpm test:e2e
```

## Docker web image

`docker/web.Dockerfile` builds a non-root Node 22 Alpine image with pnpm,
workspace filtered install, Next standalone output, and a healthcheck against
`/fa`. Build locally:

```sh
pnpm web:docker:build
```

The Compose stack still does not run the web container by default; the image is
built on demand for Phase 9 verification.

## Local commands

| Command | Purpose |
|---|---|
| `pnpm web:dev` | Next.js dev server on port 3000 |
| `pnpm i18n:validate` | Message catalog parity / HTML / empty checks |
| `pnpm stylelint` | Logical-CSS Stylelint over web + `@honey/ui` CSS |
| `pnpm test:e2e` | Playwright e2e (a11y, Hero motion, visuals, catalog SEO) |
| `pnpm test:e2e:performance` | Playwright Core Web Vitals budget on homepage |
| `pnpm phase9:verify` | Phase 9 structural / Hero integrity verifier |
| `pnpm phase10:verify` | Phase 10 catalog / SEO structural verifier |
| `pnpm web:docker:build` | Build `honey-web:phase10` image |

Also useful from the web package: `pnpm --filter @honey/web build`, `lint`,
`typecheck`, `test` (Vitest after dependency builds).

### Web-oriented environment

Documented in `.env.example` (no secrets):

| Variable | Role |
|---|---|
| `WEB_PORT` / `NEXT_PUBLIC_SITE_URL` / `PUBLIC_SITE_URL` | Public site URL and local port |
| `WEB_INDEXING_ENABLED` | Fail-closed indexing switch (default `false`) |
| `WEB_REVALIDATE_SECRET` | Bearer secret for catalog cache invalidation |
| `INTERNAL_API_URL` | Server-side API base (never exposed as `NEXT_PUBLIC_`) |
| `WEB_API_TIMEOUT_MS` | Upstream fetch timeout (default `5000`) |
| `SESSION_COOKIE_NAME` / `CSRF_*` | Cookie names aligned with the API |

## Phase 9 scope limits

**In scope (Phase 9):** App Router shell, i18n/ui packages, Hero, language switcher,
middleware, server API client, one BFF probe, security headers, Playwright/axe,
web Docker image.

**Phase 10 adds:** catalog listing, category, collection, PDP, search, SEO,
sitemaps, robots, cache revalidation — see
[`storefront-development.md`](storefront-development.md).

**Out of scope (do not add):**

- Cart and checkout UI (Phases 12–13)
- Price, stock, Add to Cart (Phases 11–12)
- Admin screens beyond an empty noindex layout shell (Phase 17)
- GSAP or other animation libraries
- Self-hosted brand webfonts claimed as final
