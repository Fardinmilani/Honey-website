import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { CATALOG_ROUTES, CATALOG_SEED } from './helpers/catalog-seed';

const checkoutPages = [
  { locale: 'en', path: '/en/checkout', heading: 'Checkout' },
  { locale: 'fa', path: '/fa/takmil-sefaresh', heading: 'تکمیل سفارش' },
] as const;

async function assertNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

for (const entry of checkoutPages) {
  test.describe(`checkout axe ${entry.locale}`, () => {
    test('the empty-cart checkout redirect target has no serious or critical violations', async ({
      page,
    }) => {
      await page.goto(entry.path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await assertNoSeriousViolations(page);
    });
  });
}

test.describe('checkout form axe en', () => {
  test('the contact and address form has no serious or critical violations', async ({ page }) => {
    await page.goto(`${CATALOG_ROUTES.products.en}/${CATALOG_SEED.products.en.wildflower}`);
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByRole('button', { name: 'Added to cart' })).toBeVisible();

    await page.goto('/en/checkout');
    await expect(page.getByRole('heading', { name: 'Checkout', level: 1 })).toBeVisible();
    await assertNoSeriousViolations(page);
  });
});
