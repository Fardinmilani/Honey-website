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
import { buildEntityAlternatePaths, resolveCollectionLocaleSlugs } from '@/lib/catalog/alternates';
import { getCollectionBySlug, listCollectionProducts } from '@/lib/catalog/api';
import { parseCatalogListSearchParams } from '@/lib/catalog/query';
import {
  absoluteUrl,
  buildBreadcrumbListJsonLd,
  buildCatalogMetadata,
  buildCollectionPageJsonLd,
  buildItemListJsonLd,
  buildMetadataAlternates,
} from '@/lib/seo';

type CollectionPageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
  searchParams,
}: CollectionPageProps): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) {
    return {};
  }

  const parsed = parseCatalogListSearchParams(await searchParams);
  const result = await getCollectionBySlug(raw, slug);
  if (
    result.kind === 'redirect' ||
    result.kind === 'not_found' ||
    result.kind === 'upstream_error'
  ) {
    return {};
  }

  const collection = result.entity;
  const slugsByLocale = await resolveCollectionLocaleSlugs(collection.id);
  const alternatePaths = buildEntityAlternatePaths('/collections/[slug]', slugsByLocale);
  const alternates = buildMetadataAlternates(raw, alternatePaths);

  return buildCatalogMetadata({
    locale: raw,
    title: collection.metaTitle ?? collection.name,
    description: collection.metaDescription ?? collection.description ?? collection.name,
    canonicalPath: localizedHref('/collections/[slug]', raw, { slug: collection.slug }),
    alternates,
    noindex: parsed.hasFacets || parsed.hasCursor,
  });
}

export default async function CollectionPage({ params, searchParams }: CollectionPageProps) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) {
    notFound();
  }
  const locale = raw;
  const t = createTranslator(locale);
  const parsed = parseCatalogListSearchParams(await searchParams);
  const result = await getCollectionBySlug(locale, slug);

  if (result.kind === 'redirect') {
    permanentRedirect(localizedHref('/collections/[slug]', locale, { slug: result.currentSlug }));
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

  const collection = result.entity;
  const listPath = localizedHref('/collections/[slug]', locale, { slug: collection.slug });
  const productsResponse = await listCollectionProducts(collection.slug, {
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

  const slugsByLocale = await resolveCollectionLocaleSlugs(collection.id);
  const localeHrefs = buildEntityAlternatePaths('/collections/[slug]', slugsByLocale);
  const config = getLocaleConfig(locale);
  const collectionPath = localizedHref('/collections/[slug]', locale, { slug: collection.slug });

  const breadcrumbItems = [
    { label: t('navigation.home'), href: localizedHref('/', locale) },
    { label: t('navigation.collections'), href: localizedHref('/collections', locale) },
    { label: collection.name },
  ];

  const breadcrumbJsonLd = buildBreadcrumbListJsonLd([
    { name: t('navigation.home'), url: absoluteUrl(localizedHref('/', locale)) },
    {
      name: t('navigation.collections'),
      url: absoluteUrl(localizedHref('/collections', locale)),
    },
    { name: collection.name, url: absoluteUrl(collectionPath) },
  ]);

  const collectionPageJsonLd = buildCollectionPageJsonLd({
    name: collection.name,
    description: collection.description ?? collection.name,
    url: absoluteUrl(collectionPath),
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
            <h1 className="catalog-page__title">{collection.name}</h1>
            {collection.description !== null && collection.description !== '' ? (
              <p className="catalog-page__lead">{collection.description}</p>
            ) : null}
          </header>

          <div className="catalog-page__layout catalog-page__layout--with-filters">
            <CatalogFilters locale={locale} action={listPath} values={filterValues} />
            <div>
              {productsResponse.data.length === 0 ? (
                <EmptyState locale={locale} messageKey="catalog.emptyCollection" />
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
