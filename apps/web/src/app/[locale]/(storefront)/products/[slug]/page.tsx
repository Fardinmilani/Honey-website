import { createTranslator, getLocaleConfig, isLocale, localizedHref } from '@honey/i18n';
import { Container, Stack } from '@honey/ui';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { JsonLdScript } from '@/components/catalog/json-ld-script';
import { ProductGallery } from '@/components/catalog/product-gallery';
import { SetEntityLocaleHrefs } from '@/components/shell/set-entity-locale-hrefs';
import { buildEntityAlternatePaths, resolveProductLocaleSlugs } from '@/lib/catalog/alternates';
import { getProductBySlug } from '@/lib/catalog/api';
import { pickGalleryImages, publicImageSrc } from '@/lib/catalog/media';
import {
  absoluteUrl,
  buildBreadcrumbListJsonLd,
  buildCatalogMetadata,
  buildMetadataAlternates,
  buildProductJsonLd,
} from '@/lib/seo';

type ProductPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) {
    return {};
  }

  const result = await getProductBySlug(raw, slug);
  if (result.kind === 'redirect') {
    return {};
  }
  if (result.kind === 'not_found' || result.kind === 'upstream_error') {
    return {};
  }

  const product = result.entity;
  const slugsByLocale = await resolveProductLocaleSlugs(product.id);
  const alternatePaths = buildEntityAlternatePaths('/products/[slug]', slugsByLocale);
  const alternates = buildMetadataAlternates(raw, alternatePaths);

  const ogImageCandidate = pickGalleryImages(product.media)[0];
  const ogImage = ogImageCandidate !== undefined ? publicImageSrc(ogImageCandidate.url) : undefined;

  return buildCatalogMetadata({
    locale: raw,
    title: product.metaTitle ?? product.name,
    description:
      product.metaDescription ?? product.shortDescription ?? product.description ?? product.name,
    canonicalPath: localizedHref('/products/[slug]', raw, { slug: product.slug }),
    alternates,
    ...(ogImage !== undefined ? { ogImage } : {}),
  });
}

function productDescription(product: {
  readonly description: string | null;
  readonly shortDescription: string | null;
}): string {
  if (product.description !== null && product.description !== '') {
    return product.description;
  }
  if (product.shortDescription !== null && product.shortDescription !== '') {
    return product.shortDescription;
  }
  return '';
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) {
    notFound();
  }
  const locale = raw;
  const t = createTranslator(locale);
  const result = await getProductBySlug(locale, slug);

  if (result.kind === 'redirect') {
    permanentRedirect(localizedHref('/products/[slug]', locale, { slug: result.currentSlug }));
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

  const product = result.entity;
  const slugsByLocale = await resolveProductLocaleSlugs(product.id);
  const localeHrefs = buildEntityAlternatePaths('/products/[slug]', slugsByLocale);
  const productPath = localizedHref('/products/[slug]', locale, { slug: product.slug });
  const config = getLocaleConfig(locale);
  const description = productDescription(product);
  const images = pickGalleryImages(product.media).map((item) =>
    absoluteUrl(publicImageSrc(item.url)),
  );

  const breadcrumbItems = [
    { label: t('navigation.home'), href: localizedHref('/', locale) },
    { label: t('navigation.products'), href: localizedHref('/products', locale) },
    { label: product.name },
  ];

  const breadcrumbJsonLd = buildBreadcrumbListJsonLd([
    { name: t('navigation.home'), url: absoluteUrl(localizedHref('/', locale)) },
    { name: t('navigation.products'), url: absoluteUrl(localizedHref('/products', locale)) },
    { name: product.name, url: absoluteUrl(productPath) },
  ]);

  const productJsonLd = buildProductJsonLd({
    name: product.name,
    description: description || product.name,
    images,
    brandName: t('common.brandName'),
    inLanguage: config.bcp47,
    url: absoluteUrl(productPath),
    ...(product.honeyVarietal !== null && product.honeyVarietal !== ''
      ? { category: product.honeyVarietal }
      : {}),
  });

  return (
    <>
      <SetEntityLocaleHrefs hrefs={localeHrefs} />
      <Container>
        <article className="product-detail">
          <Breadcrumbs locale={locale} items={breadcrumbItems} />
          <ProductGallery media={product.media} productName={product.name} locale={locale} />
          <Stack as="div" gap="md" className="product-detail__info">
            <h1 className="product-detail__title">{product.name}</h1>
            {product.shortDescription !== null && product.shortDescription !== '' ? (
              <p className="product-detail__description">{product.shortDescription}</p>
            ) : null}
            {description !== '' && description !== product.shortDescription ? (
              <p className="product-detail__description">{description}</p>
            ) : null}

            <dl className="product-detail__meta">
              {product.honeyVarietal !== null && product.honeyVarietal !== '' ? (
                <>
                  <dt>{t('product.honeyVarietal')}</dt>
                  <dd>{product.honeyVarietal}</dd>
                </>
              ) : null}
              {product.originRegion !== null && product.originRegion !== '' ? (
                <>
                  <dt>{t('product.originRegion')}</dt>
                  <dd>{product.originRegion}</dd>
                </>
              ) : null}
              {product.originAltitudeBand !== null && product.originAltitudeBand !== '' ? (
                <>
                  <dt>{t('product.originAltitude')}</dt>
                  <dd>{product.originAltitudeBand}</dd>
                </>
              ) : null}
              {product.harvestSeason !== null && product.harvestSeason !== '' ? (
                <>
                  <dt>{t('product.harvestSeason')}</dt>
                  <dd>{product.harvestSeason}</dd>
                </>
              ) : null}
              {product.floralSources.length > 0 ? (
                <>
                  <dt>{t('product.floralSources')}</dt>
                  <dd>{product.floralSources.join(', ')}</dd>
                </>
              ) : null}
              {product.tastingNotes !== null && product.tastingNotes !== '' ? (
                <>
                  <dt>{t('product.tastingNotes')}</dt>
                  <dd>{product.tastingNotes}</dd>
                </>
              ) : null}
              {product.pairingSuggestions !== null && product.pairingSuggestions !== '' ? (
                <>
                  <dt>{t('product.pairingSuggestions')}</dt>
                  <dd>{product.pairingSuggestions}</dd>
                </>
              ) : null}
            </dl>

            {product.storyHtml !== null && product.storyHtml !== '' ? (
              <section>
                <h2>{t('product.story')}</h2>
                <div
                  className="product-detail__description"
                  dangerouslySetInnerHTML={{ __html: product.storyHtml }}
                />
              </section>
            ) : null}

            {product.variants.length > 0 ? (
              <section>
                <h2>{t('product.variants')}</h2>
                <ul className="product-detail__meta">
                  {product.variants.map((variant) => (
                    <li key={variant.id}>
                      <strong>{variant.name}</strong>
                      {' — '}
                      {t('catalog.variantWeight', { grams: variant.netWeightGrams })}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </Stack>
        </article>
      </Container>
      <JsonLdScript data={productJsonLd} />
      <JsonLdScript data={breadcrumbJsonLd} />
    </>
  );
}
