/**
 * Deterministic catalog slugs from `packages/db/seed/data.ts`.
 * Prefer ASCII slugs for FA where the seed provides them.
 */
export const CATALOG_SEED = {
  products: {
    en: {
      wildflower: 'wildflower-honey',
      thyme: 'thyme-honey',
      acacia: 'acacia-honey',
    },
    fa: {
      wildflower: 'عسل-گلهای-وحشی',
      thyme: 'asal-avishan',
      acacia: 'asal-aghaqia',
    },
  },
  categories: {
    en: 'honey',
    fa: 'asal',
  },
  collections: {
    en: 'mountain-harvest',
    fa: 'bardasht-koohestan',
  },
  /** Internal supplier legal name — must never appear on the storefront. */
  supplierLegalName: 'Selected Supply Fixture',
} as const;

export const CATALOG_ROUTES = {
  products: { fa: '/fa/mahsoulat', en: '/en/products' },
  categories: { fa: '/fa/dasteha', en: '/en/categories' },
  collections: { fa: '/fa/majmooeha', en: '/en/collections' },
  search: { fa: '/fa/jostoju', en: '/en/search' },
} as const;
