import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { getNamespace } from '@honey/i18n';
import { adminIds, adminUser, freshStepUp, signIn, totpCode } from './helpers/admin-auth';
import { identifier, record, records } from '../src/lib/admin/validation';
import { CATALOG_SEED } from './helpers/catalog-seed';

function action(page: Page, path: string): Locator {
  return page.locator(`form[data-admin-action="${path}"]`);
}
async function confirm(page: Page, locale: 'fa' | 'en' = 'en'): Promise<void> {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: getNamespace(locale, 'admin').confirm, exact: true })
    .click();
}
async function save(form: Locator, locale: 'fa' | 'en' = 'en'): Promise<void> {
  const m = getNamespace(locale, 'admin');
  await form.getByRole('button', { name: m.save, exact: true }).click();
  await expect(form.getByRole('status')).toContainText(m.saved);
}

test.describe('Phase 17 isolated real admin console', () => {
  test.afterEach(async ({ page }) => {
    await page
      .evaluate(() => {
        for (const input of document.querySelectorAll(
          'input[type="password"], #admin-setup-key, input[autocomplete="one-time-code"]',
        ))
          input.remove();
      })
      .catch(() => undefined);
  });
  test('enrolls an unconfigured staff authenticator without exposing credentials in artifacts', async ({
    page,
  }) => {
    const user = adminUser(9);
    const m = getNamespace('fa', 'admin');
    await page.goto('/fa/admin/sign-in');
    await page.getByLabel(m.email, { exact: true }).fill(user.email);
    await page.locator('#admin-password').evaluate((input, password) => {
      if (!(input instanceof HTMLInputElement)) throw new Error('Password input missing.');
      input.value = password;
    }, user.password);
    await page.getByRole('button', { name: m.continue, exact: true }).click();
    await expect(page.locator('h1')).toHaveText(m.enroll);
    const secret = await page.locator('#admin-setup-key').evaluate((input) => {
      if (!(input instanceof HTMLInputElement)) throw new Error('Enrollment input missing.');
      return input.value;
    });
    await page.locator('#admin-code').evaluate((input, code) => {
      if (!(input instanceof HTMLInputElement)) throw new Error('TOTP input missing.');
      input.value = code;
    }, totpCode(secret));
    await page.getByRole('button', { name: m.verify, exact: true }).click();
    await expect(page).toHaveURL(/\/fa\/admin$/u);
    await expect(page.locator('#admin-setup-key')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });
  test('keeps anonymous admin pages private and hydrates both sign-in locales under unique CSP nonces', async ({
    page,
    request,
  }) => {
    for (const locale of ['fa', 'en'] as const) {
      const first = await request.get(`/${locale}/admin/sign-in`);
      const second = await request.get(`/${locale}/admin/sign-in`);
      expect(first.headers()['cache-control']).toContain('no-store');
      expect(first.headers()['x-robots-tag']).toContain('noindex');
      const firstCsp = first.headers()['content-security-policy'] ?? '';
      const secondCsp = second.headers()['content-security-policy'] ?? '';
      expect(firstCsp).toContain("'nonce-");
      expect(firstCsp).not.toBe(secondCsp);
      expect(firstCsp.split('script-src')[1]?.split(';')[0]).not.toContain('unsafe-inline');
      expect(firstCsp).not.toContain('unsafe-eval');
      await page.goto(`/${locale}/admin/orders`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/admin/sign-in`, 'u'));
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'fa' ? 'rtl' : 'ltr');
      const findings = await new AxeBuilder({ page }).analyze();
      expect(
        findings.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
      ).toEqual([]);
    }
  });
  test('renders every authorized workspace with real data across responsive sizes and preserves locale query context', async ({
    page,
  }) => {
    await signIn(page, 0, 'fa');
    for (const section of [
      'catalog',
      'media',
      'pricing',
      'inventory',
      'sourcing',
      'procurement',
      'orders',
      'customers',
      'settings',
      'audit',
    ]) {
      await page.goto(`/fa/admin/${section}`);
      await expect(page.locator('#admin-main h1')).toBeVisible();
      await expect(page.locator('#admin-main').getByRole('alert'), section).toHaveCount(0);
    }
    await page.goto('/fa/admin/catalog?status=PUBLISHED&limit=1');
    for (const width of [360, 390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    const findings = await new AxeBuilder({ page }).analyze();
    expect(
      findings.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
    ).toEqual([]);
    await page
      .getByRole('link', { name: getNamespace('fa', 'admin').language, exact: true })
      .click();
    await expect(page).toHaveURL(/\/en\/admin\/catalog\?status=PUBLISHED&limit=1$/u);
    await page.screenshot({ path: 'test-results/admin-catalog-en-desktop.png', fullPage: true });
  });
  test('performs a confirmed inventory adjustment, creates a real catalog draft and records audit metadata', async ({
    page,
  }) => {
    await signIn(page, 1);
    const ids = adminIds();
    const m = getNamespace('en', 'admin');
    await page.goto(`/en/admin/inventory/items/${ids['ownVariant']}/${ids['location']}`);
    await page.getByLabel(m.delta, { exact: true }).fill('1');
    await page.getByLabel(m.note, { exact: true }).fill('Phase 17 browser inventory correction');
    await page.getByRole('button', { name: m.adjust, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: m.confirm, exact: true }).click();
    await expect(page.getByRole('status')).toContainText(m.saved);
    await page.goto('/en/admin/catalog');
    const create = page.locator('form').filter({ has: page.locator('input[name="sku"]') });
    await page.locator('details').filter({ has: create }).locator('summary').click();
    await create.locator('input[name="sku"]').fill('PHASE17-BROWSER-DRAFT');
    await create.getByRole('button', { name: m.create, exact: true }).click();
    await expect(page).toHaveURL(/\/en\/admin\/catalog\/products\/[0-9a-f-]+$/u);
    await expect(page.locator('input[name="sku"]').first()).toHaveValue('PHASE17-BROWSER-DRAFT');
    await page.goto('/en/admin/audit?action=inventory.adjusted');
    await expect(page.locator('#admin-main').getByRole('alert')).toHaveCount(0);
  });
  test('lets SUPPORT add notes and denies direct fulfilment and pricing requests after UI bypass', async ({
    page,
  }) => {
    await signIn(page, 3);
    const ids = adminIds();
    const m = getNamespace('en', 'admin');
    await expect(
      page.locator('#admin-navigation').getByRole('link', { name: m.pricing, exact: true }),
    ).toHaveCount(0);
    await page.goto(`/en/admin/orders/${ids['orderId']}`);
    await page
      .getByLabel(m.note, { exact: true })
      .fill('Support <img src=x onerror=alert(1)> browser note');
    await page.getByRole('button', { name: m.addNote, exact: true }).click();
    await expect(page.getByRole('status')).toContainText(m.saved);
    await expect(page.locator('#admin-main')).toContainText(
      'Support <img src=x onerror=alert(1)> browser note',
    );
    await expect(page.locator('#admin-main img')).toHaveCount(0);
    await expect(page.getByRole('button', { name: m.prepareShipment, exact: true })).toHaveCount(0);
    const result = await page.evaluate(async (orderId) => {
      const csrf =
        document.cookie
          .split('; ')
          .find((item) => item.startsWith('csrf_token='))
          ?.slice('csrf_token='.length) ?? '';
      const response = await fetch(`/api/bff/admin/fulfilment/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: '{}',
      });
      return response.status;
    }, ids['orderId']);
    expect(result).toBe(403);
    await page.getByRole('button', { name: m.signOut, exact: true }).click();
    await expect(page).toHaveURL(/\/en\/admin\/sign-in$/u);
    await page.goto(`/en/admin/orders/${ids['orderId']}`);
    await expect(page).toHaveURL(/\/en\/admin\/sign-in$/u);
  });
  test('rejects a real customer login as staff', async ({ page }) => {
    const user = adminUser(4);
    const m = getNamespace('en', 'admin');
    await page.goto('/en/admin/sign-in');
    await page.getByLabel(m.email, { exact: true }).fill(user.email);
    await page.locator('#admin-password').evaluate((element, password) => {
      if (!(element instanceof HTMLInputElement)) throw new Error('Input missing.');
      element.value = password;
    }, user.password);
    await page.getByRole('button', { name: m.continue, exact: true }).click();
    await expect(page.locator('.admin-message[role="alert"]')).toContainText(m.forbidden);
    await expect(page).toHaveURL(/\/en\/admin\/sign-in$/u);
  });
  test('uploads and processes real media, completes bilingual catalog translations, and enforces the publication gate', async ({
    page,
  }) => {
    await signIn(page, 5, 'fa');
    const m = getNamespace('fa', 'admin');
    const ids = adminIds();
    await page.goto('/fa/admin/media');
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 24;
      canvas.height = 24;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('Canvas unavailable.');
      context.fillStyle = '#ad792f';
      context.fillRect(0, 0, 24, 24);
      return canvas.toDataURL('image/png').split(',')[1] ?? '';
    });
    const upload = action(page, 'media-upload');
    await upload.locator('[name="fa"]').fill('تصویر مصنوعی آزمون پنل');
    await upload.locator('[name="en"]').fill('Synthetic admin test image');
    await upload.locator('[name="file"]').setInputFiles({
      name: 'unsupported.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Unsupported upload'),
    });
    await upload.getByRole('button', { name: m.upload, exact: true }).click();
    await expect(upload.getByRole('alert')).toContainText(m.uploadInvalid);
    await upload.locator('[name="file"]').setInputFiles({
      name: 'phase17-synthetic.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
    await upload.locator('[name="fa"]').fill('تصویر مصنوعی آزمون پنل');
    await upload.locator('[name="en"]').fill('Synthetic admin image');
    const completed = page.waitForResponse(
      (response) =>
        response.url().includes('/upload-intents/') &&
        response.url().endsWith('/complete') &&
        response.request().method() === 'POST',
    );
    await upload.getByRole('button', { name: m.upload, exact: true }).click();
    const mediaResponse = await completed;
    expect(mediaResponse.status()).toBe(200);
    const asset = record(await mediaResponse.json());
    const assetId = identifier(asset['id']);
    await expect(upload.getByRole('status')).toContainText(m.saved);
    const card = page.locator('article').filter({ hasText: assetId });
    await expect(card.getByRole('img')).toHaveAttribute('alt', 'تصویر مصنوعی آزمون پنل');
    await card.locator('summary').click();
    const alt = action(page, `/api/bff/admin/media/${assetId}/alt-text`);
    await alt.locator('[name="en"]').fill('Updated synthetic alt');
    await save(alt, 'fa');
    expect(await page.locator('#admin-main').innerText()).not.toMatch(
      /honey-scroll|honey-poster|hero-start|hero-end/u,
    );
    await page.goto('/fa/admin/catalog');
    const create = action(page, '/api/bff/admin/catalog/products');
    await page.locator('details').filter({ has: create }).locator('summary').click();
    await create.locator('[name="sku"]').fill('PHASE17-PUBLISH');
    await create.getByRole('button', { name: m.create, exact: true }).click();
    await expect(page).toHaveURL(/\/products\/[0-9a-f-]+$/u);
    const productId = page.url().split('/').at(-1) ?? '';
    const prefix = `/api/bff/admin/catalog/products/${productId}`;
    const translations = action(page, `${prefix}/translations`);
    await translations.nth(0).locator('[name="name"]').fill('عسل آزمون انتشار');
    await translations.nth(0).locator('[name="slug"]').fill('phase17-publish-fa');
    await save(translations.nth(0), 'fa');
    const publication = action(page, `${prefix}/publish`);
    const blocked = page.waitForResponse((response) =>
      response.url().endsWith(`${productId}/publish`),
    );
    await publication.getByRole('button', { name: m.publish, exact: true }).click();
    await confirm(page, 'fa');
    const blockedResponse = await blocked;
    expect(blockedResponse.status()).toBe(409);
    expect(record(await blockedResponse.json())['code']).toBe('PRODUCT_PUBLICATION_INCOMPLETE');
    await expect(publication.getByRole('alert')).toBeVisible();
    await translations.nth(1).locator('[name="name"]').fill('Publication test honey');
    await translations.nth(1).locator('[name="slug"]').fill('phase17-publish-en');
    await save(translations.nth(1), 'fa');
    const variant = action(page, `${prefix}/variants`);
    await page.locator('details').filter({ has: variant }).locator('summary').click();
    for (const [name, value] of Object.entries({
      sku: 'PHASE17-PUBLISH-450',
      jarSizeLabelKey: 'jar.450g',
      packagingTypeKey: 'packaging.glassJar',
      netWeightGrams: '450',
      weightGramsShipping: '600',
      position: '0',
      length: '80',
      width: '80',
      height: '120',
    }))
      await variant.locator(`[name="${name}"]`).fill(value);
    const createdVariant = page.waitForResponse(
      (response) =>
        response.url().endsWith(`${productId}/variants`) && response.request().method() === 'POST',
    );
    await variant.getByRole('button', { name: m.create, exact: true }).click();
    const variantId = identifier(
      records(record(await (await createdVariant).json())['variants'])[0]?.['id'],
    );
    const variantPrefix = `${prefix}/variants/${variantId}`;
    const variantTranslations = action(page, `${variantPrefix}/translations`);
    const details = page.locator('details').filter({ has: action(page, variantPrefix) });
    await details.locator('summary').first().click();
    await variantTranslations.nth(0).locator('[name="name"]').fill('شیشه ۴۵۰ گرمی');
    await save(variantTranslations.nth(0), 'fa');
    await variantTranslations.nth(1).locator('[name="name"]').fill('450 g jar');
    await save(variantTranslations.nth(1), 'fa');
    for (const [path, label] of [
      [`${variantPrefix}/publish`, m.publish],
      [`${variantPrefix}/default`, m.defaultVariant],
    ]) {
      if (path === undefined || label === undefined) throw new Error('Transition missing.');
      const form = action(page, path);
      await form.getByRole('button', { name: label, exact: true }).click();
      await confirm(page, 'fa');
      await expect(form.getByRole('status')).toContainText(m.saved);
    }
    const category = action(page, `${prefix}/categories`);
    await category.locator('[name="categoryId"]').fill(ids['category'] ?? '');
    await category.getByRole('checkbox').check();
    await category.getByRole('button', { name: m.attach, exact: true }).click();
    await expect(category.getByRole('status')).toContainText(m.saved);
    const attach = action(page, `${prefix}/media`);
    await page.locator('details').filter({ has: attach }).locator('summary').click();
    await attach.locator('[name="mediaAssetId"]').fill(assetId);
    await attach.locator('[name="position"]').fill('0');
    await attach.locator('[name="fa"]').fill('تصویر عسل آزمون');
    await attach.locator('[name="en"]').fill('Test honey image');
    await attach.getByRole('button', { name: m.attach, exact: true }).click();
    await expect(attach.getByRole('status')).toContainText(m.saved);
    await publication.getByRole('button', { name: m.publish, exact: true }).click();
    await confirm(page, 'fa');
    await expect(publication.getByRole('status')).toContainText(m.saved);
    await page.goto('/en/products/phase17-publish-en');
    await expect(page.locator('main')).toContainText('Publication test honey');
    await page.goto(`/fa/admin/catalog/products/${productId}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/admin-catalog-fa-mobile.png', fullPage: true });
    const findings = await new AxeBuilder({ page }).analyze();
    expect(
      findings.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
    ).toEqual([]);
  });
  test('requires fresh TOTP for price writes and updates a real coupon', async ({ page }) => {
    await signIn(page, 6);
    const ids = adminIds();
    const m = getNamespace('en', 'admin');
    await page.goto('/en/admin/pricing');
    const price = action(page, '/api/bff/admin/pricing/variant-prices');
    await price.locator('[name="variantId"]').fill(ids['ownVariant'] ?? '');
    await price.locator('[name="amountMinor"]').fill('49000000');
    await price
      .locator('[name="validFrom"]')
      .fill(new Date(Date.now() - 60000).toISOString().slice(0, 16));
    const denied = page.waitForResponse(
      (response) => response.url().endsWith('/pricing/variant-prices') && response.status() === 403,
    );
    await price.getByRole('button', { name: m.create, exact: true }).click();
    expect((await denied).status()).toBe(403);
    await expect(page.getByRole('dialog')).toContainText(m.stepUp);
    await freshStepUp(page, 6);
    await expect(price.getByRole('status')).toContainText(m.saved);
    await page.goto('/en/admin/pricing?view=coupons');
    const coupon = action(page, '/api/bff/admin/pricing/coupons');
    await page.locator('details').filter({ has: coupon }).locator('summary').click();
    await coupon.locator('[name="code"]').fill('PHASE17-BROWSER');
    await coupon.locator('[name="value"]').fill('10');
    await coupon.locator('[name="currency"]').fill('');
    await coupon
      .locator('[name="startsAt"]')
      .fill(new Date(Date.now() - 60000).toISOString().slice(0, 16));
    await coupon.locator('[name="status"]').selectOption('ACTIVE');
    await coupon.getByRole('button', { name: m.create, exact: true }).click();
    await expect(coupon.getByRole('status')).toContainText(m.saved);
    const detail = page.locator('details').filter({ hasText: `${m.edit}: PHASE17-BROWSER` });
    await detail.locator('summary').click();
    const status = detail.locator('form');
    await status.locator('[name="status"]').selectOption('PAUSED');
    await save(status);
    await expect(
      page.locator('.admin-table').getByRole('row').filter({ hasText: 'PHASE17-BROWSER' }),
    ).toContainText(m.statePAUSED);
    await page.getByRole('button', { name: m.signOut, exact: true }).click();
    await expect(page).toHaveURL(/\/en\/admin\/sign-in$/u);
    await page.goto(`/en/products/${CATALOG_SEED.products.en.wildflower}`);
    const repriced = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/bff/cart/lines') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
    const cart = record(await (await repriced).json());
    expect(record(records(cart['lines'])[0]?.['unitPrice'])['amountMinor']).toBe('49000000');
  });
  test('creates a supplier and purchase order, receives stock, edits shipping settings and audits the changes', async ({
    page,
  }) => {
    await signIn(page, 7);
    const ids = adminIds();
    const m = getNamespace('en', 'admin');
    await page.goto('/en/admin/procurement');
    const supplier = action(page, '/api/bff/admin/procurement/suppliers');
    await page.locator('details').filter({ has: supplier }).locator('summary').click();
    await supplier.locator('[name="code"]').fill('PHASE17-BROWSER');
    await supplier.locator('[name="legalName"]').fill('Browser procurement counterparty');
    await supplier.getByRole('button', { name: m.create, exact: true }).click();
    await expect(page).toHaveURL(/\/suppliers\/[0-9a-f-]+$/u);
    const supplierId = page.url().split('/').at(-1) ?? '';
    const edit = action(page, `/api/bff/admin/procurement/suppliers/${supplierId}`);
    await edit.locator('[name="legalName"]').fill('Updated procurement counterparty');
    await save(edit);
    await page.goto('/en/admin/sourcing');
    const batch = action(page, '/api/bff/admin/sourcing/harvest-batches');
    await page.locator('details').filter({ has: batch }).locator('summary').click();
    await batch.locator('[name="sourcingType"]').selectOption('SELECTED_SUPPLIER');
    for (const [name, value] of Object.entries({
      batchCode: 'PHASE17-BROWSER-BATCH',
      supplierId,
      harvestSeason: 'spring',
      harvestYear: '2026',
      floralSources: 'thyme',
      quantityGrams: '2000',
    }))
      await batch.locator(`[name="${name}"]`).fill(value);
    const createdBatch = page.waitForResponse(
      (response) =>
        response.url().endsWith('/sourcing/harvest-batches') &&
        response.request().method() === 'POST',
    );
    await batch.getByRole('button', { name: m.create, exact: true }).click();
    const batchId = identifier(record(await (await createdBatch).json())['id']);
    await page.goto('/en/admin/procurement?view=purchase-orders');
    const purchase = action(page, '/api/bff/admin/procurement/purchase-orders');
    await page.locator('details').filter({ has: purchase }).locator('summary').click();
    for (const [name, value] of Object.entries({
      number: 'PO-PHASE17-BROWSER',
      supplierId,
      destinationStockLocationId: ids['location'] ?? '',
      'lines.0.description': 'Synthetic honey intake',
      'lines.0.variantId': ids['suppliedVariant'] ?? '',
      'lines.0.harvestBatchId': batchId,
      'lines.0.quantityOrdered': '3',
      'lines.0.unitCostMinor': '200000',
    }))
      await purchase.locator(`[name="${name}"]`).fill(value);
    await purchase.getByRole('button', { name: m.create, exact: true }).click();
    await expect(page).toHaveURL(/\/purchase-orders\/[0-9a-f-]+$/u);
    const purchaseId = page.url().split('/').at(-1) ?? '';
    const transition = action(
      page,
      `/api/bff/admin/procurement/purchase-orders/${purchaseId}/transition`,
    );
    for (const next of ['SUBMITTED', 'CONFIRMED']) {
      await transition.locator('[name="status"]').selectOption(next);
      await transition.getByRole('button', { name: m.transition, exact: true }).click();
      await confirm(page);
      await expect(transition.getByRole('status')).toContainText(m.saved);
      await expect(transition.locator('[name="status"] option[value="' + next + '"]')).toHaveCount(
        0,
      );
    }
    const receipt = action(
      page,
      `/api/bff/admin/procurement/purchase-orders/${purchaseId}/receipts`,
    );
    await receipt.locator('[name="lines.0.quantityAccepted"]').fill('3');
    const received = page.waitForResponse((response) =>
      response.url().endsWith(`${purchaseId}/receipts`),
    );
    await receipt.getByRole('button', { name: m.goodsReceipt, exact: true }).click();
    await confirm(page);
    expect((await received).status()).toBe(201);
    await expect(receipt).toHaveCount(0);
    await page.goto(`/en/admin/inventory/items/${ids['suppliedVariant']}/${ids['location']}`);
    await expect(page.getByText(m.onHand, { exact: true }).locator('..').locator('dd')).toHaveText(
      '8',
    );
    await expect(page.locator('table')).toContainText('3');
    await page.goto('/en/admin/settings');
    const zone = page
      .locator('details')
      .filter({ has: page.locator('form[data-admin-action*="/shipping/zones/"]') })
      .first();
    await zone.locator('summary').click();
    const zoneForm = zone.locator('form');
    await zoneForm.locator('[name="name"]').fill('Phase 17 test shipping zone');
    await zoneForm.locator('[name="priority"]').fill('1');
    const zoneSaved = page.waitForResponse(
      (response) =>
        response.url().includes('/shipping/zones/') && response.request().method() === 'PUT',
    );
    await zoneForm.getByRole('button', { name: m.create, exact: true }).click();
    const zoneResponse = await zoneSaved;
    expect(record(await zoneResponse.json())).not.toHaveProperty('code');
    expect(zoneResponse.status()).toBe(200);
    await expect(zoneForm.getByRole('status')).toContainText(m.saved);
    await page.goto('/en/admin/audit?action=shipping.zone.created');
    await expect(page.locator('#admin-main').getByRole('alert')).toHaveCount(0);
    await expect(page.locator('table')).toContainText('shipping.zone.created');
    await page.goto(`/en/admin/customers?q=${encodeURIComponent(adminUser(4).email)}`);
    await expect(page.locator('#admin-main')).toContainText(adminUser(4).email);
    expect(await page.locator('#admin-main').innerText()).not.toMatch(
      /secretHash|encryptedSecret|sessionToken/u,
    );
  });
  test('dispatches a real allocated order and performs a confirmed, step-up protected partial refund', async ({
    page,
  }) => {
    await signIn(page, 8);
    const ids = adminIds();
    const m = getNamespace('en', 'admin');
    await page.goto(`/en/admin/orders/${ids['cancelOrderId']}`);
    const cancellation = action(
      page,
      `/api/bff/admin/fulfilment/orders/${ids['cancelOrderId']}/cancel`,
    );
    await cancellation.getByRole('button', { name: m.cancelOrder, exact: true }).click();
    await confirm(page);
    await expect(cancellation).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.admin-facts').first()).toContainText(m.stateCANCELLED);
    await expect(page.getByRole('button', { name: m.cancelOrder, exact: true })).toHaveCount(0);
    await page.goto(`/en/admin/orders/${ids['orderId']}`);
    const shipment = action(page, `/api/bff/admin/fulfilment/orders/${ids['orderId']}/shipments`);
    await shipment.locator('[name="lines.0.quantity"]').fill('1');
    await shipment.locator('[name="trackingNumber"]').fill('PHASE17-TRACKING');
    await shipment.getByRole('button', { name: m.prepareShipment, exact: true }).click();
    await confirm(page);
    await expect(shipment.getByRole('status')).toContainText(m.saved);
    const dispatch = page.locator('form[data-admin-action$="/dispatch"]');
    await dispatch.getByRole('button', { name: m.dispatch, exact: true }).click();
    await confirm(page);
    await expect(dispatch).toHaveCount(0);
    await expect(page.locator('form[data-admin-action$="/deliver"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: m.cancelOrder, exact: true })).toHaveCount(0);
    const refund = action(page, `/api/bff/admin/payments/${ids['paymentId']}/refunds`);
    await refund.locator('[name="amountMinor"]').fill('10000');
    await refund.locator('[name="reason"]').fill('Synthetic partial refund');
    await refund.getByRole('button', { name: m.refund, exact: true }).click();
    await confirm(page);
    await expect(page.getByRole('dialog')).toContainText(m.stepUp);
    await freshStepUp(page, 8);
    await expect(refund.getByRole('status')).toContainText(m.saved);
    await expect(
      page.locator('table').filter({ has: page.locator('caption').filter({ hasText: m.refund }) }),
    ).toContainText('Synthetic partial refund');
    const findings = await new AxeBuilder({ page }).analyze();
    expect(
      findings.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
    ).toEqual([]);
  });
});
