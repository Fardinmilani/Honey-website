import { locales } from '@honey/i18n';

import { absoluteUrl } from '@/lib/seo';
import { buildSitemapIndexXml } from '@/lib/sitemap/xml';

const SITEMAP_TYPES = ['static', 'products', 'categories', 'collections'] as const;

export function GET() {
  const locations = locales.flatMap((locale) =>
    SITEMAP_TYPES.map((type) => absoluteUrl(`/sitemaps/${locale}/${type}`)),
  );

  const body = buildSitemapIndexXml(locations);

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
