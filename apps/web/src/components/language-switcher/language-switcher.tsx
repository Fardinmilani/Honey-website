'use client';

import {
  LOCALE_COOKIE_NAME,
  createTranslator,
  locales,
  getLocaleConfig,
  switchLocalePath,
  type Locale,
} from '@honey/i18n';
import { usePathname, useRouter } from 'next/navigation';

import { useLocaleHrefs } from '../shell/locale-hrefs-context';

type LanguageSwitcherProps = {
  locale: Locale;
  /** When provided, overrides context and switchLocalePath (e.g. translated entity slugs). */
  localeHrefs?: Partial<Record<Locale, string>>;
};

function persistLocale(next: Locale) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(next)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function LanguageSwitcher({ locale, localeHrefs: localeHrefsProp }: LanguageSwitcherProps) {
  const pathname = usePathname() || `/${locale}`;
  const router = useRouter();
  const t = createTranslator(locale);
  const { localeHrefs: localeHrefsContext } = useLocaleHrefs();
  const localeHrefs = localeHrefsProp ?? localeHrefsContext;

  return (
    <div role="navigation" aria-label={t('accessibility.languageSwitcher')}>
      <ul className="language-switcher">
        {locales.map((target) => {
          const config = getLocaleConfig(target);
          const href = localeHrefs?.[target] ?? switchLocalePath(pathname, target);
          const isCurrent = target === locale;
          return (
            <li key={target}>
              <a
                className="language-switcher__option"
                href={href}
                hrefLang={config.hreflang}
                lang={config.bcp47}
                aria-current={isCurrent ? 'true' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  persistLocale(target);
                  router.push(href);
                }}
              >
                {config.label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
