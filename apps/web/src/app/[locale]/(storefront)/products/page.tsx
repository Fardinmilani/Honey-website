import { createTranslator, isLocale, localizedHref, type Locale } from '@honey/i18n';
import { Container } from '@honey/ui';
import type { Metadata } from 'next';

import { CatalogFilters } from '@/components/catalog/catalog-filters';
import { CatalogPagination } from '@/components/catalog/catalog-pagination';
import { EmptyState } from '@/components/catalog/empty-state';
import { JsonLdScript } from '@/components/catalog/json-ld-script';
import { ProductGrid } from '@/components/catalog/product-grid';
import { listProducts } from '@/lib/catalog/api';
import { parseCatalogListSearchParams } from '@/lib/catalog/query';
import {
  absoluteUrl,
  buildCatalogMetadata,
  buildItemListJsonLd,
  buildMetadataAlternates,
} from '@/lib/seo';

type ProductsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function listingAlternatePaths(): Record<Locale, string> {
  return {
    fa: localizedHref('/products', 'fa'),
    en: localizedHref('/products', 'en'),
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: ProductsPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) {
    return {};
  }
  const t = createTranslator(raw);
  const parsed = parseCatalogListSearchParams(await searchParams);
  const alternates = buildMetadataAlternates(raw, listingAlternatePaths());

  return buildCatalogMetadata({
    locale: raw,
    title: t('seo.productsTitle'),
    description: t('seo.productsDescription'),
    canonicalPath: localizedHref('/products', raw),
    alternates,
    noindex: parsed.hasFacets || parsed.hasCursor,
  });
}

export default async function ProductsPage({ params, searchParams }: ProductsPageProps) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) {
    return null;
  }
  const locale = raw;
  const t = createTranslator(locale);
  const parsed = parseCatalogListSearchParams(await searchParams);
  const listPath = localizedHref('/products', locale);

  const response = await listProducts({
    locale,
    ...(parsed.cursor !== undefined ? { cursor: parsed.cursor } : {}),
    ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
    ...(parsed.sort !== undefined ? { sort: parsed.sort } : {}),
    ...(parsed.honeyVarietal !== undefined ? { honeyVarietal: parsed.honeyVarietal } : {}),
    ...(parsed.originRegion !== undefined ? { originRegion: parsed.originRegion } : {}),
    ...(parsed.floralSource !== undefined ? { floralSource: parsed.floralSource } : {}),
    ...(parsed.categoryId !== undefined ? { categoryId: parsed.categoryId } : {}),
    ...(parsed.collectionId !== undefined ? { collectionId: parsed.collectionId } : {}),
    ...(parsed.minimumNetWeightGrams !== undefined
      ? { minimumNetWeightGrams: parsed.minimumNetWeightGrams }
      : {}),
    ...(parsed.maximumNetWeightGrams !== undefined
      ? { maximumNetWeightGrams: parsed.maximumNetWeightGrams }
      : {}),
  });

  const filterValues = {
    ...(parsed.cursor !== undefined ? { cursor: parsed.cursor } : {}),
    ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
    ...(parsed.sort !== undefined ? { sort: parsed.sort } : {}),
    ...(parsed.honeyVarietal !== undefined ? { honeyVarietal: parsed.honeyVarietal } : {}),
    ...(parsed.originRegion !== undefined ? { originRegion: parsed.originRegion } : {}),
    ...(parsed.floralSource !== undefined ? { floralSource: parsed.floralSource } : {}),
    ...(parsed.categoryId !== undefined ? { categoryId: parsed.categoryId } : {}),
    ...(parsed.collectionId !== undefined ? { collectionId: parsed.collectionId } : {}),
    ...(parsed.minimumNetWeightGrams !== undefined
      ? { minimumNetWeightGrams: parsed.minimumNetWeightGrams }
      : {}),
    ...(parsed.maximumNetWeightGrams !== undefined
      ? { maximumNetWeightGrams: parsed.maximumNetWeightGrams }
      : {}),
  };

  const showItemList = !parsed.hasFacets && !parsed.hasCursor && response.data.length > 0;
  const itemListJsonLd = showItemList
    ? buildItemListJsonLd(
        response.data.map((product) => ({
          name: product.name,
          url: absoluteUrl(localizedHref('/products/[slug]', locale, { slug: product.slug })),
        })),
      )
    : null;

  return (
    <Container>
      <div className="catalog-page">
        <header className="catalog-page__header">
          <h1 className="catalog-page__title">{t('catalog.productsHeading')}</h1>
          <p className="catalog-page__lead">{t('catalog.productsDescription')}</p>
        </header>

        <div className="catalog-page__layout catalog-page__layout--with-filters">
          <CatalogFilters locale={locale} action={listPath} values={filterValues} />
          <div>
            {response.data.length === 0 ? (
              <EmptyState locale={locale} messageKey="catalog.emptyProducts" />
            ) : (
              <ProductGrid locale={locale} products={response.data} />
            )}
            <CatalogPagination
              locale={locale}
              basePath={listPath}
              nextCursor={response.page.nextCursor}
              query={filterValues}
            />
          </div>
        </div>
      </div>
      {itemListJsonLd !== null ? <JsonLdScript data={itemListJsonLd} /> : null}
    </Container>
  );
}
