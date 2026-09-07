import { createTranslator, isLocale, localizedHref } from '@honey/i18n';
import { Container, Stack } from '@honey/ui';
import { notFound } from 'next/navigation';
import NextLink from 'next/link';

import { Hero } from '@/components/hero/hero';
import { ProductGrid } from '@/components/catalog/product-grid';
import { ApiClientError } from '@/lib/api-client/server';
import { listCategories, listCollections, listProducts } from '@/lib/catalog/api';

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: HomePageProps) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) {
    notFound();
  }
  const locale = raw;
  const t = createTranslator(locale);
  const productsHref = localizedHref('/products', locale);

  let featuredProducts: Awaited<ReturnType<typeof listProducts>>['data'] = [];
  let categories: Awaited<ReturnType<typeof listCategories>>['data'] = [];
  let featuredCollection: Awaited<ReturnType<typeof listCollections>>['data'][number] | undefined;
  let catalogUnavailable = false;

  try {
    const [productsResponse, categoriesResponse, collectionsResponse] = await Promise.all([
      listProducts({ locale, limit: 4, sort: 'sort-weight' }),
      listCategories(locale),
      listCollections(locale),
    ]);
    featuredProducts = productsResponse.data;
    categories = categoriesResponse.data;
    featuredCollection = [...collectionsResponse.data].sort(
      (left, right) => left.sortWeight - right.sortWeight,
    )[0];
  } catch (error) {
    if (error instanceof ApiClientError) {
      catalogUnavailable = true;
    } else {
      throw error;
    }
  }

  return (
    <Stack gap="xl">
      <Hero
        locale={locale}
        headline={t('home.headline')}
        supporting={t('home.supporting')}
        ctaLabel={t('home.ctaExplore')}
        ctaHref={productsHref}
        ariaLabel={t('home.heroAriaLabel')}
      />
      <Container>
        {catalogUnavailable ? (
          <p className="home-lead">{t('home.unavailableCatalog')}</p>
        ) : (
          <Stack gap="xl" className="home-sections">
            {featuredProducts.length > 0 ? (
              <section className="home-section" aria-labelledby="home-featured-products">
                <div className="home-section__header">
                  <h2 id="home-featured-products" className="home-section__title">
                    {t('home.featuredProductsHeading')}
                  </h2>
                  <NextLink href={productsHref} className="ui-link ui-link--muted">
                    {t('home.browseAllProducts')}
                  </NextLink>
                </div>
                <ProductGrid locale={locale} products={featuredProducts} />
              </section>
            ) : (
              <p className="home-lead">{t('home.emptyCatalog')}</p>
            )}

            {categories.length > 0 ? (
              <section className="home-section" aria-labelledby="home-categories">
                <h2 id="home-categories" className="home-section__title">
                  {t('home.categoriesHeading')}
                </h2>
                <ul className="catalog-index catalog-index--compact">
                  {categories.map((category) => (
                    <li key={category.id} className="catalog-index__item">
                      <NextLink
                        href={localizedHref('/categories/[slug]', locale, { slug: category.slug })}
                        className="catalog-index__link ui-link"
                      >
                        {category.name}
                      </NextLink>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {featuredCollection !== undefined ? (
              <section className="home-section" aria-labelledby="home-featured-collection">
                <h2 id="home-featured-collection" className="home-section__title">
                  {t('home.featuredCollectionsHeading')}
                </h2>
                <NextLink
                  href={localizedHref('/collections/[slug]', locale, {
                    slug: featuredCollection.slug,
                  })}
                  className="home-collection-card ui-link"
                >
                  <span className="home-collection-card__name">{featuredCollection.name}</span>
                  {featuredCollection.description !== null &&
                  featuredCollection.description !== '' ? (
                    <span className="home-collection-card__description">
                      {featuredCollection.description}
                    </span>
                  ) : null}
                </NextLink>
              </section>
            ) : null}
          </Stack>
        )}
      </Container>
    </Stack>
  );
}
