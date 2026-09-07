import { createTranslator, isLocale, localizedHref, type Locale } from '@honey/i18n';
import { Container } from '@honey/ui';
import type { Metadata } from 'next';
import NextLink from 'next/link';

import { ProductGrid } from '@/components/catalog/product-grid';
import { SearchForm } from '@/components/catalog/search-form';
import { searchProducts } from '@/lib/catalog/api';
import { parseSearchSearchParams } from '@/lib/catalog/query';
import { buildCatalogMetadata, buildMetadataAlternates } from '@/lib/seo';

type SearchPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function searchAlternatePaths(): Record<Locale, string> {
  return {
    fa: localizedHref('/search', 'fa'),
    en: localizedHref('/search', 'en'),
  };
}

export async function generateMetadata({ params }: SearchPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) {
    return {};
  }
  const t = createTranslator(raw);
  const alternates = buildMetadataAlternates(raw, searchAlternatePaths());

  return buildCatalogMetadata({
    locale: raw,
    title: t('seo.searchTitle'),
    description: t('seo.searchDescription'),
    canonicalPath: localizedHref('/search', raw),
    alternates,
    noindex: true,
  });
}

export default async function SearchPage({ params, searchParams }: SearchPageProps) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) {
    return null;
  }
  const locale = raw;
  const t = createTranslator(locale);
  const parsed = parseSearchSearchParams(await searchParams);
  const searchPath = localizedHref('/search', locale);

  const hasQuery = parsed.q.trim() !== '';
  const results = hasQuery
    ? await searchProducts({
        locale,
        q: parsed.q,
        ...(parsed.cursor !== undefined ? { cursor: parsed.cursor } : {}),
        ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
        ...(parsed.sort !== undefined ? { sort: parsed.sort } : {}),
      })
    : null;

  const nextPageHref =
    results !== null && results.page.nextCursor !== null
      ? (() => {
          const params = new URLSearchParams();
          params.set('q', parsed.q);
          params.set('cursor', results.page.nextCursor);
          if (parsed.limit !== undefined) {
            params.set('limit', String(parsed.limit));
          }
          if (parsed.sort !== undefined) {
            params.set('sort', parsed.sort);
          }
          return `${searchPath}?${params.toString()}`;
        })()
      : null;

  return (
    <Container>
      <div className="catalog-page">
        <header className="catalog-page__header">
          <h1 className="catalog-page__title">{t('search.heading')}</h1>
          <p className="catalog-page__lead">{t('search.description')}</p>
        </header>

        <SearchForm locale={locale} defaultQuery={parsed.q} />

        {!hasQuery ? (
          <p className="catalog-empty__message">{t('search.emptyQuery')}</p>
        ) : results !== null && results.data.length === 0 ? (
          <p className="catalog-empty__message">{t('search.noResults', { query: parsed.q })}</p>
        ) : results !== null ? (
          <div className="catalog-page__results">
            <h2 className="catalog-page__title">
              {t('search.resultsHeading', { query: parsed.q })}
            </h2>
            <ProductGrid locale={locale} products={results.data} />
            {nextPageHref !== null ? (
              <nav className="catalog-pagination" aria-label={t('accessibility.paginationNav')}>
                <NextLink href={nextPageHref} className="catalog-pagination__next ui-link">
                  {t('catalog.paginationMore')}
                </NextLink>
              </nav>
            ) : null}
          </div>
        ) : null}
      </div>
    </Container>
  );
}
