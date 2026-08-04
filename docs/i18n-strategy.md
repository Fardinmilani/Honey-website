# Internationalization Strategy

**Launch locales:** Persian (`fa`, RTL) and English (`en`, LTR)
**Design goal:** adding a third language must require configuration and content
only — never a change to the core domain, the database schema, or a component.

**Decision record:** [ADR-0009](adr/0009-locale-prefixed-routing.md)

---

## 1. Principles

1. **Locale is data, not structure.** A string column, a config entry, a catalog
   directory. Never a database enum, never a union type baked into the domain,
   never an `if (locale === 'fa')` in a component.
2. **No translated copy inside components.** Components receive keys or props.
   A component that contains a Persian or English sentence is a defect.
3. **Direction is derived, never hardcoded.** `dir` comes from the locale;
   layout uses logical CSS properties so RTL needs no separate stylesheet.
4. **Formatting happens at the edge of the system.** The API returns raw values
   (minor units, ISO timestamps, codes); the presentation layer formats them.
5. **Missing translations fail loudly in development and CI**, and fall back
   gracefully in production. Never a raw key in front of a customer.

---

## 2. Locale configuration

One file is the single source of truth: `packages/i18n/src/config.ts`.

```ts
export const locales = ['fa', 'en'] as const;
export const defaultLocale = 'fa';

export const localeConfig = {
  fa: {
    code: 'fa',
    bcp47: 'fa-IR',
    dir: 'rtl',
    label: 'فارسی',
    englishLabel: 'Persian',
    currency: 'IRR',
    calendar: 'persian',
    numberingSystem: 'arabext',   // Persian digits in prose
    dateFormat: 'fa-IR-u-ca-persian-nu-latn',
    hreflang: 'fa-IR',
    ogLocale: 'fa_IR',
    font: 'persian',
  },
  en: {
    code: 'en',
    bcp47: 'en-US',
    dir: 'ltr',
    label: 'English',
    englishLabel: 'English',
    currency: 'IRR',
    calendar: 'gregory',
    numberingSystem: 'latn',
    dateFormat: 'en-US',
    hreflang: 'en',
    ogLocale: 'en_US',
    font: 'latin',
  },
} as const satisfies Record<Locale, LocaleDefinition>;
```

Everything downstream — routing, middleware, `<html lang>` and `dir`, hreflang
tags, sitemaps, font loading, formatters, and the language switcher — reads from
this object. **Adding a locale means adding one entry here, one message catalog
directory, and translation rows in the database.** Nothing else.

The database stores `locale` as `text`, never as a Postgres enum, precisely so
that step needs no migration.

---

## 3. Routing

All content routes are locale-prefixed. There is no unprefixed content route —
including for the default locale.

```
/                    → 307 to /fa or /en (negotiated), never renders content
/fa                  → Persian home
/en                  → English home
/fa/products/asal-konar
/en/products/sidr-honey
/fa/admin/orders
```

Serving the default locale at both `/` and `/fa` would create two URLs for one
page: a duplicate-content problem, an ambiguous canonical, and a cache key that
depends on a header. Prefixing everything is unambiguous, cacheable, and
symmetric — every locale is a first-class citizen, so nothing breaks when the
"default" changes.

### Localized path segments

Route segments are localized through a pathname map so URLs read naturally in
each language, while staying ASCII for copy-paste and analytics safety:

```ts
export const pathnames = {
  '/products':        { fa: '/mahsoulat',  en: '/products' },
  '/products/[slug]': { fa: '/mahsoulat/[slug]', en: '/products/[slug]' },
  '/collections':     { fa: '/majmooeha', en: '/collections' },
  '/cart':            { fa: '/sabad',     en: '/cart' },
  '/checkout':        { fa: '/pardakht',  en: '/checkout' },
  '/account':         { fa: '/hesab',     en: '/account' },
  '/about':           { fa: '/darbareh',  en: '/about' },
} as const;
```

Persian segments use Latin transliteration rather than Persian script. Percent-
encoded UTF-8 URLs (`/fa/%D9%85%D8%AD%D8%B5%D9%88%D9%84%D8%A7%D8%AA/`) are valid
but become unreadable in logs, analytics, ad platforms, and anywhere a URL is
shared as plain text. Transliteration keeps the URL meaningful to a Persian
reader and portable everywhere else.

**Admin** routes are locale-prefixed too (`/fa/admin`, `/en/admin`) but their
segments are not translated — operational vocabulary stays stable for staff.

### Negotiation

At `/`, resolve in order: an explicit `NEXT_LOCALE` cookie → `Accept-Language`
matched against the enabled locales → `defaultLocale`. Then `307` (temporary, so
the redirect is never cached as permanent) to the prefixed URL. Content pages
never negotiate; the prefix already decided.

### Switching language

The switcher maps the **current route** to its counterpart in the target locale —
including the translated segment and the target-locale product slug — so a user
on a Persian product page lands on the same product in English, not on the home
page. If a translation does not exist for the current entity, the switcher points
at the closest published ancestor (category, then home) and says so.

