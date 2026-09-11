import { expect, test, type Page } from '@playwright/test';

import { CATALOG_ROUTES, CATALOG_SEED } from './helpers/catalog-seed';
import { getRobotsMeta } from './helpers/seo';

type CartLocale = Readonly<{
  locale: 'en' | 'fa';
  home: string;
  cart: string;
  documentLanguage: string;
  direction: 'ltr' | 'rtl';
  navigationLabel: string;
  navigationCart: string;
  heading: string;
  emptyHeading: string;
}>;

const cartLocales: readonly CartLocale[] = [
  {
    locale: 'en',
    home: '/en',
    cart: '/en/cart',
    documentLanguage: 'en-US',
    direction: 'ltr',
    navigationLabel: 'Primary',
    navigationCart: 'Cart',
    heading: 'Your cart',
    emptyHeading: 'Your cart is empty',
  },
  {
    locale: 'fa',
    home: '/fa',
    cart: '/fa/sabad-kharid',
    documentLanguage: 'fa-IR',
    direction: 'rtl',
    navigationLabel: 'ناوبری اصلی',
    navigationCart: 'سبد خرید',
    heading: 'سبد خرید شما',
    emptyHeading: 'سبد خرید شما خالی است',
  },
];

function waitForBffCartResponse(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  pathname: string | RegExp,
) {
  return page.waitForResponse((response) => {
    if (response.request().method() !== method) return false;
    const actual = new URL(response.url()).pathname;
    return typeof pathname === 'string' ? actual === pathname : pathname.test(actual);
  });
}

async function expectNoInternalCommerceDetails(page: Page): Promise<void> {
  const body = page.locator('body');
  await expect(body).not.toContainText(CATALOG_SEED.supplierLegalName);
  await expect(body).not.toContainText('SUPPLY-SELECTED-01');
  const text = await body.innerText();
  expect(text).not.toMatch(
    /\b(?:on hand|reserved|allocated|incoming|reorder point|warehouse|stock location)\b/iu,
  );
  expect(text).not.toMatch(/\b(?:supplier|landed cost|unit cost|margin)\b/iu);
  expect(text).not.toMatch(/\b\d+\s+(?:units?|jars?)\b/iu);
}

