import { describe, expect, it } from 'vitest';

import { parseCatalogListSearchParams, parseSearchSearchParams } from './query';

describe('parseCatalogListSearchParams', () => {
  it('allow-lists supported filters and sorts', () => {
    const parsed = parseCatalogListSearchParams({
      sort: 'name',
      honeyVarietal: 'Sidr',
      originRegion: 'Azerbaijan',
      floralSource: 'Sidr',
      minimumNetWeightGrams: '250',
      maximumNetWeightGrams: '500',
      cursor: 'abc',
      limit: '24',
    });
    expect(parsed.sort).toBe('name');
    expect(parsed.honeyVarietal).toBe('Sidr');
    expect(parsed.hasFacets).toBe(true);
    expect(parsed.hasCursor).toBe(true);
    expect(parsed.unsupportedKeys).toEqual([]);
  });

  it('reports unsupported filters without forwarding them', () => {
    const parsed = parseCatalogListSearchParams({
      priceMin: '100',
      stock: '1',
      supplierId: 'x',
      sort: 'newest',
    });
    expect(parsed.unsupportedKeys).toEqual(
      expect.arrayContaining(['priceMin', 'stock', 'supplierId']),
    );
    expect(parsed).not.toHaveProperty('priceMin');
    expect(parsed.hasFacets).toBe(false);
  });

  it('rejects invalid sort and uuid values', () => {
    const parsed = parseCatalogListSearchParams({
      sort: 'price-asc',
      categoryId: 'not-a-uuid',
    });
    expect(parsed.sort).toBeUndefined();
    expect(parsed.categoryId).toBeUndefined();
  });
});

describe('parseSearchSearchParams', () => {
  it('parses search query allow-list', () => {
    const parsed = parseSearchSearchParams({
      q: 'wildflower',
      sort: 'relevance',
      cursor: 'c1',
      price: '1',
    });
    expect(parsed.q).toBe('wildflower');
    expect(parsed.sort).toBe('relevance');
    expect(parsed.hasCursor).toBe(true);
    expect(parsed.unsupportedKeys).toContain('price');
  });
});