---

## 4. Message catalogs

```
packages/i18n/messages/
├── fa/
│   ├── common.json      buttons, labels, generic actions
│   ├── nav.json         navigation and footer
│   ├── home.json
│   ├── product.json
│   ├── cart.json
│   ├── checkout.json
│   ├── account.json
│   ├── admin.json
│   ├── errors.json      keyed by the API's error codes
│   ├── seo.json         titles, descriptions, structured-data labels
│   └── legal.json
└── en/  (same namespaces, same keys)
```

**Rules**

- Keys are semantic, never the English text:
  `checkout.shipping.methodUnavailable`, not `"Shipping method unavailable"`.
- `en` is the **key-authoritative** catalog. A key that exists in `fa` but not in
  `en` is an error.
- Types are generated from the `en` catalog, so an unknown key is a TypeScript
  error at build time, not a runtime blank.
- ICU MessageFormat for plurals, selects, and interpolation:

```json
{
  "cart.itemCount": "{count, plural, =0 {سبد خرید خالی است} one {# محصول} other {# محصول}}",
  "product.harvest": "برداشت {season} {year}"
}
```

Persian has different plural rules from English (`one` applies to 1 and to 0.x
values); ICU handles this, manual `count === 1 ? … : …` does not.

- Namespaces load per route. The checkout catalog is not shipped on the home page.
- No string concatenation to build a sentence. Word order differs between
  languages, so a sentence is always one message with placeholders.
- No HTML in messages. Rich formatting uses tag-callback interpolation
  (`<b>{name}</b>` handled by the renderer), which keeps translations
  XSS-safe by construction.

**Content vs. UI copy.** Message catalogs hold interface chrome. Product names,
descriptions, tasting notes, pages, and articles are **content** and live in
database translation tables (see §5). The two never mix: nobody redeploys the app
to fix a typo in a product description, and nobody edits a button label in a CMS.

---

## 5. Content translations in the database

Sidecar tables keyed by `(entityId, locale)` — see
[`database-strategy.md §3`](database-strategy.md).

```
product          → product_translation      (name, slug, descriptions, tasting notes, meta)
category         → category_translation     (name, slug, description, meta)
collection       → collection_translation
page / article   → *_translation            (title, slug, blocks, meta)
faq_item         → faq_item_translation
shipping_method  → shipping_method_translation
apiary           → apiary_translation
```

**Publication rule.** An entity cannot be published until it has a translation
for every **enabled** locale. Admin shows a per-locale completeness indicator and
blocks the publish action, so a customer never meets an English product name in
the middle of a Persian page.

**Fallback.** Runtime falls back `requestedLocale → defaultLocale → any published`
only as a safety net for data that predates a newly added locale. Every fallback
increments a metric and is visible in an admin "missing translations" report. A
fallback in production is a bug to fix, not a feature to rely on.

**Adding a locale later** — enable it in config (disabled by default), bulk-create
draft translation rows, translate them in admin, then flip it to enabled. No
migration, no schema change, no code change. That is the entire point of the
design.

---

## 6. RTL and LTR

### Direction

`<html lang={locale} dir={localeConfig[locale].dir}>` — set once in the root
layout from config. Nothing else reads the locale to decide direction.

### CSS

**Logical properties only.** This is enforced by a stylelint rule, not by
discipline.

| Never | Always |
|---|---|
| `margin-left` | `margin-inline-start` |
| `padding-right` | `padding-inline-end` |
| `left: 0` | `inset-inline-start: 0` |
| `text-align: left` | `text-align: start` |
| `border-left` | `border-inline-start` |
| `float: right` | `float: inline-end` |

Tailwind's logical utilities (`ms-4`, `pe-2`, `start-0`, `text-start`) cover most
cases; the `rtl:`/`ltr:` variants handle the rest. One stylesheet serves both
directions.

### What mirrors and what does not

| Mirrors in RTL | Stays fixed |
|---|---|
| Layout, columns, sidebars | Logos and brand marks |
| Directional icons: arrows, chevrons, back/next | Media playback controls (▶ is universal) |
| Progress and stepper direction | Clock icons, checkmarks |
| Slider and carousel direction | Photographs and product imagery |
| Text alignment | Phone numbers, SKUs, tracking codes, order numbers |

Mirroring is applied with a `.mirror-rtl` utility
(`[dir='rtl'] .mirror-rtl { transform: scaleX(-1) }`), never by shipping a second
icon set.

### Bidirectional text

Mixed Persian and Latin content — a Persian sentence containing a SKU, a price,
or a brand name — needs isolation or the neutral characters around it reorder
visibly. Use `<bdi>` for embedded values of unknown direction, and the Unicode
isolate characters (`U+2068 FSI` / `U+2069 PDI`) inside formatted strings.
Parentheses and punctuation next to a Latin run in a Persian sentence are the
classic failure case, and it looks broken to a native reader.

### Numerals

- **Persian digits** (۰۱۲۳۴۵۶۷۸۹) in prose, prices, and dates for `fa`, via
  `Intl.NumberFormat('fa-IR')`.
