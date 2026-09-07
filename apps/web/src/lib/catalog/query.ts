import { PRODUCT_SORTS, SEARCH_SORTS, type ProductSort, type SearchSort } from './constants';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type ParsedCatalogQuery = {
  readonly cursor?: string;
  readonly limit?: number;
  readonly sort?: ProductSort;
  readonly honeyVarietal?: string;
  readonly originRegion?: string;
  readonly floralSource?: string;
  readonly categoryId?: string;
  readonly collectionId?: string;
  readonly minimumNetWeightGrams?: number;
  readonly maximumNetWeightGrams?: number;
  /** True when any filter or non-default sort is present (SEO: noindex). */
  readonly hasFacets: boolean;
  /** True when a cursor is present (SEO: noindex; not a random-access page). */
  readonly hasCursor: boolean;
  /** Unsupported keys that were present and ignored/rejected. */
  readonly unsupportedKeys: readonly string[];
};

export type ParsedSearchQuery = {
  readonly q: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly sort?: SearchSort;
  readonly hasCursor: boolean;
  readonly unsupportedKeys: readonly string[];
};

const ALLOWED_LIST_KEYS = new Set([
  'cursor',
  'limit',
  'sort',
  'honeyVarietal',
  'originRegion',
  'floralSource',
  'categoryId',
  'collectionId',
  'minimumNetWeightGrams',
  'maximumNetWeightGrams',
]);

const ALLOWED_SEARCH_KEYS = new Set(['q', 'cursor', 'limit', 'sort']);

function firstString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

function parseLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (!/^[0-9]{1,3}$/u.test(raw)) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1 || value > 100) return undefined;
  return value;
}

function parseWeight(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (!/^[0-9]{1,6}$/u.test(raw)) return undefined;
  return Number.parseInt(raw, 10);
}

function isProductSort(value: string): value is ProductSort {
  return (PRODUCT_SORTS as readonly string[]).includes(value);
}

function isSearchSort(value: string): value is SearchSort {
  return (SEARCH_SORTS as readonly string[]).includes(value);
}

/**
 * Allow-listed catalog listing query parser.
 * Unknown keys are reported and never forwarded to the API.
 */
export function parseCatalogListSearchParams(
  input: Record<string, string | string[] | undefined>,
): ParsedCatalogQuery {
  const unsupportedKeys = Object.keys(input).filter((key) => !ALLOWED_LIST_KEYS.has(key));

  const cursor = firstString(input['cursor']);
  const limit = parseLimit(firstString(input['limit']));
  const sortRaw = firstString(input['sort']);
  const sort = sortRaw !== undefined && isProductSort(sortRaw) ? sortRaw : undefined;

  const honeyVarietal = firstString(input['honeyVarietal']);
  const originRegion = firstString(input['originRegion']);
  const floralSource = firstString(input['floralSource']);
  const categoryIdRaw = firstString(input['categoryId']);
  const collectionIdRaw = firstString(input['collectionId']);
  const categoryId =
    categoryIdRaw !== undefined && UUID_RE.test(categoryIdRaw) ? categoryIdRaw : undefined;
  const collectionId =
    collectionIdRaw !== undefined && UUID_RE.test(collectionIdRaw) ? collectionIdRaw : undefined;
  const minimumNetWeightGrams = parseWeight(firstString(input['minimumNetWeightGrams']));
  const maximumNetWeightGrams = parseWeight(firstString(input['maximumNetWeightGrams']));

  const hasFacets = Boolean(
    honeyVarietal ||
    originRegion ||
    floralSource ||
    categoryId ||
    collectionId ||
    minimumNetWeightGrams !== undefined ||
    maximumNetWeightGrams !== undefined ||
    (sort !== undefined && sort !== 'newest'),
  );

  return {
    ...(cursor !== undefined ? { cursor } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(sort !== undefined ? { sort } : {}),
    ...(honeyVarietal !== undefined ? { honeyVarietal } : {}),
    ...(originRegion !== undefined ? { originRegion } : {}),
    ...(floralSource !== undefined ? { floralSource } : {}),
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(collectionId !== undefined ? { collectionId } : {}),
    ...(minimumNetWeightGrams !== undefined ? { minimumNetWeightGrams } : {}),
    ...(maximumNetWeightGrams !== undefined ? { maximumNetWeightGrams } : {}),
    hasFacets,
    hasCursor: cursor !== undefined,
    unsupportedKeys,
  };
}

export function parseSearchSearchParams(
  input: Record<string, string | string[] | undefined>,
): ParsedSearchQuery {
  const unsupportedKeys = Object.keys(input).filter((key) => !ALLOWED_SEARCH_KEYS.has(key));
  const q = firstString(input['q']) ?? '';
  const cursor = firstString(input['cursor']);
  const limit = parseLimit(firstString(input['limit']));
  const sortRaw = firstString(input['sort']);
  const sort = sortRaw !== undefined && isSearchSort(sortRaw) ? sortRaw : undefined;

  return {
    q,
    ...(cursor !== undefined ? { cursor } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(sort !== undefined ? { sort } : {}),
    hasCursor: cursor !== undefined,
    unsupportedKeys,
  };
}

/** Serialize allow-listed list params for pagination links (deterministic). */
export function serializeCatalogListParams(
  query: Omit<ParsedCatalogQuery, 'hasFacets' | 'hasCursor' | 'unsupportedKeys'> & {
    readonly cursor?: string;
  },
): string {
  const params = new URLSearchParams();
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.sort) params.set('sort', query.sort);
  if (query.honeyVarietal) params.set('honeyVarietal', query.honeyVarietal);
  if (query.originRegion) params.set('originRegion', query.originRegion);
  if (query.floralSource) params.set('floralSource', query.floralSource);
  if (query.categoryId) params.set('categoryId', query.categoryId);
  if (query.collectionId) params.set('collectionId', query.collectionId);
  if (query.minimumNetWeightGrams !== undefined) {
    params.set('minimumNetWeightGrams', String(query.minimumNetWeightGrams));
  }
  if (query.maximumNetWeightGrams !== undefined) {
    params.set('maximumNetWeightGrams', String(query.maximumNetWeightGrams));
  }
  const encoded = params.toString();
  return encoded === '' ? '' : `?${encoded}`;
}
