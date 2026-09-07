import { createTranslator, getLocaleConfig, isLocale, localizedHref } from '@honey/i18n';
import { Container } from '@honey/ui';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { CatalogFilters } from '@/components/catalog/catalog-filters';
import { CatalogPagination } from '@/components/catalog/catalog-pagination';
import { EmptyState } from '@/components/catalog/empty-state';
import { JsonLdScript } from '@/components/catalog/json-ld-script';
import { ProductGrid } from '@/components/catalog/product-grid';
import { SetEntityLocaleHrefs } from '@/components/shell/set-entity-locale-hrefs';
import { buildEntityAlternatePaths, resolveCategoryLocaleSlugs } from '@/lib/catalog/alternates';
import { getCategoryBySlug, listCategoryProducts } from '@/lib/catalog/api';
import { parseCatalogListSearchParams } from '@/lib/catalog/query';
import {
  absoluteUrl,
  buildBreadcrumbListJsonLd,
  buildCatalogMetadata,
  buildCollectionPageJsonLd,
  buildItemListJsonLd,
  buildMetadataAlternates,
} from '@/lib/seo';

type CategoryPageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
  searchParams,
}: CategoryPageProps): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) {
    return {};
  }

  const parsed = parseCatalogListSearchParams(await searchParams);
  const result = await getCategoryBySlug(raw, slug);
  if (
    result.kind === 'redirect' ||
    result.kind === 'not_found' ||
    result.kind === 'upstream_error'
  ) {
    return {};
  }

  const category = result.entity;
  const slugsByLocale = await resolveCategoryLocaleSlugs(category.id);
  const alternatePaths = buildEntityAlternatePaths('/categories/[slug]', slugsByLocale);
  const alternates = buildMetadataAlternates(raw, alternatePaths);

  return buildCatalogMetadata({
    locale: raw,
    title: category.metaTitle ?? category.name,
    description: category.metaDescription ?? category.description ?? category.name,
    canonicalPath: localizedHref('/categories/[slug]', raw, { slug: category.slug }),
    alternates,
    noindex: parsed.hasFacets || parsed.hasCursor,
  });
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) {
    notFound();
  }
  const locale = raw;
  const t = createTranslator(locale);
  const parsed = parseCatalogListSearchParams(await searchParams);
  const result = await getCategoryBySlug(locale, slug);

  if (result.kind === 'redirect') {
    permanentRedirect(localizedHref('/categories/[slug]', locale, { slug: result.currentSlug }));
  }
  if (result.kind === 'not_found') {
    notFound();
  }
  if (result.kind === 'upstream_error') {
    return (
      <Container>
        <p className="catalog-empty__message">{t('errors.upstreamUnavailable')}</p>
      </Container>
    );
  }

  const category = result.entity;
  const listPath = localizedHref('/categories/[slug]', locale, { slug: category.slug });
  const productsResponse = await listCategoryProducts(category.slug, {
    locale,
    ...(parsed.cursor !== undefined ? { cursor: parsed.cursor } : {}),
    ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
    ...(parsed.sort !== undefined ? { sort: parsed.sort } : {}),
    ...(parsed.honeyVarietal !== undefined ? { honeyVarietal: parsed.honeyVarietal } : {}),
    ...(parsed.originRegion !== undefined ? { originRegion: parsed.originRegion } : {}),
    ...(parsed.floralSource !== undefined ? { floralSource: parsed.floralSource } : {}),
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
    ...(parsed.minimumNetWeightGrams !== undefined
      ? { minimumNetWeightGrams: parsed.minimumNetWeightGrams }
      : {}),
    ...(parsed.maximumNetWeightGrams !== undefined
      ? { maximumNetWeightGrams: parsed.maximumNetWeightGrams }
      : {}),
  };

  const slugsByLocale = await resolveCategoryLocaleSlugs(category.id);
  const localeHrefs = buildEntityAlternatePaths('/categories/[slug]', slugsByLocale);
  const config = getLocaleConfig(locale);
  const categoryPath = localizedHref('/categories/[slug]', locale, { slug: category.slug });

  const breadcrumbItems = [
    { label: t('navigation.home'), href: localizedHref('/', locale) },
    { label: t('navigation.categories'), href: localizedHref('/categories', locale) },
    { label: category.name },
  ];

  const breadcrumbJsonLd = buildBreadcrumbListJsonLd([
    { name: t('navigation.home'), url: absoluteUrl(localizedHref('/', locale)) },
    { name: t('navigation.categories'), url: absoluteUrl(localizedHref('/categories', locale)) },
    { name: category.name, url: absoluteUrl(categoryPath) },
  ]);

  const collectionPageJsonLd = buildCollectionPageJsonLd({
    name: category.name,
    description: category.description ?? category.name,
    url: absoluteUrl(categoryPath),
    inLanguage: config.bcp47,
  });

  const showItemList = !parsed.hasFacets && !parsed.hasCursor && productsResponse.data.length > 0;
  const itemListJsonLd = showItemList
    ? buildItemListJsonLd(
        productsResponse.data.map((product) => ({
          name: product.name,
          url: absoluteUrl(localizedHref('/products/[slug]', locale, { slug: product.slug })),
        })),
      )
    : null;

  return (
    <>
      <SetEntityLocaleHrefs hrefs={localeHrefs} />
      <Container>
        <div className="catalog-page">
          <Breadcrumbs locale={locale} items={breadcrumbItems} />
          <header className="catalog-page__header">
            <h1 className="catalog-page__title">{category.name}</h1>
            {category.description !== null && category.description !== '' ? (
              <p className="catalog-page__lead">{category.description}</p>
            ) : null}
          </header>

          <div className="catalog-page__layout catalog-page__layout--with-filters">
            <CatalogFilters locale={locale} action={listPath} values={filterValues} />
            <div>
              {productsResponse.data.length === 0 ? (
                <EmptyState locale={locale} messageKey="catalog.emptyCategory" />
              ) : (
                <ProductGrid locale={locale} products={productsResponse.data} />
              )}
              <CatalogPagination
                locale={locale}
                basePath={listPath}
                nextCursor={productsResponse.page.nextCursor}
                query={filterValues}
              />
            </div>
          </div>
        </div>
      </Container>
      <JsonLdScript data={breadcrumbJsonLd} />
      <JsonLdScript data={collectionPageJsonLd} />
      {itemListJsonLd !== null ? <JsonLdScript data={itemListJsonLd} /> : null}
    </>
  );
}
