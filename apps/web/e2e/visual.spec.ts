import { expect, test } from '@playwright/test';

/**
 * Visual regression foundation — poster/static shell only.
 * Reduced-motion ensures no video frames pollute snapshots.
 */
test.describe('visual regression foundation', () => {
  test.use({
    colorScheme: 'light',
  });

  test('Persian desktop shell', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/fa');
    await expect(page.locator('.hero__poster')).toBeVisible();
    await expect(page).toHaveScreenshot('home-fa-desktop.png', {
      fullPage: false,
    });
  });

  test('English desktop shell', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/en');
    await expect(page.locator('.hero__poster')).toBeVisible();
    await expect(page).toHaveScreenshot('home-en-desktop.png', {
      fullPage: false,
    });
  });

  test('Persian mobile shell', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/fa');
    await expect(page.locator('.hero__poster')).toBeVisible();
    await expect(page).toHaveScreenshot('home-fa-mobile.png', {
      fullPage: false,
    });
  });

  test('English mobile shell', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en');
    await expect(page.locator('.hero__poster')).toBeVisible();
    await expect(page).toHaveScreenshot('home-en-mobile.png', {
      fullPage: false,
    });
  });

  test('reduced-motion Hero', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/en');
    await expect(page.locator('.hero video')).toHaveCount(0);
    await expect(page.locator('.hero')).toHaveScreenshot('hero-reduced-motion.png');
  });
});
