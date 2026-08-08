import { expect, test } from '@playwright/test';

test.describe('Hero motion and viewport assets', () => {
  test('normal-motion client may mount Hero video', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/en');
    await expect(page.locator('.hero video.hero__video')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.hero video source')).not.toHaveCount(0);
  });

  test('reduced-motion DOM contains no video or sources', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en');
    await expect(page.locator('.hero__poster')).toBeVisible();
    await expect(page.locator('.hero video')).toHaveCount(0);
    await expect(page.locator('.hero source[type="video/mp4"]')).toHaveCount(0);
    await expect(page.locator('.hero source[type="video/webm"]')).toHaveCount(0);
    const html = await page.locator('.hero').innerHTML();
    expect(html).not.toMatch(/honey-scroll\.(mp4|webm)/);
  });

  test('reduced-motion sends no MP4 or WebM request', async ({ page }) => {
    const mediaRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('honey-scroll.mp4') || url.includes('honey-scroll.webm')) {
        mediaRequests.push(url);
      }
    });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en', { waitUntil: 'networkidle' });
    await expect(page.locator('.hero__poster')).toBeVisible();
    expect(mediaRequests).toEqual([]);
  });

  test('desktop viewport uses desktop Hero assets and not mobile video', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/media/hero/')) {
        requested.push(url);
      }
    });

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/en');
    await expect(page.locator('.hero video.hero__video')).toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState('networkidle');

    expect(requested.some((url) => url.includes('/desktop/honey-poster.webp'))).toBe(true);
    expect(requested.some((url) => url.includes('/desktop/honey-scroll.'))).toBe(true);
    expect(requested.some((url) => url.includes('/mobile/honey-scroll.'))).toBe(false);
  });

  test('mobile viewport uses mobile Hero assets and not desktop video', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/media/hero/')) {
        requested.push(url);
      }
    });

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en');
    await expect(page.locator('.hero video.hero__video')).toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState('networkidle');

    expect(requested.some((url) => url.includes('/mobile/honey-poster.webp'))).toBe(true);
    expect(requested.some((url) => url.includes('/mobile/honey-scroll.'))).toBe(true);
    expect(requested.some((url) => url.includes('/desktop/honey-scroll.'))).toBe(false);
  });
});