test.describe('cart route', () => {
  for (const entry of cartLocales) {
    test(`${entry.locale} navigation reaches a private, localized empty cart without checkout`, async ({
      page,
      request,
    }) => {
      await page.goto(entry.home);
      const cartLink = page
        .getByRole('navigation', { name: entry.navigationLabel })
        .getByRole('link', { name: entry.navigationCart, exact: true });
      await expect(cartLink).toHaveAttribute('href', entry.cart);

      const cartResponse = await request.get('/api/bff/cart', {
        headers: { 'x-honey-locale': entry.locale },
      });
      expect(cartResponse.status()).toBe(200);
      expect(cartResponse.headers()['cache-control']?.toLowerCase()).toContain('no-store');

      const cartDocumentResponse = await request.get(entry.cart);
      expect(cartDocumentResponse.status()).toBe(200);
      expect(cartDocumentResponse.headers()['cache-control']?.toLowerCase()).toContain('private');
      expect(cartDocumentResponse.headers()['cache-control']?.toLowerCase()).toContain('no-store');

      await page.goto(entry.cart);
      await expect(page.locator('html')).toHaveAttribute('lang', entry.documentLanguage);
      await expect(page.locator('html')).toHaveAttribute('dir', entry.direction);
      await expect(page.getByRole('heading', { name: entry.heading, level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { name: entry.emptyHeading, level: 2 })).toBeVisible();
      const robots = await getRobotsMeta(page);
      expect(robots?.toLowerCase()).toContain('noindex');
      expect(robots?.toLowerCase()).toContain('nofollow');
      await expect(page.getByRole('button', { name: /checkout|پرداخت|تسویه/iu })).toHaveCount(0);
      await expect(page.locator('a[href*="checkout"], a[href*="pardakht"]')).toHaveCount(0);
    });
  }
});

test.describe('anonymous cart interactions', () => {
  test('a purchasable PDP adds, persists, reprices, discounts, and removes a seeded line', async ({
    page,
  }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.wildflower}`);
    await expect(page.locator('.product-price')).toContainText('IRR');

    const addButton = page.getByRole('button', { name: 'Add to cart' });
    await expect(addButton).toBeVisible();
    const addResponse = waitForBffCartResponse(page, 'POST', '/api/bff/cart/lines');
    await addButton.click();
    expect((await addResponse).status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Added to cart' })).toBeVisible();

    await page.goto('/en/cart');
    await expect(page.getByRole('link', { name: 'Wildflower Honey' })).toBeVisible();
    const quantity = page.getByRole('spinbutton', { name: 'Quantity: Wildflower Honey' });
    await expect(quantity).toHaveValue('1');
    await expect(page.getByRole('heading', { name: 'Order summary', level: 2 })).toBeVisible();
    await expectNoInternalCommerceDetails(page);

    await page.reload();
    await expect(page.getByRole('link', { name: 'Wildflower Honey' })).toBeVisible();
    await expect(quantity).toHaveValue('1');

    const increase = page.getByRole('button', { name: 'Increase quantity: Wildflower Honey' });
    const updateResponse = waitForBffCartResponse(page, 'PATCH', /^\/api\/bff\/cart\/lines\//u);
    await increase.click();
    expect((await updateResponse).status()).toBe(200);
    await expect(quantity).toHaveValue('2');

    const couponInput = page.getByLabel('Promotion code');
    await couponInput.fill('WELCOME10');
    const percentCouponResponse = waitForBffCartResponse(page, 'POST', '/api/bff/cart/coupon');
    await page.getByRole('button', { name: 'Apply code' }).click();
    expect((await percentCouponResponse).status()).toBe(200);
    await expect(page.getByText('Promotion applied', { exact: true })).toBeVisible();
    await expect(couponInput).toBeDisabled();

    const removePercentCoupon = waitForBffCartResponse(page, 'DELETE', '/api/bff/cart/coupon');
    await page.getByRole('button', { name: 'Remove code' }).click();
    expect((await removePercentCoupon).status()).toBe(200);
    await expect(couponInput).toBeEnabled();

    await couponInput.fill('HONEY500');
    const fixedCouponResponse = waitForBffCartResponse(page, 'POST', '/api/bff/cart/coupon');
    await page.getByRole('button', { name: 'Apply code' }).click();
    expect((await fixedCouponResponse).status()).toBe(200);
    await expect(page.getByText('Promotion applied', { exact: true })).toBeVisible();

    const removeFixedCoupon = waitForBffCartResponse(page, 'DELETE', '/api/bff/cart/coupon');
    await page.getByRole('button', { name: 'Remove code' }).click();
    expect((await removeFixedCoupon).status()).toBe(200);

    await couponInput.fill('NOT-A-VALID-COUPON');
    const invalidCouponResponse = waitForBffCartResponse(page, 'POST', '/api/bff/cart/coupon');
    await page.getByRole('button', { name: 'Apply code' }).click();
    expect((await invalidCouponResponse).status()).toBe(422);
    await expect(
      page.getByText('That promotion code cannot be applied to this cart.', { exact: true }),
    ).toBeVisible();
    await expect(couponInput).toHaveAttribute('aria-invalid', 'true');

    const removeLineResponse = waitForBffCartResponse(
      page,
      'DELETE',
      /^\/api\/bff\/cart\/lines\//u,
    );
    await page.getByRole('button', { name: 'Remove item' }).click();
    expect((await removeLineResponse).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Your cart is empty', level: 2 })).toBeVisible();
  });

  test('a PDP reports an authoritative quantity adjustment after repeated adds', async ({
    page,
  }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.thyme}`);
    const addButton = page.locator('.product-add-to-cart__button');

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const addResponse = waitForBffCartResponse(page, 'POST', '/api/bff/cart/lines');
      await addButton.click();
      expect((await addResponse).status()).toBe(200);
      await expect(addButton).toBeEnabled();
    }

    await expect(
      page.getByText('Added to cart. Quantity was adjusted to what is currently available.', {
        exact: true,
      }),
    ).toBeVisible();
  });

  test('an unavailable PDP does not render an add-to-cart control', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.acacia}`);
    await expect(page.getByTestId('availability-band')).toHaveAttribute(
      'data-band',
      'OUT_OF_STOCK',
    );
    await expect(page.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
  });
});
