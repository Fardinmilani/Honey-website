import { createTranslator, localizedHref, type Locale } from '@honey/i18n';
import { Container } from '@honey/ui';
import NextLink from 'next/link';

type SiteFooterProps = {
  locale: Locale;
};

export function SiteFooter({ locale }: SiteFooterProps) {
  const t = createTranslator(locale);
  const homeHref = localizedHref('/', locale);

  return (
    <footer className="site-footer">
      <Container>
        <nav aria-label={t('navigation.footerNavLabel')}>
          <NextLink href={homeHref}>{t('navigation.home')}</NextLink>
        </nav>
        <p>
          <bdi>{t('common.brandName')}</bdi>
        </p>
      </Container>
    </footer>
  );
}
