import { getLocaleConfig, type Locale } from '@honey/i18n';

import { absoluteUrl } from './absolute-url';

export type LocaleAlternatePaths = Partial<Record<Locale, string>>;

export type LocaleAlternates = {
  readonly languages: Record<string, string>;
};

export type MetadataAlternates = LocaleAlternates & {
  readonly canonical: string;
};

/**
 * Builds reciprocal hreflang alternates as absolute URLs keyed by BCP 47 /
 * hreflang tags from locale config. Includes `x-default` pointing at the
 * English URL when `en` is present in the path map.
 */
export function buildLocaleAlternates(paths: LocaleAlternatePaths): LocaleAlternates {
  const languages: Record<string, string> = {};

  for (const locale of Object.keys(paths) as Locale[]) {
    const pathname = paths[locale];
    if (pathname === undefined) {
      continue;
    }
    const hreflang = getLocaleConfig(locale).hreflang;
    languages[hreflang] = absoluteUrl(pathname);
  }

  const englishPath = paths.en;
  if (englishPath !== undefined) {
    languages['x-default'] = absoluteUrl(englishPath);
  }

  return { languages };
}

/**
 * Builds Next.js-ready alternates with a self-referencing canonical for the
 * active locale.
 */
export function buildMetadataAlternates(
  currentLocale: Locale,
  paths: LocaleAlternatePaths,
): MetadataAlternates {
  const currentPath = paths[currentLocale];
  if (currentPath === undefined) {
    throw new Error(`Missing alternate path for locale "${currentLocale}"`);
  }

  return {
    canonical: absoluteUrl(currentPath),
    ...buildLocaleAlternates(paths),
  };
}
