import { describe, expect, it } from 'vitest';

import {
  assertPublicationCompleteness,
  canonicalLocale,
  cursorFingerprint,
  decodeCursor,
  encodeCursor,
  InMemoryCatalogCache,
  normalizeSearchText,
  normalizeSlug,
  sanitizeStoryHtml,
} from '../src/modules/catalog/index.js';

describe('catalog domain policies', () => {
  it('normalizes safe Persian and English slugs and rejects path traversal', () => {
    expect(normalizeSlug('  عسل كوهستان  ')).toBe('عسل-کوهستان');
    expect(normalizeSlug('Mountain___Honey')).toBe('mountain-honey');
    expect(() => normalizeSlug('../private')).toThrow();
    expect(() => normalizeSlug('catalog/product.json')).toThrow();
  });

  it('normalizes Arabic and Persian Yeh, Kaf, ZWNJ, whitespace, diacritics, and tatweel', () => {
    const canonical = normalizeSearchText('عسل ییلاقی کوهستان');
    expect(normalizeSearchText('  عسل   ييلاقي   كوهستان  ')).toBe(canonical);
    expect(normalizeSearchText('عسل\u200cییلاقی کـوهستان')).toBe(canonical);
  });

  it('sanitizes the supported story allow-list and rejects active markup and unsafe URLs', () => {
    expect(sanitizeStoryHtml('<p>Mountain <strong>harvest</strong></p>')).toBe(
      '<p>Mountain <strong>harvest</strong></p>',
    );
    expect(() => sanitizeStoryHtml('<img src=x onerror=alert(1)>')).toThrow();
    expect(() => sanitizeStoryHtml('<a href="javascript:alert(1)">unsafe</a>')).toThrow();
    expect(() => sanitizeStoryHtml('<script>alert(1)</script>')).toThrow();
  });

  it('binds opaque cursors to locale, sort, and normalized filters', () => {
    const fingerprint = cursorFingerprint({ locale: 'fa', sort: 'newest', originRegion: 'Alborz' });
    const cursor = encodeCursor({
      version: 1,
      fingerprint,
      sortValue: '2026-08-06T00:00:00.000Z',
      id: '018f0000-0000-7000-8000-000000000001',
    });
    expect(decodeCursor(cursor, fingerprint).fingerprint).toBe(fingerprint);
    expect(() =>
      decodeCursor(cursor, cursorFingerprint({ locale: 'en', sort: 'newest' })),
    ).toThrow();
    expect(() => decodeCursor('not-json', fingerprint)).toThrow();
  });

  it('requires every configured locale, a published default variant, and primary membership', () => {
    const base = {
      translations: [
        { locale: 'fa', name: 'عسل', slug: 'عسل', storyHtml: null },
        { locale: 'en', name: 'Honey', slug: 'honey', storyHtml: null },
      ],
      variants: [
        {
          id: 'v1',
          productId: 'p1',
          status: 'PUBLISHED' as const,
          isDefault: true,
          deletedAt: null,
          translations: [
            { locale: 'fa', name: 'شیشه' },
            { locale: 'en', name: 'Jar' },
          ],
        },
      ],
      categories: [{ id: 'c1', deletedAt: null }],
      primaryCategoryId: 'c1',
      mediaAssetIds: [],
      validMediaAssetIds: new Set<string>(),
    };
    expect(() => assertPublicationCompleteness(base, ['fa', 'en'])).not.toThrow();
    expect(() => assertPublicationCompleteness(base, ['fa', 'en', 'de'])).toThrow();
    expect(canonicalLocale('FA-ir')).toBe('fa-ir');
  });

  it('expires entries with a fake clock and invalidates bounded tags', async () => {
    let now = 0;
    const cache = new InMemoryCatalogCache(() => now);
    await cache.set('fa', { locale: 'fa' }, 10, ['catalog:products']);
    await cache.set('en', { locale: 'en' }, 10, ['catalog:products']);
    expect(await cache.get('fa')).toEqual({ locale: 'fa' });
    await cache.invalidateTags(['catalog:products']);
    expect(await cache.get('fa')).toBeNull();
    await cache.set('expiring', 'value', 5, ['other']);
    now = 5_001;
    expect(await cache.get('expiring')).toBeNull();
  });
});
