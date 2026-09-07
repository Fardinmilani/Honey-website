# `@honey/i18n`

Authoritative locale configuration, UI message catalogs, negotiation helpers,
pathname mapping, and `Intl`-based formatters for the Honey storefront.

No `next-intl` (or other heavy i18n framework) — see
[ADR-0027](../../docs/adr/0027-web-bff-and-i18n-runtime.md). Adding a locale is
configuration plus catalogs — components never branch on `if (locale === 'fa')`.
`apps/web` middleware and layouts consume this package for negotiation, `lang` /
`dir`, the language switcher, and copy.

## Launch locales

| Code | Direction | Default |
| ---- | --------- | ------- |
| `fa` | RTL       | **yes** |
| `en` | LTR       | no      |

## Public API

```ts
import {
  locales,
  defaultLocale,
  localeConfig,
  isLocale,
  parseLocale,
  negotiateLocale,
  createTranslator,
  formatNumber,
  formatDate,
  formatRelativeTime,
  formatList,
  formatCurrency,
  normalizeDigits,
  pathnames,
  localizedHref,
  switchLocalePath,
  validateMessageCatalogs,
} from '@honey/i18n';
```

### Translator API

Dotted keys (chosen over nested `t.home('headline')` for portability):

```ts
const t = createTranslator('fa');
t('home.headline');
t('accessibility.currentLanguage', { language: localeConfig.fa.label });
```

- **Development** (`NODE_ENV !== 'production'`): missing keys throw.
- **Production**: missing keys return `errors.generic` (never the raw key).
- CI must run `pnpm validate:messages` / `validateMessageCatalogs()` so missing
  keys never ship.

### Negotiation

Priority: `NEXT_LOCALE` cookie → `Accept-Language` → `defaultLocale` (`fa`).

### Pathnames (Phase 10 catalog)

Home and catalog routes are mapped:

```ts
pathnames['/'];
pathnames['/products']; // fa: /mahsoulat, en: /products
pathnames['/categories']; // fa: /dasteha, en: /categories
pathnames['/collections']; // fa: /majmooeha, en: /collections
pathnames['/search']; // fa: /jostoju, en: /search
localizedHref('/products', 'fa'); // '/fa/mahsoulat'
switchLocalePath('/fa/mahsoulat', 'en'); // '/en/products' (entity slugs via context)
```

Later phases add cart, checkout, and account segments without changing helpers.
See [`docs/storefront-development.md`](../../docs/storefront-development.md).

### Phase 9–10 namespaces

`common`, `navigation`, `home`, `accessibility`, `errors`

English is key-authoritative; Persian must keep exact key parity. No HTML in
messages. No marketplace, lab, moisture, or medical copy.

## Scripts

```bash
pnpm --filter @honey/i18n build
pnpm --filter @honey/i18n typecheck
pnpm --filter @honey/i18n lint
pnpm --filter @honey/i18n test
pnpm --filter @honey/i18n validate:messages
```
