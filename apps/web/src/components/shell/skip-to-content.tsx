import { createTranslator, type Locale } from '@honey/i18n';

type SkipToContentProps = {
  locale: Locale;
};

export function SkipToContent({ locale }: SkipToContentProps) {
  const t = createTranslator(locale);
  return (
    <a className="skip-link" href="#main-content">
      {t('accessibility.skipToContent')}
    </a>
  );
}