- **Latin digits** always for: SKUs, order numbers, tracking numbers, phone
  numbers, postal codes, coupon codes, and anything a user will copy, type into
  another system, or read out to a courier.
- Input fields accept Persian, Arabic-Indic, and Latin digits and normalize to
  Latin before validation. A customer typing their phone number with a Persian
  keyboard must not get a validation error.

### Typography

- Persian: a well-hinted Persian face (for example Vazirmatn) with correct
  Arabic-script shaping. Persian glyphs need more line height than Latin —
  `line-height` is set per script, not globally.
- Latin: a display face for headings and a text face for body, chosen for the
  premium/natural register.
- Fonts are subset per script and preloaded **only for the active locale**.
  Loading Persian webfonts on the English site is a wasted round trip on the
  critical path.
- `font-display: swap`, with metric-compatible fallbacks to keep CLS at zero.
- ZWNJ (`U+200C`) is preserved in Persian content, in slugs' source text, and in
  search normalization — it is a letter-joining control, not whitespace.

---

## 7. Formatting

All formatting uses `Intl`, driven by the locale config. The API never returns a
formatted string.

| Value | Approach |
|---|---|
| Money | `Intl.NumberFormat(bcp47, { style: 'currency', currency })` from `{ amountMinor, currency }` |
| Numbers | `Intl.NumberFormat` with the locale's numbering system |
| Dates | `Intl.DateTimeFormat` — `fa-IR-u-ca-persian` renders the Jalali calendar |
| Relative time | `Intl.RelativeTimeFormat` |
| Lists | `Intl.ListFormat` |
| Sorting | `Intl.Collator` — Persian alphabetical order is not code-point order |

**Calendar.** Persian users see Jalali dates; English users see Gregorian. Both
render the same UTC instant. Storage and transport are always ISO-8601 UTC —
a Jalali date string is never stored.

**Currency display.** Amounts are stored and transported in IRR minor units.
Whether the Persian storefront displays Toman (IRR ÷ 10) is a **presentation**
decision, resolved in the formatter and never in the domain. It is listed as an
open question in [`PLANS.md §6`](../PLANS.md) because it affects copy and price
perception, not architecture.

---

## 8. Locale in the API

The API is locale-aware but not locale-shaped: it returns data, not pages.

- Locale resolution: `?locale=` → `Accept-Language` → user preference → default.
- The resolved locale is echoed in `meta.locale` so a client can never
  misattribute a cached response.
- Localized fields are returned flattened for the resolved locale
  (`{ "name": "عسل کنار" }`), not as a map — the client should not have to pick.
- Admin endpoints may request all locales explicitly (`?locales=all`) for the
  translation editor.
- **Errors return codes, not prose.** `code: "INSUFFICIENT_STOCK"` maps to
  `errors.insufficientStock` in the catalog. Translating server messages on the
  client is the only way error copy stays consistent with the rest of the UI.
- Cache keys always include the locale; `Vary: Accept-Language` on every
  cacheable response.

---

## 9. Emails and notifications

Rendered in the **recipient's** locale, which for an order is
`order.localeAtPurchase` — not the current UI language of whoever triggered the
send. A Persian customer whose order is refunded by an English-speaking staff
member receives a Persian email.

Templates are per locale and per channel, with the correct direction and font
stack in the email HTML (`dir="rtl"`, inline styles, table layout — email clients
do not support logical properties). Subject lines are translated, not
interpolated from fragments. SMS is plain text with no direction control
available, so Persian SMS content is written to read correctly unstyled.

---

## 10. Testing

| Level | Coverage |
|---|---|
| Unit | Formatters, digit normalization, Persian text normalization, pathname mapping |
| Catalog lint | Key parity across locales, ICU syntax validity, no HTML in messages, no orphan keys |
| Component | Every UI component rendered in both directions |
| Visual | Snapshots per direction for key layouts; RTL regressions are visual, not functional |
| E2E | Full purchase journey in `fa` and in `en`; language switch preserves the page; locale persists across navigation |
| A11y | axe in both locales; `lang` and `dir` correctness asserted |
| SEO | hreflang reciprocity, canonical self-reference, sitemap alternates |

CI fails on: a missing key in any enabled locale, a physical CSS property in a
component stylesheet, a hardcoded user-facing string in a component, an ICU
syntax error, or a non-reciprocal hreflang pair.

---

## 11. Adding a new locale — the whole procedure

1. Add the entry to `localeConfig` with `enabled: false`.
2. Copy `messages/en/` to `messages/<new>/` and translate.
3. Add the pathname map entries for the new locale.
4. Bulk-create draft translation rows for published content; translate in admin.
5. Add the font subset if the script requires one.
6. Run the i18n test suite; fix key parity and layout issues.
7. Flip `enabled: true`. Sitemaps, hreflang, and the switcher pick it up from
   config automatically.

No migration. No schema change. No component change. No domain change.
If any step in a future locale addition requires one of those, the abstraction has
leaked and it is a bug to fix rather than a cost to absorb.
