import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { CATALOG_ROUTES, CATALOG_SEED } from './helpers/catalog-seed';

function waitForCheckoutStart(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/bff/checkout',
  );
}

async function beginCheckout(page: Page): Promise<void> {
  await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.wildflower}`);
  const added = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/bff/cart/lines',
  );
  await page.getByRole('button', { name: 'Add to cart' }).click();
  expect((await added).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Added to cart' })).toBeVisible();
  await page.goto('/en/checkout');
  await page.getByLabel('Email address').fill(`shipping-e2e-${Date.now()}@example.invalid`);
  await page.getByLabel('Full name').fill('Shipping Tester');
  await page.getByLabel('Delivery phone number').fill('+989120000000');
  await page.getByLabel('Country').fill('IR');
  await page.getByLabel('Province or region').fill('Tehran');
  await page.getByLabel('City').fill('Tehran');
  await page.getByLabel('Postal code').fill('1234567890');
  await page.getByLabel('Address line 1').fill('1 Shipping Street');
  const start = waitForCheckoutStart(page);
  await page.getByRole('button', { name: 'Continue to order review' }).click();
  const response = await start;
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    shippingQuote: { methodCode: 'STANDARD' },
  });
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
}

test.describe('shipping and fulfilment storefront', () => {
  test('shows a server quote and rejects a browser-supplied shipping amount', async ({ page }) => {
    await beginCheckout(page);
    await expect(page.getByRole('group', { name: 'Shipping method' })).toBeVisible();
    const quoteRadio = page.getByRole('radio', { name: /Standard (?:shipping|delivery)/iu });
    await expect(quoteRadio).toBeChecked();
    const quoteId = await quoteRadio.getAttribute('value');
    expect(quoteId).toMatch(/^[0-9a-f-]{36}$/iu);

    const result = await page.evaluate(async (id) => {
      const checkoutId = window.sessionStorage.getItem('honey-checkout-id');
      const csrf = document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('csrf_token='))
        ?.slice('csrf_token='.length);
      if (checkoutId === null || csrf === undefined || id === null) return -1;
      const response = await fetch(`/api/bff/checkout/${checkoutId}/shipping-selection`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ quoteId: id, shippingTotalMinor: '1' }),
      });
      return response.status;
    }, quoteId);
    expect(result).toBe(400);
    await expect(quoteRadio).toBeChecked();
    await expect(page.getByRole('button', { name: 'Create order' })).toBeEnabled();
  });

  test('shows the selected method in RTL Persian checkout with no serious axe findings', async ({
    page,
  }) => {
    await beginCheckout(page);
    await page.goto('/fa/takmil-sefaresh');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('group', { name: 'روش ارسال' })).toBeVisible();
    await expect(page.getByRole('radio')).toBeChecked();
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([]);
  });

  test('shows owner order tracking without internal allocation details', async ({ page }) => {
    await page.route('**/api/bff/orders/HNY-2026-000711', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 'HNY-2026-000711',
          status: 'PARTIALLY_FULFILLED',
          paymentStatus: 'PAID',
          fulfilmentStatus: 'PARTIAL',
          currency: 'IRR',
          subtotal: { amountMinor: '1000', currency: 'IRR' },
          discountTotal: { amountMinor: '0', currency: 'IRR' },
          shippingTotal: { amountMinor: '500', currency: 'IRR' },
          taxTotal: { amountMinor: '0', currency: 'IRR' },
          grandTotal: { amountMinor: '1500', currency: 'IRR' },
          placedAt: '2026-10-05T12:00:00.000Z',
          shippingAddress: null,
          lines: [
            {
              productName: 'Wildflower honey',
              variantName: 'Jar',
              sku: 'HNY-1',
              imageUrl: null,
              quantity: 2,
              unitPrice: { amountMinor: '500', currency: 'IRR' },
              discount: { amountMinor: '0', currency: 'IRR' },
              tax: { amountMinor: '0', currency: 'IRR' },
              lineTotal: { amountMinor: '1000', currency: 'IRR' },
            },
          ],
          shipments: [
            {
              id: '018f0000-0000-7000-8000-000000000711',
              status: 'IN_TRANSIT',
              trackingNumber: 'TRACK-711',
              trackingUrl: null,
              shippedAt: '2026-10-05T13:00:00.000Z',
              deliveredAt: null,
              stockLocationId: 'never-public',
            },
          ],
        }),
      });
    });
    await page.goto('/en/orders/HNY-2026-000711');
    await expect(page.getByRole('heading', { name: 'Shipment tracking' })).toBeVisible();
    await expect(page.getByText('TRACK-711')).toBeVisible();
    await expect(page.getByText('Partially shipped')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('never-public');
    await expect(page.locator('body')).not.toContainText('stockLocationId');
  });
});
