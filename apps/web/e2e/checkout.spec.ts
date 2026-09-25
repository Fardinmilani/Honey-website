import { expect, test, type Page } from '@playwright/test';

import { CATALOG_ROUTES, CATALOG_SEED } from './helpers/catalog-seed';

const ORDER_NUMBER_RE = /^HNY-\d{4}-\d{6}$/u;

function waitForBffResponse(page: Page, method: 'GET' | 'POST', pathname: string | RegExp) {
  return page.waitForResponse((response) => {
    if (response.request().method() !== method) return false;
    const actual = new URL(response.url()).pathname;
    return typeof pathname === 'string' ? actual === pathname : pathname.test(actual);
  });
}

async function expectNoInternalCommerceDetails(page: Page): Promise<void> {
  const body = page.locator('body');
  await expect(body).not.toContainText(CATALOG_SEED.supplierLegalName);
  const text = await body.innerText();
  // "Reserved until <time>" is the legitimate, customer-facing reservation-hold
  // notice for this checkout; only an inventory-shaped use of "reserved" (e.g.
  // "reserved units", "reserved stock") would indicate an internal-stock leak.
  expect(text).not.toMatch(
    /\b(?:on hand|reserved (?:units?|stock|inventory)|allocated|incoming|reorder point|warehouse|stock location)\b/iu,
  );
  expect(text).not.toMatch(/\b(?:supplier|landed cost|unit cost|margin)\b/iu);
}

async function addWildflowerHoneyToCart(page: Page): Promise<void> {
  await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.wildflower}`);
  const addResponse = waitForBffResponse(page, 'POST', '/api/bff/cart/lines');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  expect((await addResponse).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Added to cart' })).toBeVisible();
}

async function fillContactAndAddress(page: Page, email: string): Promise<void> {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Full name').fill('Checkout Tester');
  await page.getByLabel('Delivery phone number').fill('+989120000000');
  await page.getByLabel('Country').fill('IR');
  await page.getByLabel('Province or region').fill('Tehran');
  await page.getByLabel('City').fill('Tehran');
  await page.getByLabel('Postal code').fill('1234567890');
  await page.getByLabel('Address line 1').fill('1 Test Street');
}

test.describe('checkout flow', () => {
  test('adds a purchasable item, completes checkout, and lands on an unpaid order confirmation', async ({
    page,
  }) => {
    await addWildflowerHoneyToCart(page);

    await page.goto('/en/cart');
    const checkoutLink = page.getByRole('link', { name: 'Checkout' });
    await expect(checkoutLink).toHaveAttribute('href', '/en/checkout');
    await checkoutLink.click();

    await expect(page.getByRole('heading', { name: 'Checkout', level: 1 })).toBeVisible();
    await fillContactAndAddress(page, `checkout-e2e-${Date.now()}@example.invalid`);

    const startResponse = waitForBffResponse(page, 'POST', '/api/bff/checkout');
    await page.getByRole('button', { name: 'Continue to order review' }).click();
    expect((await startResponse).status()).toBe(200);

    await expect(page.getByRole('heading', { name: 'Review your order', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Order summary', level: 2 })).toBeVisible();
    await expect(page.getByText(/Order total/u)).toBeVisible();
    await expectNoInternalCommerceDetails(page);

    const confirmResponse = waitForBffResponse(page, 'POST', /\/confirm$/u);
    await page.getByRole('button', { name: 'Create order' }).click();
    expect((await confirmResponse).status()).toBe(200);

    await page.waitForURL(/\/en\/orders\/HNY-\d{4}-\d{6}$/u);
    const orderNumber = page.url().split('/').pop();
    expect(orderNumber).toMatch(ORDER_NUMBER_RE);

    await expect(page.getByRole('heading', { name: `Order ${orderNumber}`, level: 1 })).toBeVisible();
    await expect(
      page.getByText('Your order is awaiting payment. We will not mark it paid until payment is verified.'),
    ).toBeVisible();
    await expect(page.getByText('UNPAID', { exact: true })).toBeVisible();
    await expect(page.getByText('UNFULFILLED', { exact: true })).toBeVisible();
    await expectNoInternalCommerceDetails(page);

    // The order confirmation is never a fake "paid" state.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\bpayment (?:succeeded|complete|confirmed)\b/iu);
  });

  test('never extends an already-open reservation on a bare page refresh, only once on re-entry', async ({
    page,
  }) => {
    await addWildflowerHoneyToCart(page);
    await page.goto('/en/checkout');
    await fillContactAndAddress(page, `checkout-e2e-extend-${Date.now()}@example.invalid`);
    const startResponse = waitForBffResponse(page, 'POST', '/api/bff/checkout');
    await page.getByRole('button', { name: 'Continue to order review' }).click();
    await startResponse;
    await expect(page.getByRole('heading', { name: 'Review your order', level: 1 })).toBeVisible();

    // Re-entering the already-open checkout triggers exactly one explicit
    // extend call, never on the reload itself and never a second time.
    const extendResponse = waitForBffResponse(page, 'POST', /\/extend$/u);
    await page.reload();
    expect((await extendResponse).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Review your order', level: 1 })).toBeVisible();

    let secondExtendSeen = false;
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/extend$/u.test(new URL(request.url()).pathname)) {
        secondExtendSeen = true;
      }
    });
    await page.waitForTimeout(500);
    expect(secondExtendSeen).toBe(false);
  });

  test('denies another anonymous browser session from reading a just-created order', async ({
    page,
    browser,
  }) => {
    await addWildflowerHoneyToCart(page);
    await page.goto('/en/checkout');
    await fillContactAndAddress(page, `checkout-e2e-owner-${Date.now()}@example.invalid`);
    const startResponse = waitForBffResponse(page, 'POST', '/api/bff/checkout');
    await page.getByRole('button', { name: 'Continue to order review' }).click();
    await startResponse;
    const confirmResponse = waitForBffResponse(page, 'POST', /\/confirm$/u);
    await page.getByRole('button', { name: 'Create order' }).click();
    await confirmResponse;
    await page.waitForURL(/\/en\/orders\/HNY-\d{4}-\d{6}$/u);
    const orderNumber = page.url().split('/').pop() ?? '';
    expect(orderNumber).toMatch(ORDER_NUMBER_RE);

    const otherContext = await browser.newContext();
    try {
      const otherPage = await otherContext.newPage();
      await otherPage.goto(`/en/orders/${orderNumber}`);
      await expect(
        otherPage.getByText('This order is not available to this browser session.'),
      ).toBeVisible();
      const otherBody = await otherPage.locator('body').innerText();
      expect(otherBody).not.toContain('Checkout Tester');
      expect(otherBody).not.toContain('1 Test Street');
    } finally {
      await otherContext.close();
    }
  });
});
