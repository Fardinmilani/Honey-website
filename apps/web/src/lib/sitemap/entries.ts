import 'server-only';

import { getLocaleConfig, locales, localizedHref, type Locale } from '@honey/i18n';

import {
  listCategories,
  listCollections,
  listProducts,
  type PublicCategory,
  type PublicCollection,
  type PublicProduct,
} from '../catalog/api';
import { absoluteUrl } from '../seo/absolute-url';

import { buildAlternatesForPaths, toLastmod, type SitemapUrlEntry } from './xml';

const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

async function fetchAllProducts(locale: Locale): Promise<readonly PublicProduct[]> {
  const products: PublicProduct[] = [];
  let cursor: string | undefined;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const response = await listProducts({
      locale,
      limit: PAGE_LIMIT,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    products.push(...response.data);
    if (!response.page.hasMore || response.page.nextCursor === null) {
      break;
    }
    cursor = response.page.nextCursor;
    pages += 1;
  }

  return products;
}

function uniqueIds(productsByLocale: Readonly<Record<Locale, readonly PublicProduct[]>>): string[] {
  const ids = new Set<string>();
  for (const locale of locales) {
    for (const product of productsByLocale[locale]) {
      ids.add(product.id);
    }
  }
  return [...ids];
}

export async function buildStaticSitemapEntries(): Promise<SitemapUrlEntry[]> {
  const pathsByLocale: Partial<Record<Locale, string>> = {};
  for (const locale of locales) {
    pathsByLocale[locale] = localizedHref('/', locale);
  }
  const alternates = buildAlternatesForPaths(pathsByLocale);

  return [
    {
      loc: absoluteUrl(localizedHref('/', 'en')),
      alternates,
    },
  ];
}

export async function buildProductSitemapEntries(): Promise<SitemapUrlEntry[]> {
  const productsByLocale = {} as Record<Locale, readonly PublicProduct[]>;
  for (const locale of locales) {
    productsByLocale[locale] = await fetchAllProducts(locale);
  }

  const entries: SitemapUrlEntry[] = [];
  for (const id of uniqueIds(productsByLocale)) {
    const pathsByLocale: Partial<Record<Locale, string>> = {};
    let lastmod: string | undefined;

    for (const locale of locales) {
      const product = productsByLocale[locale].find((item) => item.id === id);
      if (product !== undefined) {
        pathsByLocale[locale] = localizedHref('/products/[slug]', locale, { slug: product.slug });
        const candidate = toLastmod(product.publishedAt);
        if (candidate !== undefined) {
          lastmod = candidate;
        }
      }
    }

    const canonicalPath = pathsByLocale.en ?? pathsByLocale.fa;
    if (canonicalPath === undefined) {
      continue;
    }

    entries.push({
      loc: absoluteUrl(canonicalPath),
      ...(lastmod !== undefined ? { lastmod } : {}),
      alternates: buildAlternatesForPaths(pathsByLocale),
    });
  }

  return entries;
}

function buildTaxonomyEntries<T extends { readonly id: string; readonly slug: string }>(
  itemsByLocale: Readonly<Record<Locale, readonly T[]>>,
  internalPath: '/categories/[slug]' | '/collections/[slug]',
  lastmodFor?: (item: T) => string | undefined,
): SitemapUrlEntry[] {
  const ids = new Set<string>();
  for (const locale of locales) {
    for (const item of itemsByLocale[locale]) {
      ids.add(item.id);
    }
  }

  const entries: SitemapUrlEntry[] = [];
  for (const id of ids) {
    const pathsByLocale: Partial<Record<Locale, string>> = {};
    let lastmod: string | undefined;

    for (const locale of locales) {
      const item = itemsByLocale[locale].find((entry) => entry.id === id);
      if (item !== undefined) {
        pathsByLocale[locale] = localizedHref(internalPath, locale, { slug: item.slug });
        if (lastmodFor !== undefined) {
          const candidate = lastmodFor(item);
          if (candidate !== undefined) {
            lastmod = candidate;
          }
        }
      }
    }

    const canonicalPath = pathsByLocale.en ?? pathsByLocale.fa;
    if (canonicalPath === undefined) {
      continue;
    }

    entries.push({
      loc: absoluteUrl(canonicalPath),
      ...(lastmod !== undefined ? { lastmod } : {}),
      alternates: buildAlternatesForPaths(pathsByLocale),
    });
  }

  return entries;
}

export async function buildCategorySitemapEntries(): Promise<SitemapUrlEntry[]> {
  const categoriesByLocale = {} as Record<Locale, readonly PublicCategory[]>;
  for (const locale of locales) {
    const response = await listCategories(locale);
    categoriesByLocale[locale] = response.data;
  }

  const listingPaths: Partial<Record<Locale, string>> = {};
  for (const locale of locales) {
    listingPaths[locale] = localizedHref('/categories', locale);
  }

  const listingEntry: SitemapUrlEntry = {
    loc: absoluteUrl(localizedHref('/categories', 'en')),
    alternates: buildAlternatesForPaths(listingPaths),
  };

  return [listingEntry, ...buildTaxonomyEntries(categoriesByLocale, '/categories/[slug]')];
}

export async function buildCollectionSitemapEntries(): Promise<SitemapUrlEntry[]> {
  const collectionsByLocale = {} as Record<Locale, readonly PublicCollection[]>;
  for (const locale of locales) {
    const response = await listCollections(locale);
    collectionsByLocale[locale] = response.data;
  }

  const listingPaths: Partial<Record<Locale, string>> = {};
  for (const locale of locales) {
    listingPaths[locale] = localizedHref('/collections', locale);
  }

  const listingEntry: SitemapUrlEntry = {
    loc: absoluteUrl(localizedHref('/collections', 'en')),
    alternates: buildAlternatesForPaths(listingPaths),
  };

  return [
    listingEntry,
    ...buildTaxonomyEntries(collectionsByLocale, '/collections/[slug]', (collection) =>
      toLastmod(collection.publishedAt),
    ),
  ];
}

export async function buildLocaleTypeSitemapEntries(
  locale: Locale,
  type: 'static' | 'products' | 'categories' | 'collections',
): Promise<SitemapUrlEntry[]> {
  let entries: SitemapUrlEntry[];
  switch (type) {
    case 'static':
      entries = await buildStaticSitemapEntries();
      break;
    case 'products':
      entries = await buildProductSitemapEntries();
      break;
    case 'categories':
      entries = await buildCategorySitemapEntries();
      break;
    case 'collections':
      entries = await buildCollectionSitemapEntries();
      break;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }

  const hreflang = getLocaleConfig(locale).hreflang;
  const localizedEntries: SitemapUrlEntry[] = [];
  for (const entry of entries) {
    const localized = entry.alternates.find((alternate) => alternate.hreflang === hreflang);
    if (localized === undefined) {
      continue;
    }
    localizedEntries.push({
      loc: localized.href,
      ...(entry.lastmod !== undefined ? { lastmod: entry.lastmod } : {}),
      alternates: entry.alternates,
    });
  }
  return localizedEntries;
}
