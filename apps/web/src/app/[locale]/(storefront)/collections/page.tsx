import { createTranslator, isLocale, localizedHref, type Locale } from '@honey/i18n';
import { Container } from '@honey/ui';
import type { Metadata } from 'next';
import NextLink from 'next/link';

import { listCollections } from '@/lib/catalog/api';
import { buildCatalogMetadata, buildMetadataAlternates } from '@/lib/seo';

type CollectionsPageProps = {
  params: Promise<{ locale: string }>;
};

function listingAlternatePaths(): Record<Locale, string> {
  return {
    fa: localizedHref('/collections', 'fa'),
    en: localizedHref('/collections', 'en'),
  };
}

export async function generateMetadata({ params }: CollectionsPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) {
    return {};
  }
  const t = createTranslator(raw);
  const alternates = buildMetadataAlternates(raw, listingAlternatePaths());

  return buildCatalogMetadata({
    locale: raw,
    title: t('seo.collectionsTitle'),
    description: t('seo.collectionsDescription'),
    canonicalPath: localizedHref('/collections', raw),
    alternates,
  });
}

export default async function CollectionsPage({ params }: CollectionsPageProps) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) {
    return null;
  }
  const locale = raw;
  const t = createTranslator(locale);
  const response = await listCollections(locale);

  return (
    <Container>
      <div className="catalog-page">
        <header className="catalog-page__header">
          <h1 className="catalog-page__title">{t('catalog.collectionsHeading')}</h1>
          <p className="catalog-page__lead">{t('catalog.collectionsDescription')}</p>
        </header>

        {response.data.length === 0 ? (
          <p className="catalog-empty__message">{t('catalog.emptyCollection')}</p>
        ) : (
          <ul className="catalog-index">
            {response.data.map((collection) => (
              <li key={collection.id} className="catalog-index__item">
                <NextLink
                  href={localizedHref('/collections/[slug]', locale, { slug: collection.slug })}
                  className="catalog-index__link ui-link"
                >
                  <span className="catalog-index__name">{collection.name}</span>
                  {collection.description !== null && collection.description !== '' ? (
                    <span className="catalog-index__description">{collection.description}</span>
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
