import 'server-only';

import type { components } from '@honey/contracts';
import { getLocaleConfig, type Locale } from '@honey/i18n';

import { ApiClientError, apiFetch } from '../api-client/server';
import { catalogTags } from '../cache/tags';

export type PublicProduct = components['schemas']['PublicProductDto'];
export type PublicCategory = components['schemas']['PublicCategoryDto'];
export type PublicCollection = components['schemas']['PublicCollectionDto'];
export type PublicPageMeta = components['schemas']['PageDto'];
export type PublicMeta = components['schemas']['MetaDto'];

export type ProductListResponse = components['schemas']['ProductListResponseDto'];
export type CategoryListResponse = components['schemas']['CategoryListResponseDto'];
export type CollectionListResponse = components['schemas']['CollectionListResponseDto'];
export type ProductResponse = components['schemas']['ProductResponseDto'];
export type CategoryResponse = components['schemas']['CategoryResponseDto'];
export type CollectionResponse = components['schemas']['CollectionResponseDto'];

export type { CatalogFilterKey, ProductSort, SearchSort } from './constants';
export { CATALOG_FILTER_KEYS, PRODUCT_SORTS, SEARCH_SORTS } from './constants';

import type { ProductSort, SearchSort } from './constants';

export type CatalogListQuery = {
  readonly locale: Locale;
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
};

export type CatalogSearchQuery = {
  readonly locale: Locale;
  readonly q: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly sort?: SearchSort;
};

const DEFAULT_REVALIDATE_SECONDS = 60;

function slugPathSegment(slug: string): string {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    decoded = slug;
  }
  return encodeURIComponent(decoded);
}

function listSearchParams(
  query: CatalogListQuery,
): Record<string, string | number | boolean | undefined> {
  return {
    locale: query.locale,
    cursor: query.cursor,
    limit: query.limit,
    sort: query.sort,
    honeyVarietal: query.honeyVarietal,
    originRegion: query.originRegion,
    floralSource: query.floralSource,
    categoryId: query.categoryId,
    collectionId: query.collectionId,
    minimumNetWeightGrams: query.minimumNetWeightGrams,
    maximumNetWeightGrams: query.maximumNetWeightGrams,
  };
}

function cacheNext(tags: string[]) {
  return { revalidate: DEFAULT_REVALIDATE_SECONDS, tags };
}

/** Price-bearing projections are live reads; catalog content remains tag-cached separately. */
function currentPriceRead() {
  return { cache: 'no-store' as const };
}

export async function listProducts(query: CatalogListQuery): Promise<ProductListResponse> {
  return apiFetch<ProductListResponse>({
    path: '/v1/catalog/products',
    searchParams: listSearchParams(query),
    locale: query.locale,
    currency: getLocaleConfig(query.locale).currency,
    ...currentPriceRead(),
  });
}

export async function searchProducts(query: CatalogSearchQuery): Promise<ProductListResponse> {
  return apiFetch<ProductListResponse>({
    path: '/v1/catalog/search',
    searchParams: {
      locale: query.locale,
      q: query.q,
      cursor: query.cursor,
      limit: query.limit,
      sort: query.sort,
    },
    locale: query.locale,
    currency: getLocaleConfig(query.locale).currency,
    // Search results are not shared under attacker-controlled query keys.
    cache: 'no-store',
  });
}

export async function listCategories(locale: Locale): Promise<CategoryListResponse> {
  return apiFetch<CategoryListResponse>({
    path: '/v1/catalog/categories',
    searchParams: { locale },
    locale,
    next: cacheNext([catalogTags.catalog, catalogTags.locale(locale), catalogTags.categories]),
  });
}

export async function listCollections(locale: Locale): Promise<CollectionListResponse> {
  return apiFetch<CollectionListResponse>({
    path: '/v1/catalog/collections',
    searchParams: { locale },
    locale,
    next: cacheNext([catalogTags.catalog, catalogTags.locale(locale), catalogTags.collections]),
  });
}

export async function listCategoryProducts(
  slug: string,
  query: CatalogListQuery,
): Promise<ProductListResponse> {
  return apiFetch<ProductListResponse>({
    path: `/v1/catalog/categories/${slugPathSegment(slug)}/products`,
    searchParams: listSearchParams(query),
    locale: query.locale,
    currency: getLocaleConfig(query.locale).currency,
    ...currentPriceRead(),
  });
}

export async function listCollectionProducts(
  slug: string,
  query: CatalogListQuery,
): Promise<ProductListResponse> {
  return apiFetch<ProductListResponse>({
    path: `/v1/catalog/collections/${slugPathSegment(slug)}/products`,
    searchParams: listSearchParams(query),
    locale: query.locale,
    currency: getLocaleConfig(query.locale).currency,
    ...currentPriceRead(),
  });
}

export type EntityResult<T> =
  | { readonly kind: 'found'; readonly entity: T; readonly meta: PublicMeta }
  | { readonly kind: 'redirect'; readonly currentSlug: string; readonly locale: Locale }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'upstream_error'; readonly status: number };

/**
 * Fetch a slug-resolved entity with manual redirect handling so the storefront
 * can issue a single permanent redirect to the web canonical URL (not the API).
 */
