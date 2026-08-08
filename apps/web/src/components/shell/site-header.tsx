import { createTranslator, localizedHref, type Locale } from '@honey/i18n';
import { Container, Inline } from '@honey/ui';
import NextLink from 'next/link';

import { LanguageSwitcher } from '../language-switcher/language-switcher';

type SiteHeaderProps = {
  locale: Locale;
};

export function SiteHeader({ locale }: SiteHeaderProps) {
  const t = createTranslator(locale);
  const homeHref = localizedHref('/', locale);

  return (
    <header className="site-header">
      <Container>
        <div className="site-header__inner">
          <NextLink className="site-brand" href={homeHref}>
            {t('common.brandName')}
          </NextLink>
          <Inline as="div" gap="md" align="center" className="site-nav">
            <nav aria-label={t('navigation.primaryNavLabel')}>
              <NextLink href={homeHref} aria-current="page">
                {t('navigation.home')}
              </NextLink>
            </nav>
            <LanguageSwitcher locale={locale} />
          </Inline>
        </div>
      </Container>
    </header>
  );
}
