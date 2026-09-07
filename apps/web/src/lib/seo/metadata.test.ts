import { afterEach, describe, expect, it } from 'vitest';

import { resetWebEnvCache } from '../env';
import { buildMetadataAlternates } from './alternates';
import { buildCatalogMetadata } from './metadata';

function withWebEnv(env: { siteUrl: string; indexingEnabled?: string }, run: () => void): void {
  const previousSite = process.env['NEXT_PUBLIC_SITE_URL'];
  const previousIndexing = process.env['WEB_INDEXING_ENABLED'];
  resetWebEnvCache();
  process.env['NEXT_PUBLIC_SITE_URL'] = env.siteUrl;
  if (env.indexingEnabled !== undefined) {
    process.env['WEB_INDEXING_ENABLED'] = env.indexingEnabled;
  } else {
    delete process.env['WEB_INDEXING_ENABLED'];
  }
  try {
    run();
  } finally {
    resetWebEnvCache();
    if (previousSite === undefined) {
      delete process.env['NEXT_PUBLIC_SITE_URL'];
    } else {
      process.env['NEXT_PUBLIC_SITE_URL'] = previousSite;
    }
    if (previousIndexing === undefined) {
      delete process.env['WEB_INDEXING_ENABLED'];
    } else {
      process.env['WEB_INDEXING_ENABLED'] = previousIndexing;
    }
  }
}

afterEach(() => {
  resetWebEnvCache();
});

describe('buildCatalogMetadata', () => {
  it('returns metadata with canonical, alternates, and noindex when indexing is disabled', () => {
    withWebEnv({ siteUrl: 'https://example.com' }, () => {
      const alternates = buildMetadataAlternates('fa', {
        fa: '/fa/mahsoulat',
        en: '/en/products',
      });

      const metadata = buildCatalogMetadata({
        locale: 'fa',
        title: 'محصولات',
        description: 'مجموعه عسل‌های منتخب.',
        canonicalPath: '/fa/mahsoulat',
        alternates,
        ogImage: 'https://example.com/og/fa-catalog.jpg',
      });

      expect(metadata.alternates?.canonical).toBe('https://example.com/fa/mahsoulat');
      expect(metadata.alternates?.languages).toMatchObject({
        'fa-IR': 'https://example.com/fa/mahsoulat',
        en: 'https://example.com/en/products',
        'x-default': 'https://example.com/en/products',
      });
      expect(metadata.robots).toEqual({
        index: false,
        follow: true,
        googleBot: { index: false, follow: true },
      });
      expect(metadata.openGraph?.locale).toBe('fa_IR');
      expect(metadata.openGraph?.images).toEqual([
        { url: 'https://example.com/og/fa-catalog.jpg' },
      ]);
    });
  });

  it('honours explicit noindex even when indexing is enabled', () => {
    withWebEnv({ siteUrl: 'https://shop.example.com', indexingEnabled: 'true' }, () => {
      const alternates = buildMetadataAlternates('en', {
        fa: '/fa/mahsoulat',
        en: '/en/products',
      });

      const metadata = buildCatalogMetadata({
        locale: 'en',
        title: 'Products',
        description: 'Browse our honey catalog.',
        canonicalPath: '/en/products',
        alternates,
        noindex: true,
      });

      expect(metadata.robots).toEqual({
        index: false,
        follow: true,
        googleBot: { index: false, follow: true },
      });
    });
  });
});
