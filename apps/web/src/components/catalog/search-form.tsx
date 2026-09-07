import { createTranslator, localizedHref, type Locale } from '@honey/i18n';
import { Button, Inline } from '@honey/ui';

type SearchFormProps = {
  readonly locale: Locale;
  readonly defaultQuery?: string;
};

export function SearchForm({ locale, defaultQuery = '' }: SearchFormProps) {
  const t = createTranslator(locale);
  const action = localizedHref('/search', locale);

  return (
    <form className="search-form" method="get" action={action}>
      <Inline as="div" gap="sm" align="center" className="search-form__row">
        <label className="search-form__label" htmlFor="catalog-search-q">
          {t('search.label')}
        </label>
        <input
          id="catalog-search-q"
          className="search-form__input"
          type="search"
          name="q"
          defaultValue={defaultQuery}
          placeholder={t('search.placeholder')}
          autoComplete="off"
          enterKeyHint="search"
        />
        <Button type="submit" variant="secondary" size="sm">
          {t('search.submit')}
        </Button>
      </Inline>
    </form>
  );
}
