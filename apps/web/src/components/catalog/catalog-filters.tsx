import { createTranslator, type Locale } from '@honey/i18n';
import { Button, Inline } from '@honey/ui';
import NextLink from 'next/link';

import { PRODUCT_SORTS } from '../../lib/catalog/constants';
import type { ParsedCatalogQuery } from '../../lib/catalog/query';

type CatalogFiltersProps = {
  readonly locale: Locale;
  /** Locale-prefixed path for the current listing (form action). */
  readonly action: string;
  readonly values: Omit<ParsedCatalogQuery, 'hasFacets' | 'hasCursor' | 'unsupportedKeys'>;
};

const SORT_LABEL_KEYS = {
  newest: 'catalog.sortNewest',
  oldest: 'catalog.sortOldest',
  name: 'catalog.sortName',
  'sort-weight': 'catalog.sortWeight',
} as const satisfies Record<(typeof PRODUCT_SORTS)[number], string>;

export function CatalogFilters({ locale, action, values }: CatalogFiltersProps) {
  const t = createTranslator(locale);

  return (
    <form className="catalog-filters" method="get" action={action}>
      <fieldset className="catalog-filters__fieldset">
        <legend className="catalog-filters__legend">{t('catalog.filterHeading')}</legend>
        <div className="catalog-filters__grid">
          <label className="catalog-filters__field">
            <span className="catalog-filters__label">{t('catalog.filterVarietal')}</span>
            <input
              className="catalog-filters__input"
              type="text"
              name="honeyVarietal"
              defaultValue={values.honeyVarietal ?? ''}
            />
          </label>
          <label className="catalog-filters__field">
            <span className="catalog-filters__label">{t('catalog.filterOrigin')}</span>
            <input
              className="catalog-filters__input"
              type="text"
              name="originRegion"
              defaultValue={values.originRegion ?? ''}
            />
          </label>
          <label className="catalog-filters__field">
            <span className="catalog-filters__label">{t('catalog.filterFloral')}</span>
            <input
              className="catalog-filters__input"
              type="text"
              name="floralSource"
              defaultValue={values.floralSource ?? ''}
            />
          </label>
          <label className="catalog-filters__field">
            <span className="catalog-filters__label">{t('catalog.filterMinWeight')}</span>
            <input
              className="catalog-filters__input"
              type="number"
              name="minimumNetWeightGrams"
              min={1}
              inputMode="numeric"
              defaultValue={
                values.minimumNetWeightGrams !== undefined
                  ? String(values.minimumNetWeightGrams)
                  : ''
              }
            />
          </label>
          <label className="catalog-filters__field">
            <span className="catalog-filters__label">{t('catalog.filterMaxWeight')}</span>
            <input
              className="catalog-filters__input"
              type="number"
              name="maximumNetWeightGrams"
              min={1}
              inputMode="numeric"
              defaultValue={
                values.maximumNetWeightGrams !== undefined
                  ? String(values.maximumNetWeightGrams)
                  : ''
              }
            />
          </label>
          <label className="catalog-filters__field">
            <span className="catalog-filters__label">{t('catalog.sortLabel')}</span>
            <select
              className="catalog-filters__select"
              name="sort"
              defaultValue={values.sort ?? 'newest'}
            >
              {PRODUCT_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {t(SORT_LABEL_KEYS[sort])}
                </option>
              ))}
            </select>
          </label>
        </div>
        {values.categoryId !== undefined ? (
          <input type="hidden" name="categoryId" value={values.categoryId} />
        ) : null}
        {values.collectionId !== undefined ? (
          <input type="hidden" name="collectionId" value={values.collectionId} />
        ) : null}
        {values.limit !== undefined ? (
          <input type="hidden" name="limit" value={String(values.limit)} />
        ) : null}
        <Inline as="div" gap="sm" className="catalog-filters__actions">
          <Button type="submit" variant="primary" size="sm">
            {t('catalog.filterApply')}
          </Button>
          <NextLink href={action} className="catalog-filters__clear ui-link ui-link--muted">
            {t('catalog.filterClear')}
          </NextLink>
        </Inline>
      </fieldset>
    </form>
  );
}
