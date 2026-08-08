import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('locale negotiation', () => {
  test('/ redirects with 307', async ({ request }) => {
    const response = await request.get('/', { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const location = response.headers()['location'] ?? '';
    expect(
      location === '/fa' ||
        location === '/en' ||
        location.endsWith('/fa') ||
        location.endsWith('/en'),
    ).toBe(true);
  });

  test('NEXT_LOCALE cookie wins', async ({ request }) => {
    const response = await request.get('/', {
      maxRedirects: 0,
      headers: {
        Cookie: 'NEXT_LOCALE=en',
        'Accept-Language': 'fa',
      },
    });
    expect(response.status()).toBe(307);
    expect(response.headers()['location'] ?? '').toMatch(/\/en$/);
  });

  test('Accept-Language negotiation works', async ({ request }) => {
    const response = await request.get('/', {
      maxRedirects: 0,
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    expect(response.status()).toBe(307);
    expect(response.headers()['location'] ?? '').toMatch(/\/en$/);
  });

  test('default locale fallback works', async ({ request }) => {
    const response = await request.get('/', {
      maxRedirects: 0,
      headers: {
        'Accept-Language': 'de-DE,de;q=0.9',
      },
    });
    expect(response.status()).toBe(307);
    expect(response.headers()['location'] ?? '').toMatch(/\/fa$/);
  });
});

test.describe('localized homepage', () => {
  test('/fa renders RTL with fa lang', async ({ page }) => {
    await page.goto('/fa');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa-IR');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('home.headline');
  });

  test('/en renders LTR with en lang', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('home.headline');
  });

  test('unsupported locale does not render normal homepage', async ({ page }) => {
    await page.goto('/de');
    await expect(page.getByRole('heading', { name: 'Unsupported locale' })).toBeVisible();
    await expect(page.locator('.hero')).toHaveCount(0);
  });

  test('language switcher changes locale and persists cookie', async ({ page, context }) => {
    await page.goto('/fa');
    await page
      .getByRole('navigation', { name: /زبان|Language/i })
      .getByRole('link', { name: 'English' })
      .click();
    await expect(page).toHaveURL(/\/en$/);
    await expect
      .poll(async () => {
        const cookies = await context.cookies();
        return cookies.find((cookie) => cookie.name === 'NEXT_LOCALE')?.value;
      })
      .toBe('en');
  });

  test('Hero poster exists immediately', async ({ page }) => {
    await page.goto('/en');
    const poster = page.locator('.hero__poster');
    await expect(poster).toBeVisible();
    await expect(poster).toHaveAttribute('src', /honey-poster\.webp/);
  });

  test('skip link reaches main', async ({ page }) => {
    await page.goto('/en');
    await page.keyboard.press('Tab');
    const skip = page.locator('.skip-link');
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('primary controls are keyboard accessible', async ({ page }) => {
    await page.goto('/en');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const tagName = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(['A', 'BUTTON']).toContain(tagName);
  });

  test('authenticated session material is not readable from browser JS', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'honey_session',
        value: 'opaque-session-secret-value',
        url: 'http://127.0.0.1:3000',
        httpOnly: true,
      },
    ]);
    await page.goto('/en');
    const readable = await page.evaluate(() => document.cookie);
    expect(readable).not.toContain('opaque-session-secret-value');
    expect(readable).not.toContain('honey_session=');
  });
});

test.describe('axe', () => {
  for (const locale of ['fa', 'en'] as const) {
    test(`axe ${locale} has no serious or critical violations`, async ({ page }) => {
      await page.goto(`/${locale}`);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }
});
