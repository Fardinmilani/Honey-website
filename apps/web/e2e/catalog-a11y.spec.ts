import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { CATALOG_ROUTES, CATALOG_SEED } from './helpers/catalog-seed';

const catalogPages = [
  { locale: 'fa', home: '/fa', listing: CATALOG_ROUTES.products.fa },
  { locale: 'en', home: '/en', listing: CATALOG_ROUTES.products.en },
] as const;

for (const entry of catalogPages) {
  test.describe(`catalog axe ${entry.locale}`, () => {
    test('home has no serious or critical violations', async ({ page }) => {
      await page.goto(entry.home);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });

    test('listing has no serious or critical violations', async ({ page }) => {
      await page.goto(entry.listing);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });

    test('product detail has no serious or critical violations', async ({ page }) => {
      const slug =
        entry.locale === 'fa' ? CATALOG_SEED.products.fa.thyme : CATALOG_SEED.products.en.thyme;
      const encodedSlug = entry.locale === 'fa' ? encodeURIComponent(slug) : slug;
      await page.goto(`${entry.listing}/${encodedSlug}`);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  });
}
