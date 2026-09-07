import { createTranslator, isLocale, localizedHref, type Locale } from '@honey/i18n';
import { Container } from '@honey/ui';
import type { Metadata } from 'next';
import NextLink from 'next/link';

import { listCategories } from '@/lib/catalog/api';
import { buildCatalogMetadata, buildMetadataAlternates } from '@/lib/seo';

type CategoriesPageProps = {
  params: Promise<{ locale: string }>;
};

function listingAlternatePaths(): Record<Locale, string> {
  return {
    fa: localizedHref('/categories', 'fa'),
    en: localizedHref('/categories', 'en'),
  };
}

export async function generateMetadata({ params }: CategoriesPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) {
    return {};
  }
  const t = createTranslator(raw);
  const alternates = buildMetadataAlternates(raw, listingAlternatePaths());

  return buildCatalogMetadata({
    locale: raw,
    title: t('seo.categoriesTitle'),
    description: t('seo.categoriesDescription'),
    canonicalPath: localizedHref('/categories', raw),
    alternates,
  });
}

export default async function CategoriesPage({ params }: CategoriesPageProps) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) {
    return null;
  }
  const locale = raw;
  const t = createTranslator(locale);
  const response = await listCategories(locale);

  return (
    <Container>
      <div className="catalog-page">
        <header className="catalog-page__header">
          <h1 className="catalog-page__title">{t('catalog.categoriesHeading')}</h1>
          <p className="catalog-page__lead">{t('catalog.categoriesDescription')}</p>
        </header>

        {response.data.length === 0 ? (
          <p className="catalog-empty__message">{t('catalog.emptyProducts')}</p>
        ) : (
          <ul className="catalog-index">
            {response.data.map((category) => (
              <li key={category.id} className="catalog-index__item">
                <NextLink
                  href={localizedHref('/categories/[slug]', locale, { slug: category.slug })}
                  className="catalog-index__link ui-link"
                >
                  <span className="catalog-index__name">{category.name}</span>
                  {category.description !== null && category.description !== '' ? (
                    <span className="catalog-index__description">{category.description}</span>
                  ) : null}
                </NextLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}
