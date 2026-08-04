# ADR-0009: Locale-prefixed routes and sidecar translations

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

Persian (RTL) and English (LTR) ship at launch, and more languages must be
addable later without touching the core domain. Two things have to be decided
once and lived with: how locale appears in the URL, and how translated content is
stored.

## Decision

**Routing** — every content URL carries a locale prefix, including the default
locale. `/` performs a `307` to the negotiated locale and is never indexed.
Route segments are localized through a pathname map using **Latin
transliteration** for Persian (`/fa/mahsoulat/asal-konar`), not Persian script.

**Storage** — translated content lives in sidecar tables keyed by
`(entityId, locale)`, with `locale` as a `text` column, never a Postgres enum.
UI copy lives in per-locale ICU message catalogs in `packages/i18n`, never inline
in a component.

**Configuration** — one `localeConfig` object drives routing, direction, fonts,
formatters, hreflang, Open Graph locales, sitemaps, and the language switcher.

## Consequences

**Positive** — one page has exactly one URL per locale, so canonicals and cache
keys are unambiguous; every locale is symmetric, so changing the default breaks
nothing; per-locale unique slugs are a real database constraint; per-locale
full-text indexes are possible; adding a language is config plus content plus
translation rows — no migration, no schema change, no component change;
transliterated URLs stay readable in logs, analytics, and shared text where
percent-encoded UTF-8 does not.

**Negative / accepted** — the extra redirect at `/`; the pathname map is one more
thing to keep in sync per locale (covered by a test); sidecar tables mean a join
on every content read (cheap, and indexed); transliteration is a judgement call
per segment and needs an agreed scheme; every entity needs a translation for
every enabled locale before it can be published, which is deliberate friction.

## Alternatives considered

| Option | Why not |
|---|---|
| Default locale unprefixed (`/` = fa, `/en` = en) | Two URLs for one page, ambiguous canonical, cache key depends on a header, asymmetric behaviour |
| Subdomains (`fa.` / `en.`) | Separate cookie and cache domains; more DNS and TLS operations; no benefit at our scale |
| ccTLDs (`.ir` / `.com`) | Separate domain authority to build; heavy operational overhead |
| Persian-script URL segments | Percent-encoded UTF-8 is unreadable in logs, analytics, ad platforms, and plain-text sharing |
| `name jsonb` instead of translation tables | Cannot express per-locale slug uniqueness; no per-locale text indexes; adding a locale rewrites rows |
| `locale` as a Postgres enum | Every new language becomes a migration — the exact cost this decision removes |
