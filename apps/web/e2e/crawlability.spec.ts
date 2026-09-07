import { expect, test } from '@playwright/test';

import { CATALOG_ROUTES, CATALOG_SEED } from './helpers/catalog-seed';
import { siteOrigin } from './helpers/seo';

const SEEDED_PRODUCT_PATHS = [
  `${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.wildflower}`,
  `${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.thyme}`,
  `${CATALOG_ROUTES.products.fa}/${encodeURIComponent(CATALOG_SEED.products.fa.thyme)}`,
  `${CATALOG_ROUTES.categories.en}/${CATALOG_SEED.categories.en}`,
  `${CATALOG_ROUTES.collections.en}/${CATALOG_SEED.collections.en}`,
];

function normalizePath(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname.replace(/\/$/u, '') || '/';
}

test.describe('catalog crawlability', () => {
  test('home catalog links reach seeded products without orphan slugs', async ({ page }) => {
    await page.goto('/en');
    const hrefs = await page
      .locator('a[href*="/products/"]')
      .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href') ?? ''));
    const productPaths = new Set(
      hrefs
        .filter((href) => href.includes('/products/'))
        .map((href) => normalizePath(new URL(href, siteOrigin()).href)),
    );

    expect(productPaths.has(`/en/products/${CATALOG_SEED.products.en.wildflower}`)).toBe(true);
    expect(productPaths.has(`/en/products/${CATALOG_SEED.products.en.thyme}`)).toBe(true);
  });

  test('sitemap product URLs resolve with 200', async ({ request }) => {
    const sitemapBody = await request.get('/sitemaps/en/products').then((response) => {
      expect(response.status()).toBe(200);
      return response.text();
    });

    const locMatches = [...sitemapBody.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
    const productLocs = locMatches.filter((loc) => loc.includes('/products/'));
    expect(productLocs.length).toBeGreaterThan(0);

    for (const loc of productLocs.slice(0, 6)) {
      const path = normalizePath(loc);
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
    }
  });

  test('current seeded slugs do not redirect', async ({ request }) => {
    for (const path of SEEDED_PRODUCT_PATHS) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
    }
  });

  test('small crawl from home follows catalog links successfully', async ({ page, request }) => {
    await page.goto('/en');
    const visited = new Set<string>();
    const queue = ['/en'];

    while (queue.length > 0 && visited.size < 12) {
      const path = queue.shift();
      if (path === undefined || visited.has(path)) {
        continue;
      }
      visited.add(path);

      const response = await request.get(path);
      expect(response.status(), path).toBe(200);

      await page.goto(path);
      const links = await page
        .locator('a[href^="/en/"]')
        .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href') ?? ''));

      for (const href of links) {
        if (
          href.startsWith('/en/products') ||
          href.startsWith('/en/categories') ||
          href.startsWith('/en/collections') ||
          href.startsWith('/en/search')
        ) {
          const normalized = normalizePath(new URL(href, siteOrigin()).href);
          if (!visited.has(normalized)) {
            queue.push(normalized);
          }
        }
      }
    }

    expect([...visited].some((path) => path.includes(CATALOG_SEED.products.en.wildflower))).toBe(
      true,
    );
    expect([...visited].some((path) => path.includes(CATALOG_SEED.products.en.thyme))).toBe(true);
  });
});
