import { isLocale } from '@honey/i18n';
import { notFound } from 'next/navigation';

import { buildLocaleTypeSitemapEntries } from '@/lib/sitemap/entries';
import { buildUrlSetXml } from '@/lib/sitemap/xml';

const SITEMAP_TYPES = ['static', 'products', 'categories', 'collections'] as const;

type SitemapType = (typeof SITEMAP_TYPES)[number];

function isSitemapType(value: string): value is SitemapType {
  return (SITEMAP_TYPES as readonly string[]).includes(value);
}

type SitemapRouteProps = {
  params: Promise<{ locale: string; type: string }>;
};

export async function GET(_request: Request, { params }: SitemapRouteProps) {
  const { locale, type } = await params;

  if (!isLocale(locale) || !isSitemapType(type)) {
    notFound();
  }

  const entries = await buildLocaleTypeSitemapEntries(locale, type);
  const body = buildUrlSetXml(entries);

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
