import { expect, test } from '@playwright/test';

import { CATALOG_ROUTES, CATALOG_SEED } from './helpers/catalog-seed';
import {
  assertNoForbiddenJsonLdKeys,
  assertReciprocalHreflangs,
  collectJsonLdTypes,
  getCanonical,
  getHreflangs,
  getRobotsMeta,
  parseJsonLd,
  siteOrigin,
} from './helpers/seo';

test.describe('catalog listings', () => {
  test('Persian product listing has h1 and product links', async ({ page }) => {
    await page.goto(CATALOG_ROUTES.products.fa);
    await expect(page.locator('h1')).toBeVisible();
    const productLinks = page.locator('.product-card__link');
    await expect(productLinks).not.toHaveCount(0);
    await expect(productLinks.first()).toHaveAttribute('href', /\/fa\/mahsoulat\//);
  });

  test('English product listing has h1 and product links', async ({ page }) => {
    await page.goto(CATALOG_ROUTES.products.en);
    await expect(page.locator('h1')).toBeVisible();
    const productLinks = page.locator('.product-card__link');
    await expect(productLinks).not.toHaveCount(0);
    await expect(productLinks.first()).toHaveAttribute('href', /\/en\/products\//);
  });
});

test.describe('catalog detail pages', () => {
  test('Persian product detail renders', async ({ page }) => {
    await page.goto(
      `${CATALOG_ROUTES.products.fa}/${encodeURIComponent(CATALOG_SEED.products.fa.thyme)}`,
    );
    await expect(page.locator('h1.product-detail__title')).toContainText('آویشن');
    await expect(page.locator('.product-gallery')).toHaveCount(1);
  });

  test('English product detail renders', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.wildflower}`);
    await expect(page.locator('h1.product-detail__title')).toContainText('Wildflower');
    await expect(page.locator('.product-gallery')).toHaveCount(1);
  });

  test('category detail lists products', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.categories.en}/${CATALOG_SEED.categories.en}`);
    await expect(page.locator('h1')).toContainText('Honey');
    await expect(page.locator('.product-card')).not.toHaveCount(0);
  });

  test('collection detail lists products', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.collections.en}/${CATALOG_SEED.collections.en}`);
    await expect(page.locator('h1')).toContainText('Mountain Harvest');
    await expect(page.locator('.product-card')).not.toHaveCount(0);
  });
});

test.describe('search and filters', () => {
  test('search results with q=', async ({ page }) => {
    // Seed documents are long; pg_trgm `%` needs a query similar enough to the
    // concatenated search document (Phase 8). Use a high-overlap English phrase.
    const query = 'thyme honey a summer harvest with thyme aroma';
    await page.goto(`${CATALOG_ROUTES.search.en}?q=${encodeURIComponent(query)}`);
    await expect(page.locator('h2.catalog-page__title')).toBeVisible();
    await expect(page.locator('.product-card')).not.toHaveCount(0);
    await expect(page.locator('.product-card__title').filter({ hasText: 'Thyme' })).toBeVisible();
  });

  test('search no-results message', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.search.en}?q=zzzz-e2e-no-match`);
    await expect(page.locator('.catalog-empty__message')).toContainText('No honeys matched');
  });

  test('honeyVarietal filter is supported', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}?honeyVarietal=Thyme`);
    await expect(page.locator('.product-card__title')).toHaveCount(1);
    await expect(page.locator('.product-card__title')).toContainText('Thyme');
  });

  test('sort query is supported', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}?sort=name`);
    await expect(page.locator('.product-card')).toHaveCount(3);
  });

  test('cursor pagination link structure when present', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}?limit=1`);
    const next = page.locator('.catalog-pagination__next');
    await expect(next).toBeVisible();
    const href = await next.getAttribute('href');
    expect(href).toMatch(/cursor=/);
  });

  test('unsupported priceMin filter does not crash', async ({ request }) => {
    const response = await request.get(
      `${CATALOG_ROUTES.products.en}?priceMin=10&honeyVarietal=Thyme`,
    );
    expect(response.status()).toBe(200);
  });
});

test.describe('locale alternates', () => {
  test('language switch maps fa thyme slug to en thyme-honey', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.products.fa}/${CATALOG_SEED.products.fa.thyme}`);
    const englishLink = page
      .getByRole('navigation', { name: /زبان|Language/i })
      .getByRole('link', { name: 'English' });
    await expect(englishLink).toHaveAttribute(
      'href',
      `${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.thyme}`,
    );
  });

  test('canonical link present on product page', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.thyme}`);
    const canonical = await getCanonical(page);
    expect(canonical).toBe(
      `${siteOrigin()}${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.thyme}`,
    );
  });

  test('hreflang reciprocal fa-IR and en with x-default to en', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.products.fa}/${CATALOG_SEED.products.fa.thyme}`);
    const hreflangs = await getHreflangs(page);
    assertReciprocalHreflangs(hreflangs, {
      faPath: `${CATALOG_ROUTES.products.fa}/${CATALOG_SEED.products.fa.thyme}`,
      enPath: `${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.thyme}`,
    });
  });
});

