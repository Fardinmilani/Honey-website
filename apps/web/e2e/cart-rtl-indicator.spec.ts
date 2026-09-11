import { expect, test, type Page, type Response } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { CATALOG_ROUTES, CATALOG_SEED } from './helpers/catalog-seed';

function isBffCartResponse(response: Response, method: 'GET' | 'POST'): boolean {
  return (
    response.request().method() === method &&
    new URL(response.url()).pathname ===
      (method === 'GET' ? '/api/bff/cart' : '/api/bff/cart/lines')
  );
}

/**
 * Adding an item first bootstraps CSRF with a cart GET, then the header island
 * issues a second GET after its server-backed mutation event. Waiting for both
 * keeps this assertion tied to the real cart rather than a client-side guess.
 */
function waitForHeaderCartRefresh(page: Page): Promise<Response> {
  let cartReads = 0;
  return page.waitForResponse((response) => {
    if (!isBffCartResponse(response, 'GET')) return false;
    cartReads += 1;
    return cartReads === 2;
  });
}

test.describe('cart Persian locale and header indicator', () => {
  test('a populated Persian cart remains RTL, localized, and free of serious axe violations', async ({
    page,
  }) => {
    await page.goto(
      `${CATALOG_ROUTES.products.fa}/${encodeURIComponent(CATALOG_SEED.products.fa.wildflower)}`,
    );

    const addResponse = page.waitForResponse((response) => isBffCartResponse(response, 'POST'));
    await page.getByRole('button', { name: 'افزودن به سبد' }).click();
    expect((await addResponse).status()).toBe(200);

    await page.goto('/fa/sabad-kharid');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa-IR');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'سبد خرید شما', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'عسل گل‌های وحشی' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'خلاصه سفارش', level: 2 })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'تعداد: عسل گل‌های وحشی' })).toHaveValue('1');
    await expect(page.getByRole('button', { name: 'افزایش تعداد: عسل گل‌های وحشی' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'حذف کالا' })).toBeVisible();
    await expect(page.getByText(/قیمت واحد/u)).toBeVisible();
    await expect(page.getByText(/جمع ردیف/u)).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test('the header count refreshes from the cart after adding a product', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.wildflower}`);

    const headerCart = page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart', exact: true });
    await expect(headerCart).toHaveAttribute('href', '/en/cart');

    const headerRefresh = waitForHeaderCartRefresh(page);
    const addResponse = page.waitForResponse((response) => isBffCartResponse(response, 'POST'));
    await page.getByRole('button', { name: 'Add to cart' }).click();
    expect((await addResponse).status()).toBe(200);
    expect((await headerRefresh).status()).toBe(200);

    await expect(
      page
        .getByRole('navigation', { name: 'Primary' })
        .getByRole('link', { name: 'Cart, 1 items', exact: true }),
    ).toBeVisible();
  });
});
