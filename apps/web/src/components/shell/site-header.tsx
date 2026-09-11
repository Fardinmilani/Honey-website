import { createTranslator, localizedHref, type Locale } from '@honey/i18n';
import { Container, Inline } from '@honey/ui';
import NextLink from 'next/link';

import { CartIndicator } from '../cart/cart-indicator';
import { LanguageSwitcher } from '../language-switcher/language-switcher';

type SiteHeaderProps = {
  locale: Locale;
  /** Locale-prefixed path for aria-current matching (e.g. `/fa/mahsoulat`). */
  currentPath?: string;
};

type NavItem = {
  readonly href: string;
  readonly label: string;
};

function isCurrentPath(currentPath: string | undefined, href: string): boolean {
  if (currentPath === undefined) {
    return false;
  }
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function SiteHeader({ locale, currentPath }: SiteHeaderProps) {
  const t = createTranslator(locale);
  const homeHref = localizedHref('/', locale);

  const navItems: NavItem[] = [
    { href: homeHref, label: t('navigation.home') },
    { href: localizedHref('/products', locale), label: t('navigation.products') },
    { href: localizedHref('/categories', locale), label: t('navigation.categories') },
    { href: localizedHref('/collections', locale), label: t('navigation.collections') },
    { href: localizedHref('/search', locale), label: t('navigation.search') },
  ];

  return (
    <header className="site-header">
      <Container>
        <div className="site-header__inner">
          <NextLink className="site-brand" href={homeHref}>
            {t('common.brandName')}
          </NextLink>
          <Inline as="div" gap="md" align="center" className="site-nav">
            <nav aria-label={t('navigation.primaryNavLabel')}>
              <ul className="site-nav__links">
                {navItems.map((item) => (
                  <li key={item.href}>
                    <NextLink
                      href={item.href}
                      className="site-nav__link"
                      aria-current={isCurrentPath(currentPath, item.href) ? 'page' : undefined}
                    >
                      {item.label}
                    </NextLink>
                  </li>
                ))}
                <li>
                  <CartIndicator locale={locale} />
                </li>
              </ul>
            </nav>
            <LanguageSwitcher locale={locale} />
          </Inline>
        </div>
      </Container>
    </header>
  );
}
