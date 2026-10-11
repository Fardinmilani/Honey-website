import { describe, it, expect } from 'vitest';
import { buildArticleJsonLd, buildFaqJsonLd } from './builders/editorial';
import { buildProductJsonLd } from './builders/product';
import { safeJsonLdStringify } from './json-ld';
describe('Phase 18 exact safe structured data', () => {
  const base = {
    name: 'Honey',
    description: 'Floral aroma',
    images: [],
    brandName: 'Honey',
    inLanguage: 'en',
    url: 'https://example.invalid/en/products/honey',
  };
  it.each([
    undefined,
    null,
    { count: 0, average: 5 },
    { count: 1, average: 0 },
    { count: 1, average: 6 },
  ])('omits unsupported and zero-review aggregate %#', (aggregate) =>
    expect(
      buildProductJsonLd({ ...base, ...(aggregate === undefined ? {} : { aggregate }) }),
    ).not.toHaveProperty('aggregateRating'),
  );
  it('uses the exact approved count and average', () =>
    expect(
      buildProductJsonLd({ ...base, aggregate: { count: 3, average: 4.333333333333333 } })
        .aggregateRating,
    ).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.333333333333333,
      reviewCount: 3,
      bestRating: 5,
      worstRating: 1,
    }));
  it('Article and visible-only FAQ serialize without script breakout', () => {
    const value = '</script><script>window.injected=true</script>';
    const article = buildArticleJsonLd({
      title: value,
      description: 'Origin',
      url: 'https://example.invalid/en/articles/origin',
      locale: 'en',
      publishedAt: '2026-10-11T00:00:00.000Z',
      updatedAt: '2026-10-11T00:00:00.000Z',
      brandName: 'Honey',
    });
    expect(article['@type']).toBe('Article');
    const faq = buildFaqJsonLd([{ question: 'Origin?', answer: value }], 'fa');
    expect(faq.mainEntity).toHaveLength(1);
    expect(safeJsonLdStringify([article, faq])).not.toContain('</script>');
  });
});
