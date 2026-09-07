import { expect, test } from '@playwright/test';

import { CATALOG_ROUTES, CATALOG_SEED } from './helpers/catalog-seed';

test.describe('catalog visual regression', () => {
  test.use({
    colorScheme: 'light',
  });

  test('fa listing desktop', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(CATALOG_ROUTES.products.fa);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page).toHaveScreenshot('catalog-fa-listing-desktop.png', {
      fullPage: false,
    });
  });

  test('en listing desktop', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(CATALOG_ROUTES.products.en);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page).toHaveScreenshot('catalog-en-listing-desktop.png', {
      fullPage: false,
    });
  });

  test('fa PDP desktop', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(
      `${CATALOG_ROUTES.products.fa}/${encodeURIComponent(CATALOG_SEED.products.fa.thyme)}`,
    );
    await expect(page.locator('h1.product-detail__title')).toBeVisible();
    await expect(page).toHaveScreenshot('catalog-fa-pdp-desktop.png', {
      fullPage: false,
    });
  });

  test('en PDP desktop', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.wildflower}`);
    await expect(page.locator('h1.product-detail__title')).toBeVisible();
    await expect(page).toHaveScreenshot('catalog-en-pdp-desktop.png', {
      fullPage: false,
    });
  });

  test('fa listing mobile', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(CATALOG_ROUTES.products.fa);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page).toHaveScreenshot('catalog-fa-listing-mobile.png', {
      fullPage: false,
    });
  });

  test('en PDP mobile', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.thyme}`);
    await expect(page.locator('h1.product-detail__title')).toBeVisible();
    await expect(page).toHaveScreenshot('catalog-en-pdp-mobile.png', {
      fullPage: false,
    });
  });

  test('search no-results desktop', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${CATALOG_ROUTES.search.en}?q=zzzz-e2e-visual-no-match`);
    await expect(page.locator('.catalog-empty__message')).toBeVisible();
    await expect(page).toHaveScreenshot('catalog-search-no-results.png', {
      fullPage: false,
    });
  });

  test('category page desktop', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${CATALOG_ROUTES.categories.en}/${CATALOG_SEED.categories.en}`);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page).toHaveScreenshot('catalog-category-en-desktop.png', {
      fullPage: false,
    });
  });
});
