import { afterEach, describe, expect, it } from 'vitest';

import { resetWebEnvCache } from '../env';
import { buildLocaleAlternates, buildMetadataAlternates } from './alternates';

function withSiteOrigin(siteUrl: string, run: () => void): void {
  const previous = process.env['NEXT_PUBLIC_SITE_URL'];
  resetWebEnvCache();
  process.env['NEXT_PUBLIC_SITE_URL'] = siteUrl;
  try {
    run();
  } finally {
    resetWebEnvCache();
    if (previous === undefined) {
      delete process.env['NEXT_PUBLIC_SITE_URL'];
    } else {
      process.env['NEXT_PUBLIC_SITE_URL'] = previous;
    }
  }
}

afterEach(() => {
  resetWebEnvCache();
});

describe('locale alternates', () => {
  const paths = {
    fa: '/fa/mahsoulat/asal-konar',
    en: '/en/products/sidr-honey',
  } as const;

  it('emits reciprocal hreflang alternates and x-default to English', () => {
    withSiteOrigin('https://example.com', () => {
      const { languages } = buildLocaleAlternates(paths);

      expect(languages).toEqual({
        'fa-IR': 'https://example.com/fa/mahsoulat/asal-konar',
        en: 'https://example.com/en/products/sidr-honey',
        'x-default': 'https://example.com/en/products/sidr-honey',
      });
    });
  });

  it('omits x-default when English is not in the map', () => {
    withSiteOrigin('https://example.com', () => {
      const { languages } = buildLocaleAlternates({ fa: '/fa/mahsoulat' });

      expect(languages).toEqual({
        'fa-IR': 'https://example.com/fa/mahsoulat',
      });
      expect(languages['x-default']).toBeUndefined();
    });
  });

  it('builds self-referencing canonical for the current locale', () => {
    withSiteOrigin('https://example.com', () => {
      const faAlternates = buildMetadataAlternates('fa', paths);
      expect(faAlternates.canonical).toBe('https://example.com/fa/mahsoulat/asal-konar');

      const enAlternates = buildMetadataAlternates('en', paths);
      expect(enAlternates.canonical).toBe('https://example.com/en/products/sidr-honey');
    });
  });

  it('updates all alternates when the site origin changes', () => {
    withSiteOrigin('https://example.com', () => {
      const first = buildMetadataAlternates('en', paths);
      expect(first.canonical).toBe('https://example.com/en/products/sidr-honey');
    });

    withSiteOrigin('https://cdn-origin.example.com', () => {
      const second = buildMetadataAlternates('en', paths);
      expect(second.canonical).toBe('https://cdn-origin.example.com/en/products/sidr-honey');
      expect(second.languages['en']).toBe('https://cdn-origin.example.com/en/products/sidr-honey');
    });
  });
});