test.describe('robots metadata', () => {
  test('search page robots noindex', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.search.en}?q=thyme`);
    const robots = await getRobotsMeta(page);
    expect(robots?.toLowerCase()).toContain('noindex');
  });

  test('filtered listing robots noindex', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}?honeyVarietal=Thyme`);
    const robots = await getRobotsMeta(page);
    expect(robots?.toLowerCase()).toContain('noindex');
  });
});

test.describe('robots.txt', () => {
  test('staging lockdown disallows all when indexing is disabled', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body.toLowerCase()).toContain('user-agent: *');
    expect(body.toLowerCase()).toContain('disallow: /');
    expect(body.toLowerCase()).not.toContain('sitemap:');
  });

  test('staging robots.txt has no allow rules', async ({ request }) => {
    const body = await request.get('/robots.txt').then((response) => response.text());
    const lines = body
      .split(/\r?\n/u)
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line.length > 0);
    expect(lines.some((line) => line.startsWith('allow:'))).toBe(false);
    expect(lines.some((line) => line === 'disallow: /')).toBe(true);
  });

  test('production robots policy is covered by unit tests when indexing cannot run on localhost', async () => {
    const { robotsTxtBody } = await import('../src/lib/seo/robots-policy.ts');
    const body = robotsTxtBody({
      indexingEnabled: true,
      sitemapUrl: 'https://example.com/sitemap.xml',
    });
    expect(body).toContain('Allow: /');
    expect(body).toContain('Sitemap: https://example.com/sitemap.xml');
    expect(body).toContain('Disallow: /*/admin');
  });
});

test.describe('sitemaps', () => {
  test('sitemap index lists locale sitemaps', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('<sitemapindex');
    expect(body).toContain('/sitemaps/en/products');
    expect(body).toContain('/sitemaps/fa/products');
  });

  test('product sitemap includes seeded product URLs', async ({ request }) => {
    const response = await request.get('/sitemaps/en/products');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain(CATALOG_SEED.products.en.wildflower);
    expect(body).toContain(CATALOG_SEED.products.en.thyme);
  });

  test('product sitemap alternates are reciprocal', async ({ request }) => {
    const body = await request.get('/sitemaps/en/products').then((response) => response.text());
    expect(body).toContain('hreflang="en"');
    expect(body).toContain('hreflang="fa-IR"');
    expect(body).toContain('hreflang="x-default"');
    expect(body).toContain(CATALOG_SEED.products.fa.thyme);
    expect(body).toContain(CATALOG_SEED.products.en.thyme);
  });
});

test.describe('slug history', () => {
  test('unknown product slug returns 404 (seed has no slug_history rows)', async ({ request }) => {
    const response = await request.get('/en/products/e2e-unknown-historical-slug');
    expect(response.status()).toBe(404);
  });
});

test.describe('structured data', () => {
  test('product page JSON-LD emits a public Offer only from the authoritative catalog data', async ({
    page,
  }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.thyme}`);
    const jsonLd = await parseJsonLd(page);
    const types = collectJsonLdTypes(jsonLd);
    expect(types).toContain('Product');
    expect(types).toContain('Offer');
    expect(types).toContain('BreadcrumbList');
    assertNoForbiddenJsonLdKeys(jsonLd);

    const serialized = JSON.stringify(jsonLd);
    expect(serialized).toMatch(/"price":"[0-9]+"/u);
    expect(serialized).toContain('"priceCurrency":"IRR"');
    expect(serialized).toContain('"availability":"https://schema.org/LimitedAvailability"');
    expect(serialized).toContain(
      `"url":"${siteOrigin()}${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.thyme}"`,
    );
  });

  test('collection page JSON-LD types', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.collections.en}/${CATALOG_SEED.collections.en}`);
    const jsonLd = await parseJsonLd(page);
    const types = collectJsonLdTypes(jsonLd);
    expect(types).toContain('CollectionPage');
    expect(types).toContain('BreadcrumbList');
    expect(types).toContain('ItemList');
    assertNoForbiddenJsonLdKeys(jsonLd);
  });
});