async function fetchBySlug<T>(options: {
  readonly path: string;
  readonly locale: Locale;
  readonly tags: string[];
  readonly cache?: RequestCache;
}): Promise<EntityResult<T>> {
  try {
    const payload = await apiFetchRaw({
      path: options.path,
      searchParams: { locale: options.locale },
      locale: options.locale,
      currency: getLocaleConfig(options.locale).currency,
      ...(options.cache === undefined
        ? { next: cacheNext(options.tags) }
        : { cache: options.cache }),
    });

    if (payload.redirectSlug !== undefined) {
      return {
        kind: 'redirect',
        currentSlug: payload.redirectSlug,
        locale: options.locale,
      };
    }

    const body = payload.body as { data: T; meta: PublicMeta } | undefined;
    if (body === undefined || body.data === undefined) {
      return { kind: 'not_found' };
    }
    return { kind: 'found', entity: body.data, meta: body.meta };
  } catch (error) {
    if (error instanceof ApiClientError) {
      if (error.presentation.status === 404) {
        return { kind: 'not_found' };
      }
      return { kind: 'upstream_error', status: error.presentation.status };
    }
    return { kind: 'upstream_error', status: 502 };
  }
}

export async function getProductBySlug(
  locale: Locale,
  slug: string,
): Promise<EntityResult<PublicProduct>> {
  return fetchBySlug<PublicProduct>({
    path: `/v1/catalog/products/${slugPathSegment(slug)}`,
    locale,
    tags: [
      catalogTags.catalog,
      catalogTags.locale(locale),
      catalogTags.currency(getLocaleConfig(locale).currency),
      catalogTags.productSlug(slug),
      catalogTags.products,
    ],
    cache: 'no-store',
  });
}

export async function getCategoryBySlug(
  locale: Locale,
  slug: string,
): Promise<EntityResult<PublicCategory>> {
  return fetchBySlug<PublicCategory>({
    path: `/v1/catalog/categories/${slugPathSegment(slug)}`,
    locale,
    tags: [
      catalogTags.catalog,
      catalogTags.locale(locale),
      catalogTags.categorySlug(slug),
      catalogTags.categories,
    ],
  });
}

export async function getCollectionBySlug(
  locale: Locale,
  slug: string,
): Promise<EntityResult<PublicCollection>> {
  return fetchBySlug<PublicCollection>({
    path: `/v1/catalog/collections/${slugPathSegment(slug)}`,
    locale,
    tags: [
      catalogTags.catalog,
      catalogTags.locale(locale),
      catalogTags.collectionSlug(slug),
      catalogTags.collections,
    ],
  });
}

type RawFetchResult = {
  readonly body: unknown;
  readonly redirectSlug?: string;
};

/**
 * Low-level fetch that does not follow redirects, so historical catalog slugs
 * surface as a single web-level permanent redirect target.
 */
async function apiFetchRaw(options: {
  readonly path: string;
  readonly searchParams?: Record<string, string | number | boolean | undefined>;
  readonly locale?: string;
  readonly currency?: string;
  readonly cache?: RequestCache;
  readonly next?: { revalidate?: number | false; tags?: string[] };
}): Promise<RawFetchResult> {
  const { getWebEnv } = await import('../env');
  const env = getWebEnv();
  const normalized = options.path.startsWith('/') ? options.path : `/${options.path}`;
  if (normalized.includes('://') || normalized.startsWith('//')) {
    throw new Error('Absolute upstream URLs are not allowed');
  }
  if (!(normalized === '/readyz' || normalized === '/livez' || normalized.startsWith('/v1/'))) {
    throw new Error(`API path is not allow-listed: ${normalized}`);
  }

  const url = new URL(normalized, env.internalApiUrl);
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({ Accept: 'application/json' });
  headers.set('x-request-id', crypto.randomUUID());
  if (options.locale) {
    headers.set('accept-language', options.locale);
  }
  if (options.currency) {
    headers.set('x-currency', options.currency);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.apiTimeoutMs);
  try {
    const init: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } } = {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: 'manual',
    };
    if (options.next !== undefined) {
      init.next = options.next;
    }
    if (options.cache !== undefined) {
      init.cache = options.cache;
    }

    const response = await fetch(url, init);

    if (response.status === 301 || response.status === 308) {
      const location = response.headers.get('location');
      if (!location) {
        throw new ApiClientError({ status: 502, title: 'Upstream unavailable' });
      }
      const redirected = new URL(location, env.internalApiUrl);
      const parts = redirected.pathname.split('/').filter(Boolean);
      // /v1/catalog/{products|categories|collections}/{slug}
      const slug = parts.length >= 4 ? decodeURIComponent(parts[3] ?? '') : '';
      if (slug === '') {
        throw new ApiClientError({ status: 502, title: 'Upstream unavailable' });
      }
      return { body: undefined, redirectSlug: slug };
    }

    if (response.status === 304) {
      throw new ApiClientError({ status: 404, title: 'Not found' });
    }

    const text = await response.text();
    let payload: unknown = undefined;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = undefined;
      }
    }

    if (!response.ok) {
      throw new ApiClientError({
        status: response.status,
        title:
          typeof payload === 'object' &&
          payload !== null &&
          'title' in payload &&
          typeof (payload as { title: unknown }).title === 'string'
            ? (payload as { title: string }).title
            : response.status >= 500
              ? 'Something went wrong'
              : 'Request failed',
      });
    }

    return { body: payload };
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError({ status: 502, title: 'Upstream unavailable' });
  } finally {
    clearTimeout(timeout);
  }
}
