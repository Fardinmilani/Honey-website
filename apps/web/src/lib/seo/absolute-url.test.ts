import { afterEach, describe, expect, it } from 'vitest';

import { resetWebEnvCache } from '../env';
import { absoluteUrl } from './absolute-url';

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

describe('absoluteUrl', () => {
  it('builds absolute URLs from the configured site origin', () => {
    withSiteOrigin('https://example.com', () => {
      expect(absoluteUrl('/fa/mahsoulat')).toBe('https://example.com/fa/mahsoulat');
      expect(absoluteUrl('en/products/sidr-honey')).toBe(
        'https://example.com/en/products/sidr-honey',
      );
    });
  });

  it('reflects origin changes across all absolute URLs', () => {
    withSiteOrigin('https://example.com', () => {
      expect(absoluteUrl('/fa')).toBe('https://example.com/fa');
    });

    withSiteOrigin('https://shop.honey.test', () => {
      expect(absoluteUrl('/fa')).toBe('https://shop.honey.test/fa');
      expect(absoluteUrl('/en/about')).toBe('https://shop.honey.test/en/about');
    });
  });
});
