import { getLocaleConfig, locales, type Locale } from '@honey/i18n';

import { absoluteUrl } from '../seo/absolute-url';

export type SitemapAlternate = {
  readonly hreflang: string;
  readonly href: string;
};

export type SitemapUrlEntry = {
  readonly loc: string;
  readonly lastmod?: string;
  readonly alternates: readonly SitemapAlternate[];
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function renderAlternateLinks(alternates: readonly SitemapAlternate[]): string {
  return alternates
    .map(
      (alternate) =>
        `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.hreflang)}" href="${escapeXml(alternate.href)}"/>`,
    )
    .join('\n');
}

export function buildUrlSetXml(entries: readonly SitemapUrlEntry[]): string {
  const urls = entries
    .map((entry) => {
      const lastmod =
        entry.lastmod !== undefined ? `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>\n` : '';
      const alternates =
        entry.alternates.length > 0 ? `${renderAlternateLinks(entry.alternates)}\n` : '';
      return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n${lastmod}${alternates}  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

export function buildSitemapIndexXml(locations: readonly string[]): string {
  const items = locations
    .map((loc) => `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>\n  </sitemap>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>
`;
}

export function buildAlternatesForPaths(
  pathsByLocale: Partial<Record<Locale, string>>,
): SitemapAlternate[] {
  const alternates: SitemapAlternate[] = [];

  for (const locale of locales) {
    const pathname = pathsByLocale[locale];
    if (pathname === undefined) {
      continue;
    }
    alternates.push({
      hreflang: getLocaleConfig(locale).hreflang,
      href: absoluteUrl(pathname),
    });
  }

  const englishPath = pathsByLocale.en;
  if (englishPath !== undefined) {
    alternates.push({
      hreflang: 'x-default',
      href: absoluteUrl(englishPath),
    });
  }

  return alternates;
}

export function toLastmod(isoDate: string | null | undefined): string | undefined {
  if (isoDate === null || isoDate === undefined || isoDate === '') {
    return undefined;
  }
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString().slice(0, 10);
}
