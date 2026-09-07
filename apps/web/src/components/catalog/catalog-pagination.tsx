import { createTranslator, type Locale } from '@honey/i18n';
import NextLink from 'next/link';

import type { ParsedCatalogQuery } from '../../lib/catalog/query';
import { serializeCatalogListParams } from '../../lib/catalog/query';

type CatalogPaginationProps = {
  readonly locale: Locale;
  /** Locale-prefixed path without query string. */
  readonly basePath: string;
  readonly nextCursor: string | null;
  readonly query: Omit<ParsedCatalogQuery, 'hasFacets' | 'hasCursor' | 'unsupportedKeys'>;
};

export function CatalogPagination({ locale, basePath, nextCursor, query }: CatalogPaginationProps) {
  const t = createTranslator(locale);

  if (nextCursor === null) {
    return null;
  }

  const href = `${basePath}${serializeCatalogListParams({ ...query, cursor: nextCursor })}`;

  return (
    <nav className="catalog-pagination" aria-label={t('accessibility.paginationNav')}>
      <NextLink href={href} className="catalog-pagination__next ui-link">
        {t('catalog.paginationMore')}
      </NextLink>
    </nav>
  );
}
