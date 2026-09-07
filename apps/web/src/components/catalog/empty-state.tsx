import { createTranslator, type Locale } from '@honey/i18n';
import { Stack } from '@honey/ui';

type EmptyStateProps = {
  readonly locale: Locale;
  readonly messageKey:
    'catalog.emptyProducts' | 'catalog.emptyCategory' | 'catalog.emptyCollection';
};

export function EmptyState({ locale, messageKey }: EmptyStateProps) {
  const t = createTranslator(locale);

  return (
    <Stack as="section" gap="sm" className="catalog-empty" aria-live="polite">
      <p className="catalog-empty__message">{t(messageKey)}</p>
    </Stack>
  );
}
