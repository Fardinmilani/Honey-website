/** Shared catalog query constants — safe for client and server. */

export const PRODUCT_SORTS = ['newest', 'oldest', 'name', 'sort-weight'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const SEARCH_SORTS = ['relevance', 'newest', 'name'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export const CATALOG_FILTER_KEYS = [
  'honeyVarietal',
  'originRegion',
  'floralSource',
  'categoryId',
  'collectionId',
  'minimumNetWeightGrams',
  'maximumNetWeightGrams',
] as const;

export type CatalogFilterKey = (typeof CATALOG_FILTER_KEYS)[number];
