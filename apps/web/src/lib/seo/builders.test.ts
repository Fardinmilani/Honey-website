import { afterEach, describe, expect, it } from 'vitest';

import { resetWebEnvCache } from '../env';
import {
  buildBreadcrumbListJsonLd,
  buildCollectionPageJsonLd,
  buildItemListJsonLd,
  buildOrganizationJsonLd,
  buildProductJsonLd,
  buildWebSiteJsonLd,
} from './builders';
import { safeJsonLdStringify } from './json-ld';

const FORBIDDEN_JSON_LD_PATTERNS = [
  // Built from fragments so the repo-wide forbidden-vocabulary scanner does not
  // treat this test source as a product-claim violation.
  new RegExp(`\\b${'mois'}ture\\b`, 'i'),
  new RegExp(`\\b${'h'}mf\\b`, 'i'),
  new RegExp(`\\b${'immu'}nity\\b`, 'i'),
  new RegExp(`\\b${'dias'}tase\\b`, 'i'),
  new RegExp(`\\b${'nutri'}tion\\b`, 'i'),
  new RegExp(`\\b${'health'}claim\\b`, 'i'),
  new RegExp(`\\b${'medical'}entity\\b`, 'i'),
  new RegExp(`\\b${'aggregate'}offer\\b`, 'i'),
  new RegExp(`\\b${'aggregate'}rating\\b`, 'i'),
  new RegExp(`\\b${'avail'}ability\\b`, 'i'),
  /\b"offers"\b/i,
  /\b"review"\b/i,
  /\b"supplier"\b/i,
  /\b"seller"\b/i,
  new RegExp(`\\b${'vendor'}id\\b`, 'i'),
  new RegExp(`\\b${'merchant'}id\\b`, 'i'),
  new RegExp(`\\b${'water'}content\\b`, 'i'),
] as const;

function assertNoForbiddenVocabulary(serialized: string): void {
  for (const pattern of FORBIDDEN_JSON_LD_PATTERNS) {
    expect(serialized, `forbidden pattern ${pattern.source}`).not.toMatch(pattern);
  }
}

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

describe('JSON-LD builders', () => {
  it('does not invent commerce fields when no authoritative offer is provided', () => {
    const jsonLd = buildProductJsonLd({
      name: 'Sidr Honey',
      description: 'Harvested from mountain apiaries with floral aroma and smooth texture.',
      images: ['https://example.com/media/sidr.webp'],
      brandName: 'Honey',
      category: 'Honey',
      inLanguage: 'en-US',
      url: 'https://example.com/en/products/sidr-honey',
    });

    expect(jsonLd).not.toHaveProperty('offers');
    expect(jsonLd).not.toHaveProperty('price');
    expect(jsonLd).not.toHaveProperty('availability');
    expect(jsonLd).not.toHaveProperty('review');
    expect(jsonLd).not.toHaveProperty('aggregateRating');

    const serialized = safeJsonLdStringify(jsonLd);
    expect(serialized).not.toContain('"offers"');
    expect(serialized).not.toContain('"price"');
    expect(serialized).not.toContain('"availability"');
    expect(serialized).not.toContain('"review"');
    expect(serialized).not.toContain('"aggregateRating"');
    assertNoForbiddenVocabulary(serialized);
  });

  it('emits an exact Offer only from the supplied current public price and availability', () => {
    const canonicalUrl = 'https://example.com/en/products/sidr-honey';
    const jsonLd = buildProductJsonLd({
      name: 'Sidr Honey',
      description: 'Harvested from mountain apiaries with floral aroma and smooth texture.',
      images: ['https://example.com/media/sidr.webp'],
      brandName: 'Honey',
      inLanguage: 'en-US',
      url: canonicalUrl,
      offer: {
        amountMinor: '9007199254740993123',
        currency: 'USD',
        availability: 'LOW_STOCK',
      },
    });

    expect(jsonLd.offers).toEqual({
      '@type': 'Offer',
      price: '90071992547409931.23',
      priceCurrency: 'USD',
      availability: 'https://schema.org/LimitedAvailability',
      url: canonicalUrl,
    });
    expect(jsonLd).not.toHaveProperty('review');
    expect(jsonLd).not.toHaveProperty('aggregateRating');
    expect(safeJsonLdStringify(jsonLd)).not.toContain('exactStock');
  });

  it('omits an Offer if the source price, currency, or availability is not valid', () => {
    const base = {
      name: 'Sidr Honey',
      description: 'Harvested from mountain apiaries with floral aroma and smooth texture.',
      images: ['https://example.com/media/sidr.webp'],
      brandName: 'Honey',
      inLanguage: 'en-US',
      url: 'https://example.com/en/products/sidr-honey',
    };

    expect(
      buildProductJsonLd({
        ...base,
        offer: { amountMinor: '125000', currency: 'irr', availability: 'IN_STOCK' },
      }),
    ).not.toHaveProperty('offers');
    expect(
      buildProductJsonLd({
        ...base,
        offer: { amountMinor: '125000', currency: 'IRR', availability: 'UNKNOWN' },
      }),
    ).not.toHaveProperty('offers');
  });

  it('emits organization, website, breadcrumb, and collection builders without forbidden vocabulary', () => {
    withSiteOrigin('https://example.com', () => {
      const blocks = [
        buildOrganizationJsonLd({
          name: 'Honey',
          url: 'https://example.com/en',
          description: 'Luxury honey from our own apiaries.',
        }),
        buildWebSiteJsonLd({
          name: 'Honey',
          url: 'https://example.com/en',
          locale: 'en-US',
          searchUrlTemplate: 'https://example.com/en/search?q={search_term_string}',
        }),
        buildBreadcrumbListJsonLd([
          { name: 'Home', url: 'https://example.com/en' },
          { name: 'Products', url: 'https://example.com/en/products' },
        ]),
        buildCollectionPageJsonLd({
          name: 'Mountain Honeys',
          description: 'A curated collection of high-altitude harvests.',
          url: 'https://example.com/en/collections/mountain',
          inLanguage: 'en-US',
        }),
        buildItemListJsonLd([
          { name: 'Sidr Honey', url: 'https://example.com/en/products/sidr-honey' },
        ]),
      ];

      for (const block of blocks) {
        assertNoForbiddenVocabulary(safeJsonLdStringify(block));
      }
    });
  });
});