test.describe('public storefront pricing and privacy boundaries', () => {
  const internalCommercePatterns = [
    /\b(?:on hand|reserved|allocated|incoming|reorder point|warehouse|stock location)\b/iu,
    /\b(?:supplier|landed cost|unit cost|margin)\b/iu,
    /\b\d+\s+(?:units?|jars?)\b/iu,
  ];

  test('product page shows a public current price and no internal commerce details', async ({
    page,
  }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.thyme}`);
    await expect(page.locator('.product-price')).toContainText('IRR');
    await expect(page.getByRole('button', { name: 'Add to cart' })).toBeVisible();
    const text = await page.locator('body').innerText();
    for (const pattern of internalCommercePatterns) {
      expect(text).not.toMatch(pattern);
    }
  });

  test('listing shows public prices without internal inventory details', async ({ page }) => {
    await page.goto(CATALOG_ROUTES.products.en);
    await expect(
      page.locator('.product-card .product-price').filter({ hasText: 'IRR' }),
    ).not.toHaveCount(0);
    const text = await page.locator('body').innerText();
    for (const pattern of internalCommercePatterns) {
      expect(text).not.toMatch(pattern);
    }
  });

  test('no supplier identity on product page', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.thyme}`);
    await expect(page.locator('body')).not.toContainText(CATALOG_SEED.supplierLegalName);
    await expect(page.locator('body')).not.toContainText('SUPPLY-SELECTED-01');
  });
});

test.describe('availability bands', () => {
  test('English listing and PDPs show all three bands without counts', async ({ page }) => {
    await page.goto(CATALOG_ROUTES.products.en);
    await expect(
      page.getByTestId('availability-band').filter({ hasText: 'Available' }),
    ).not.toHaveCount(0);
    await expect(
      page.getByTestId('availability-band').filter({ hasText: 'Limited availability' }),
    ).not.toHaveCount(0);
    await expect(
      page.getByTestId('availability-band').filter({ hasText: 'Currently unavailable' }),
    ).not.toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(
      /\b(onHand|reserved|allocated|incoming)\b/,
    );
    await expect(page.locator('body')).not.toContainText(/\b\d+\s+units?\b/i);

    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.wildflower}`);
    await expect(page.locator('h1.product-detail__title')).toBeVisible();
    await expect(page.getByTestId('availability-band')).toHaveAttribute('data-band', 'IN_STOCK');
    await expect(page.getByRole('button', { name: 'Add to cart' })).toBeVisible();

    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.thyme}`);
    await expect(page.locator('h1.product-detail__title')).toBeVisible();
    await expect(page.getByTestId('availability-band')).toHaveAttribute('data-band', 'LOW_STOCK');

    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.acacia}`);
    await expect(page.locator('h1.product-detail__title')).toBeVisible();
    await expect(page.getByTestId('availability-band')).toHaveAttribute(
      'data-band',
      'OUT_OF_STOCK',
    );
    await expect(page.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
  });

  test('Persian listing and PDPs show localized bands', async ({ page }) => {
    await page.goto(CATALOG_ROUTES.products.fa);
    await expect(
      page.getByTestId('availability-band').filter({ hasText: 'موجود' }),
    ).not.toHaveCount(0);
    await expect(
      page.getByTestId('availability-band').filter({ hasText: 'موجودی محدود' }),
    ).not.toHaveCount(0);
    await expect(
      page.getByTestId('availability-band').filter({ hasText: 'فعلاً ناموجود' }),
    ).not.toHaveCount(0);

    await page.goto(`${CATALOG_ROUTES.products.fa}/${CATALOG_SEED.products.fa.wildflower}`);
    await expect(page.locator('h1.product-detail__title')).toBeVisible();
    await expect(page.getByTestId('availability-band')).toHaveAttribute('data-band', 'IN_STOCK');

    await page.goto(`${CATALOG_ROUTES.products.fa}/${CATALOG_SEED.products.fa.thyme}`);
    await expect(page.locator('h1.product-detail__title')).toBeVisible();
    await expect(page.getByTestId('availability-band')).toHaveAttribute('data-band', 'LOW_STOCK');

    await page.goto(`${CATALOG_ROUTES.products.fa}/${CATALOG_SEED.products.fa.acacia}`);
    await expect(page.locator('h1.product-detail__title')).toBeVisible();
    await expect(page.getByTestId('availability-band')).toHaveAttribute(
      'data-band',
      'OUT_OF_STOCK',
    );
  });
});

test.describe('product gallery', () => {
  test('gallery region exists on PDP', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.wildflower}`);
    await expect(page.locator('.product-gallery')).toHaveCount(1);
  });
});
