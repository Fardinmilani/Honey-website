import 'server-only';

import { locales, localizedHref, type InternalPathname, type Locale } from '@honey/i18n';

import { listCategories, listCollections, listProducts } from './api';

const MAX_PAGES = 5;
const PAGE_LIMIT = 100;

type SlugEntity = { readonly id: string; readonly slug: string };

type PagedResponse<T> = {
  readonly data: readonly T[];
  readonly page: { readonly nextCursor: string | null; readonly hasMore: boolean };
};

async function findSlugById<T extends SlugEntity>(
  entityId: string,
  fetchPage: (locale: Locale, cursor?: string) => Promise<PagedResponse<T>>,
): Promise<Partial<Record<Locale, string>>> {
  const result: Partial<Record<Locale, string>> = {};

  for (const locale of locales) {
    let cursor: string | undefined;
    let pagesFetched = 0;
    let found = false;

    while (!found && pagesFetched < MAX_PAGES) {
      const response = await fetchPage(locale, cursor);
      const match = response.data.find((item) => item.id === entityId);
      if (match !== undefined) {
        result[locale] = match.slug;
        found = true;
        break;
      }
      if (!response.page.hasMore || response.page.nextCursor === null) {
        break;
      }
      cursor = response.page.nextCursor;
      pagesFetched += 1;
    }
  }

  return result;
}

export async function resolveProductLocaleSlugs(
  productId: string,
): Promise<Partial<Record<Locale, string>>> {
  return findSlugById(productId, (locale, cursor) =>
    listProducts({
      locale,
      limit: PAGE_LIMIT,
      ...(cursor !== undefined ? { cursor } : {}),
    }),
  );
}

export async function resolveCategoryLocaleSlugs(
  categoryId: string,
): Promise<Partial<Record<Locale, string>>> {
  const result: Partial<Record<Locale, string>> = {};
  for (const locale of locales) {
    const response = await listCategories(locale);
    const match = response.data.find((category) => category.id === categoryId);
    if (match !== undefined) {
      result[locale] = match.slug;
    }
  }
  return result;
}

export async function resolveCollectionLocaleSlugs(
  collectionId: string,
): Promise<Partial<Record<Locale, string>>> {
  const result: Partial<Record<Locale, string>> = {};
  for (const locale of locales) {
    const response = await listCollections(locale);
    const match = response.data.find((collection) => collection.id === collectionId);
    if (match !== undefined) {
      result[locale] = match.slug;
    }
  }
  return result;
}

/**
 * Maps per-locale entity slugs to full locale-prefixed storefront paths.
 */
export function buildEntityAlternatePaths(
  internalPath: Extract<
    InternalPathname,
    '/products/[slug]' | '/categories/[slug]' | '/collections/[slug]'
  >,
  slugsByLocale: Partial<Record<Locale, string>>,
): Partial<Record<Locale, string>> {
  const result: Partial<Record<Locale, string>> = {};
  for (const locale of locales) {
    const slug = slugsByLocale[locale];
    if (slug !== undefined && slug !== '') {
      result[locale] = localizedHref(internalPath, locale, { slug });
    }
  }
  return result;
}
