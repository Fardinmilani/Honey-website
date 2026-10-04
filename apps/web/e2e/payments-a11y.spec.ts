import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { CATALOG_ROUTES, CATALOG_SEED } from './helpers/catalog-seed';

function waitForBffResponse(page: Page, method: 'GET' | 'POST', pathname: string | RegExp) {
  return page.waitForResponse((response) => {
    if (response.request().method() !== method) return false;
    const actual = new URL(response.url()).pathname;
    return typeof pathname === 'string' ? actual === pathname : pathname.test(actual);
  });
}

async function assertNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

async function placeUnpaidOrderAndStart(page: Page): Promise<string> {
  await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.wildflower}`);
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByRole('button', { name: 'Added to cart' })).toBeVisible();
  await page.goto('/en/checkout');
  await page.getByLabel('Email address').fill(`payments-a11y-${Date.now()}@example.invalid`);
  await page.getByLabel('Full name').fill('A11y Tester');
  await page.getByLabel('Delivery phone number').fill('+989120000000');
  await page.getByLabel('Country').fill('IR');
  await page.getByLabel('Province or region').fill('Tehran');
  await page.getByLabel('City').fill('Tehran');
  await page.getByLabel('Postal code').fill('1234567890');
  await page.getByLabel('Address line 1').fill('1 A11y Street');
  await page.getByRole('button', { name: 'Continue to order review' }).click();
  await expect(page.getByRole('heading', { name: 'Review your order', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Create order' }).click();
  await page.waitForURL(/\/en\/orders\/HNY-\d{4}-\d{6}$/u);
  await page.route('https://fake-gateway.invalid/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body>Fake payment gateway</body></html>',
    });
  });
  const start = waitForBffResponse(page, 'POST', '/api/bff/payments');
  await page.getByRole('button', { name: 'Pay now' }).click();
  const response = await start;
  let raw = '';
  try {
    raw = await response.text();
  } catch {
    raw = '';
  }
  await page.waitForURL(/fake-gateway\.invalid\/pay\/fake_[0-9a-f-]{36}/iu);
  const fromUrl = /fake_([0-9a-f-]{36})/iu.exec(page.url())?.[1];
  const parsed = raw === '' ? {} : (JSON.parse(raw) as { id?: string });
  const paymentId = parsed.id ?? fromUrl;
  expect(paymentId).toMatch(/^[0-9a-f-]{36}$/iu);
  return paymentId ?? '';
}

test.describe('payment result axe', () => {
  test('EN pending result has no serious or critical violations', async ({ page }) => {
    const paymentId = await placeUnpaidOrderAndStart(page);
    await page.goto(`/en/checkout/payment-return?paymentId=${paymentId}`);
    await expect(page.getByRole('heading', { name: 'Payment result', level: 1 })).toBeVisible();
    await expect(page.getByRole('status')).toBeVisible();
    await assertNoSeriousViolations(page);
  });

  test('FA pending result has no serious or critical violations', async ({ page }) => {
    const paymentId = await placeUnpaidOrderAndStart(page);
    await page.goto(`/fa/takmil-sefaresh/bazgasht-pardakht?paymentId=${paymentId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await assertNoSeriousViolations(page);
  });
});
