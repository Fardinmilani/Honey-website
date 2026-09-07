import { expect, test } from '@playwright/test';

import { CATALOG_ROUTES, CATALOG_SEED } from './helpers/catalog-seed';
import { CLS_BUDGET, LCP_BUDGET_MS, measureWebVitals } from './helpers/performance';

test.describe('mobile web vitals', () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('home LCP candidate is hero poster within budget', async ({ page }) => {
    await page.goto('/en', { waitUntil: 'networkidle' });
    const poster = page.locator('.hero__poster');
    await expect(poster).toBeVisible();
    // Hero poster remains the intentional LCP candidate (Phase 9/10 contract).
    await expect(poster).toHaveAttribute('fetchpriority', /high/i);
    const sample = await measureWebVitals(page);
    expect(sample.cls).toBeLessThanOrEqual(CLS_BUDGET);
    if (sample.lcp > 0) {
      expect(sample.lcp).toBeLessThanOrEqual(LCP_BUDGET_MS);
    }
    expect(sample.jsTransferBytes).toBeGreaterThan(0);
  });

  test('listing LCP within budget', async ({ page }) => {
    await page.goto(CATALOG_ROUTES.products.en, { waitUntil: 'networkidle' });
    const sample = await measureWebVitals(page);
    expect(sample.cls).toBeLessThanOrEqual(CLS_BUDGET);
    if (sample.lcp > 0) {
      expect(sample.lcp).toBeLessThanOrEqual(LCP_BUDGET_MS);
    }
  });

  test('product detail LCP within budget', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.wildflower}`, {
      waitUntil: 'networkidle',
    });
    const sample = await measureWebVitals(page);
    expect(sample.cls).toBeLessThanOrEqual(CLS_BUDGET);
    if (sample.lcp > 0) {
      expect(sample.lcp).toBeLessThanOrEqual(LCP_BUDGET_MS);
    }
  });

  test('documents performance thresholds', () => {
    expect(LCP_BUDGET_MS).toBeLessThanOrEqual(4000);
    expect(LCP_BUDGET_MS).toBeGreaterThanOrEqual(2500);
  });
});
