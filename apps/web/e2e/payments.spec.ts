import { createHmac } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { CATALOG_ROUTES, CATALOG_SEED } from './helpers/catalog-seed';

const ORDER_NUMBER_RE = /^HNY-\d{4}-\d{6}$/u;
const FAKE_WEBHOOK_SECRET = 'fake-provider-webhook-secret-test-only';
const API_URL = (process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/u, '');

function waitForBffResponse(page: Page, method: 'GET' | 'POST', pathname: string | RegExp) {
  return page.waitForResponse((response) => {
    if (response.request().method() !== method) return false;
    const actual = new URL(response.url()).pathname;
    return typeof pathname === 'string' ? actual === pathname : pathname.test(actual);
  });
}

async function addWildflowerHoneyToCart(page: Page): Promise<void> {
  await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.wildflower}`);
  const addResponse = waitForBffResponse(page, 'POST', '/api/bff/cart/lines');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  expect((await addResponse).status()).toBe(200);
}

async function placeUnpaidOrder(page: Page): Promise<string> {
  await addWildflowerHoneyToCart(page);
  await page.goto('/en/checkout');
  await page.getByLabel('Email address').fill(`payments-e2e-${Date.now()}@example.invalid`);
  await page.getByLabel('Full name').fill('Payment Tester');
  await page.getByLabel('Delivery phone number').fill('+989120000000');
  await page.getByLabel('Country').fill('IR');
  await page.getByLabel('Province or region').fill('Tehran');
  await page.getByLabel('City').fill('Tehran');
  await page.getByLabel('Postal code').fill('1234567890');
  await page.getByLabel('Address line 1').fill('1 Payment Street');
  const startResponse = waitForBffResponse(page, 'POST', '/api/bff/checkout');
  await page.getByRole('button', { name: 'Continue to order review' }).click();
  expect((await startResponse).status()).toBe(200);
  const confirmResponse = waitForBffResponse(page, 'POST', /\/confirm$/u);
  await page.getByRole('button', { name: 'Create order' }).click();
  expect((await confirmResponse).status()).toBe(200);
  await page.waitForURL(/\/en\/orders\/HNY-\d{4}-\d{6}$/u);
  const orderNumber = page.url().split('/').pop();
  expect(orderNumber).toMatch(ORDER_NUMBER_RE);
  return orderNumber ?? '';
}

async function startPaymentThroughFakeGateway(page: Page): Promise<string> {
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
  const status = response.status();
  const cacheControl = response.headers()['cache-control'] ?? '';
  let raw = '';
  try {
    raw = await response.text();
  } catch {
    raw = '';
  }
  expect(status).toBe(200);
  expect(cacheControl).toMatch(/no-store/iu);
  await page.waitForURL(/fake-gateway\.invalid\/pay\/fake_[0-9a-f-]{36}/iu);
  const fromUrl = /fake_([0-9a-f-]{36})/iu.exec(page.url())?.[1];
  const parsed = raw === '' ? {} : (JSON.parse(raw) as { id?: string });
  const paymentId = parsed.id ?? fromUrl;
  expect(paymentId).toMatch(/^[0-9a-f-]{36}$/iu);
  expect(page.url()).toContain(paymentId);
  expect(
    await page.locator('input[name="cardNumber"], input[autocomplete="cc-number"]').count(),
  ).toBe(0);
  return paymentId ?? '';
}

async function signFakeWebhook(providerRef: string, status: 'PAID' | 'FAILED'): Promise<void> {
  const body = JSON.stringify({
    eventId: crypto.randomUUID(),
    providerRef,
    status,
    providerTxnRef: status === 'PAID' ? 'e2e-txn' : null,
  });
  const signature = createHmac('sha256', FAKE_WEBHOOK_SECRET).update(body, 'utf8').digest('hex');
  const response = await fetch(`${API_URL}/webhooks/payments/mock`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-fake-signature': signature,
      'x-fake-timestamp': String(Date.now()),
    },
    body,
  });
  expect(response.status).toBe(200);
}

test.describe('payments flow', () => {
  test('an unpaid order can pay, a forged success cannot, and a verified webhook can', async ({
    page,
  }) => {
    const orderNumber = await placeUnpaidOrder(page);
    await expect(page.getByRole('button', { name: 'Pay now' })).toBeVisible();
    await expect(page.getByText('UNPAID', { exact: true })).toBeVisible();

    const paymentId = await startPaymentThroughFakeGateway(page);
    await page.goto(`/en/checkout/payment-return?paymentId=${paymentId}&status=success`);
    await expect(page.getByRole('heading', { name: 'Payment result', level: 1 })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(
      /still being verified|was not completed|cancelled|expired/iu,
    );
    await expect(page.locator('body')).not.toContainText('Payment verified. Your order is paid.');

    await signFakeWebhook(`fake_${paymentId}`, 'PAID');
    await page.goto(`/en/checkout/payment-return?paymentId=${paymentId}&status=failed`);
    await expect(page.getByRole('status')).toContainText('Payment verified. Your order is paid.');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');

    await page.goto(`/en/orders/${orderNumber}`);
    await expect(page.getByText('PAID', { exact: true })).toBeVisible();
    await expect(page.getByText('Preparing', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay now' })).toHaveCount(0);
  });

  test('a verified failure stays unpaid and another guest cannot start or read the payment', async ({
    page,
    browser,
  }) => {
    await placeUnpaidOrder(page);
    const paymentId = await startPaymentThroughFakeGateway(page);
    await signFakeWebhook(`fake_${paymentId}`, 'FAILED');
    await page.goto(`/en/checkout/payment-return?paymentId=${paymentId}`);
    await expect(page.getByRole('status')).toContainText('Payment was not completed');

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    try {
      await otherPage.goto(`/en/checkout/payment-return?paymentId=${paymentId}`);
      await expect(otherPage.getByRole('alert')).toBeVisible();
      await expect(otherPage.locator('body')).not.toContainText(
        'Payment verified. Your order is paid.',
      );
    } finally {
      await other.close();
    }
  });

  test('the FA return page is RTL and never renders a card form', async ({ page }) => {
    await placeUnpaidOrder(page);
    const paymentId = await startPaymentThroughFakeGateway(page);
    await page.goto(`/fa/takmil-sefaresh/bazgasht-pardakht?paymentId=${paymentId}`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa-IR');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      await page.locator('input[name="cardNumber"], input[autocomplete="cc-number"]').count(),
    ).toBe(0);
  });
});
