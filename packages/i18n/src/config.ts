/**
 * Single source of truth for launch locales.
 *
 * Downstream routing, `<html lang dir>`, formatters, fonts, hreflang, and the
 * language switcher must read from this object — never hardcode locale branches.
 */

export const locales = ['fa', 'en'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'fa';

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

export type TextDirection = 'rtl' | 'ltr';
export type FontScript = 'persian' | 'latin';

export type LocaleDefinition = {
  readonly code: Locale;
  readonly bcp47: string;
  readonly dir: TextDirection;
  readonly label: string;
  readonly englishLabel: string;
  readonly currency: string;
  readonly calendar: string;
  readonly numberingSystem: string;
  readonly dateFormat: string;
  readonly hreflang: string;
  readonly ogLocale: string;
  readonly font: FontScript;
  /** CSS custom-property token for the active script stack. */
  readonly fontFamily: string;
};

export const localeConfig = {
  fa: {
    code: 'fa',
    bcp47: 'fa-IR',
    dir: 'rtl',
    label: 'فارسی',
    englishLabel: 'Persian',
    currency: 'IRR',
    calendar: 'persian',
    numberingSystem: 'arabext',
    dateFormat: 'fa-IR-u-ca-persian-nu-latn',
    hreflang: 'fa-IR',
    ogLocale: 'fa_IR',
    font: 'persian',
    fontFamily: 'var(--font-persian)',
  },
  en: {
    code: 'en',
    bcp47: 'en-US',
    dir: 'ltr',
    label: 'English',
    englishLabel: 'English',
    currency: 'IRR',
    calendar: 'gregory',
    numberingSystem: 'latn',
    dateFormat: 'en-US',
    hreflang: 'en',
    ogLocale: 'en_US',
    font: 'latin',
    fontFamily: 'var(--font-latin)',
  },
} as const satisfies Record<Locale, LocaleDefinition>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/**
 * Parses a locale code or BCP 47 tag into a known launch locale.
 * Returns `null` when the value does not match an enabled locale.
 */
export function parseLocale(value: unknown): Locale | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (isLocale(lower)) {
    return lower;
  }

  const primary = lower.split('-')[0];
  if (primary !== undefined && isLocale(primary)) {
    return primary;
  }

  for (const locale of locales) {
    const config = localeConfig[locale];
    if (
      config.bcp47.toLowerCase() === lower ||
      config.hreflang.toLowerCase() === lower ||
      config.ogLocale.toLowerCase() === lower.replace('-', '_')
    ) {
      return locale;
    }
  }

  return null;
}

export function getLocaleConfig(locale: Locale): LocaleDefinition {
  return localeConfig[locale];
}

export function getDirection(locale: Locale): TextDirection {
  return localeConfig[locale].dir;
}

export function getLangAttribute(locale: Locale): string {
  return localeConfig[locale].bcp47;
}
