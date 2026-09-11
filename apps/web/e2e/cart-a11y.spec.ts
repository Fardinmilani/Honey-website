import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const cartPages = [
  { locale: 'en', path: '/en/cart', heading: 'Your cart' },
  { locale: 'fa', path: '/fa/sabad-kharid', heading: 'سبد خرید شما' },
] as const;

for (const entry of cartPages) {
  test.describe(`cart axe ${entry.locale}`, () => {
    test('empty cart has no serious or critical violations', async ({ page }) => {
      await page.goto(entry.path);
      await expect(page.getByRole('heading', { name: entry.heading, level: 1 })).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  });
}
