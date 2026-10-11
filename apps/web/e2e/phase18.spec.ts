import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { getNamespace, type Locale } from '@honey/i18n';
import { adminIds, adminUser, signIn } from './helpers/admin-auth';
import { record, records, text } from '../src/lib/admin/validation';
import { CATALOG_SEED } from './helpers/catalog-seed';
const origin = 'http://127.0.0.1:3107';
let axeScans = 0;
let responsiveChecks = 0;
test.afterAll(() => {
  console.log(
    `Phase 18 accessibility: ${axeScans} scans; 0 serious/critical violations. Responsive: ${responsiveChecks} viewport checks.`,
  );
});
const action = (page: Page, path: string) => page.locator(`form[data-admin-action="${path}"]`);
async function save(form: Locator) {
  await form.getByRole('button', { name: getNamespace('en', 'admin').save, exact: true }).click();
  await expect(form.getByRole('status')).toContainText(getNamespace('en', 'admin').saved);
}
async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? '')),
  ).toEqual([]);
  axeScans += 1;
}
async function responsive(page: Page) {
  for (const width of [360, 390, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    responsiveChecks += 1;
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}
async function mutation(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const csrf =
        document.cookie
          .split('; ')
          .find((s) => s.startsWith('csrf_token='))
          ?.slice(11) ?? '';
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    },
    { path, body },
  );
}
async function mailCount(subjectPart: string) {
  const response = await fetch('http://127.0.0.1:8027/api/v1/messages');
  const raw: unknown = await response.json();
  return records(record(raw)['messages']).filter((m) => text(m['Subject']).includes(subjectPart));
}
async function mail(subjectPart: string) {
  await expect
    .poll(async () => (await mailCount(subjectPart)).length, { timeout: 90000 })
    .toBeGreaterThan(0);
  const messages = await mailCount(subjectPart);
  const id = text(messages[0]?.['ID']);
  const r = await fetch('http://127.0.0.1:8027/api/v1/message/' + id);
  const raw: unknown = await r.json();
  return record(raw);
}
async function customerLogin(page: Page, index: number) {
  await page.goto('/en');
  const u = adminUser(index);
  const status = await page.evaluate(async (u) => {
    const r = await fetch('/api/bff/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: u.password }),
    });
    return r.status;
  }, u);
  expect(status).toBe(200);
}
async function tokenPage(
  page: Page,
  link: string,
  locale: Locale,
  operation: 'confirm' | 'unsubscribe',
) {
  await page.goto(`/${locale}/newsletter/${operation}`);
  await page.evaluate((link) => location.assign(link), link);
  await expect(
    page.getByRole('heading', { name: getNamespace(locale, 'editorial')[operation], exact: true }),
  ).toBeVisible();
  expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');
  await page
    .getByRole('button', { name: getNamespace(locale, 'editorial')[operation], exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    getNamespace(locale, 'editorial').actionResult,
  );
  expect(await page.evaluate(() => location.search)).toBe('');
}
test.describe.serial('Phase 18 isolated PostgreSQL, Redis, worker, MinIO and Mailpit', () => {
  let articleId = '';
  let articleAdmin = '';
  test('creates bilingual Page and Article, rejects incomplete publication and unsafe blocks, then publishes with SEO and revalidation', async ({
    page,
    request,
  }) => {
    await signIn(page, 0);
    const a = getNamespace('en', 'admin');
    const e = getNamespace('en', 'editorial');
    for (const kind of ['page', 'article'] as const) {
      await page.goto('/en/admin/content?kind=' + kind);
      const create = action(page, '/api/bff/admin/content/' + kind);
      await create.locator('[name="code"]').fill('phase18-' + kind);
      await create.getByRole('button', { name: a.create, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/en/admin/content/${kind}/[0-9a-f-]+$`, 'u'));
      const id = page.url().split('/').at(-1) ?? '';
      const adminUrl = page.url();
      const form = () => action(page, `/api/bff/admin/content/${kind}/${id}/translations`);
      await form()
        .nth(0)
        .locator('[name="title"]')
        .fill('خاستگاه ' + kind);
      await form()
        .nth(0)
        .locator('[name="slug"]')
        .fill('phase18-' + kind + '-fa');
      await form()
        .nth(0)
        .getByRole('textbox', { name: e.paragraph, exact: true })
        .fill('عطر گل و بافت عسل');
      await save(form().nth(0));
      const publish = () => action(page, `/api/bff/admin/content/${kind}/${id}/publish`);
      const blocked = page.waitForResponse((r) => r.url().endsWith(id + '/publish'));
      await publish().getByRole('button', { name: a.publish, exact: true }).click();
      expect((await blocked).status()).toBe(422);
      await expect(publish().getByRole('alert')).toBeVisible();
      await form()
        .nth(1)
        .locator('[name="title"]')
        .fill('Origin ' + kind);
      await form()
        .nth(1)
        .locator('[name="slug"]')
        .fill('phase18-' + kind + '-en');
      await form()
        .nth(1)
        .getByRole('textbox', { name: e.paragraph, exact: true })
        .fill('<img src=x onerror="window.injected=true">');
      await form().nth(1).getByRole('button', { name: a.save, exact: true }).click();
      await expect(form().nth(1).getByRole('alert')).toBeVisible();
      await form()
        .nth(1)
        .getByRole('textbox', { name: e.paragraph, exact: true })
        .fill('Floral aroma and texture');
      await save(form().nth(1));
      const publicPath =
        kind === 'page' ? '/en/pages/phase18-page-en' : '/en/articles/phase18-article-en';
      expect((await request.get(publicPath)).status()).toBe(404);
      await axe(page);
      await responsive(page);
      await publish().getByRole('button', { name: a.publish, exact: true }).click();
      await expect(publish()).toHaveCount(0);
      for (const locale of ['fa', 'en'] as const) {
        const path =
          locale === 'en'
            ? publicPath
            : `/fa/${kind === 'page' ? 'safahat' : 'maghalat'}/phase18-${kind}-fa`;
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('dir', locale === 'fa' ? 'rtl' : 'ltr');
        await expect(page.locator('main h1')).toHaveText(
          locale === 'en' ? 'Origin ' + kind : 'خاستگاه ' + kind,
        );
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', origin + path);
        await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
          'href',
          origin + publicPath,
        );
        await expect(page.locator('link[rel="alternate"][hreflang="fa-IR"]')).toHaveAttribute(
          'href',
          origin + `/fa/${kind === 'page' ? 'safahat' : 'maghalat'}/phase18-${kind}-fa`,
        );
        await axe(page);
        await responsive(page);
        if (kind === 'article') {
          expect(
            await page.locator('script[type="application/ld+json"]').allTextContents(),
          ).toEqual(expect.arrayContaining([expect.stringContaining('"@type":"Article"')]));
        }
      }
      await page.goto(adminUrl);
      await form()
        .nth(1)
        .getByRole('textbox', { name: e.paragraph, exact: true })
        .fill('Updated floral aroma');
      await save(form().nth(1));
      await expect
        .poll(
          async () => {
            await page.goto(publicPath);
            return page.locator('main').innerText();
          },
          { timeout: 90000 },
        )
        .toContain('Updated floral aroma');
      if (kind === 'article') {
        articleId = id;
        articleAdmin = adminUrl;
      }
    }
  });
  test('publishes FAQ in both languages with semantic keyboard disclosure and visible-only structured data', async ({
    page,
  }) => {
    await signIn(page, 1);
    const a = getNamespace('en', 'admin'),
      e = getNamespace('en', 'editorial');
    await page.goto('/en/admin/content?kind=faq');
    const create = action(page, '/api/bff/admin/content/faq');
    await create.locator('[name="code"]').fill('phase18-faq');
    await create.getByRole('button', { name: a.create, exact: true }).click();
    await expect(page).toHaveURL(/\/faq\/[a-f0-9-]+$/u);
    const id = page.url().split('/').at(-1) ?? '';
    const forms = action(page, `/api/bff/admin/content/faq/${id}/translations`);
    for (const [i, title, answer] of [
      [0, 'چگونه نگهداری شود؟', 'دور از نور مستقیم'],
      [1, 'How to store?', 'Keep away from direct sunlight'],
    ] as const) {
      await forms.nth(i).locator('[name="title"]').fill(title);
      await forms.nth(i).getByRole('textbox', { name: e.paragraph, exact: true }).fill(answer);
      await save(forms.nth(i));
    }
    await action(page, `/api/bff/admin/content/faq/${id}/publish`)
      .getByRole('button', { name: a.publish, exact: true })
      .click();
    await expect(action(page, `/api/bff/admin/content/faq/${id}/publish`)).toHaveCount(0);
    for (const [locale, path, question, answer] of [
      ['en', '/en/faq', 'How to store?', 'Keep away from direct sunlight'],
      ['fa', '/fa/porseshha', 'چگونه نگهداری شود؟', 'دور از نور مستقیم'],
    ] as const) {
      await page.goto(path);
      const summary = page.locator('main summary').filter({ hasText: question });
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('main details[open]')).toContainText(answer);
      const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
      expect(ld).toEqual(expect.arrayContaining([expect.stringContaining('"@type":"FAQPage"')]));
      expect(ld.join('')).toContain(answer);
      expect(ld.join('')).not.toContain(locale === 'en' ? 'دور از نور مستقیم' : 'Keep away');
      await axe(page);
      await responsive(page);
    }
  });
  test('delivers both orders from opposite admin locales and sends exactly one localized message per shipment event', async ({
    page,
  }) => {
    const ids = adminIds();
    for (const [orderId, adminLocale, mailLocale, number] of [
      [ids['phase18FaOrderId'], 'en', 'fa', 'HNY-PHASE18-FA'],
      [ids['orderId'], 'fa', 'en', 'HNY-PHASE17-BROWSER'],
    ] as const) {
      await signIn(page, adminLocale === 'en' ? 2 : 8, adminLocale);
      const a = getNamespace(adminLocale, 'admin');
      await page.goto(`/${adminLocale}/admin/orders/${orderId}`);
      const create = action(page, `/api/bff/admin/fulfilment/orders/${orderId}/shipments`);
      await create.locator('[name="lines.0.quantity"]').fill('2');
      await create.locator('[name="trackingNumber"]').fill('PHASE18-TRACKING');
      await create.getByRole('button', { name: a.prepareShipment, exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: a.confirm, exact: true }).click();
      await expect(create.getByRole('status')).toContainText(a.saved);
      for (const transition of ['dispatch', 'deliver'] as const) {
        const form = page.locator(`form[data-admin-action$="/${transition}"]`);
        await form
          .getByRole('button', {
            name: transition === 'dispatch' ? a.dispatch : a.deliver,
            exact: true,
          })
          .click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: a.confirm, exact: true })
          .click();
        await expect(form).toHaveCount(0);
      }
      await expect.poll(async () => (await mailCount(number)).length, { timeout: 90000 }).toBe(2);
      const messages = await mailCount(number);
      for (const m of messages) {
        const response = await fetch('http://127.0.0.1:8027/api/v1/message/' + text(m['ID']));
        const raw: unknown = await response.json();
        expect(text(record(raw)['HTML'])).toContain(
          `lang="${mailLocale}" dir="${mailLocale === 'fa' ? 'rtl' : 'ltr'}"`,
        );
      }
      await page.context().clearCookies();
    }
  });
  test('eligible customer submits plain text into pending moderation; server rejects forged authority and claim approval', async ({
    page,
  }) => {
    await customerLogin(page, 4);
    const eligibility = await page.request.get(
      '/api/bff/me/reviews/eligibility?productId=' + adminIds()['ownProduct'],
    );
    expect(eligibility.status()).toBe(200);
    expect(await eligibility.json()).toEqual({ eligible: true });
    await page.goto('/en/products/' + CATALOG_SEED.products.en.wildflower);
    const e = getNamespace('en', 'editorial');
    const review = page
      .locator('form')
      .filter({ has: page.getByLabel(e.reviewTitle, { exact: true }) });
    await expect(review).toBeVisible();
    await axe(page);
    await responsive(page);
    const forged = await mutation(page, '/api/bff/me/reviews', {
      productId: adminIds()['ownProduct'],
      rating: 5,
      title: 'Forged',
      body: 'Floral',
      locale: 'en',
      verifiedPurchase: true,
      status: 'APPROVED',
    });
    expect(forged.status).toBe(422);
    await review.getByRole('radio', { name: '4', exact: false }).check();
    await review.getByLabel(e.reviewTitle, { exact: true }).fill('Browser texture');
    await review
      .getByLabel(e.reviewBody, { exact: true })
      .fill('<script>window.injected=true</script> Smooth texture');
    await review.getByRole('button', { name: e.submit, exact: true }).click();
    await expect(page.getByRole('status')).toContainText(e.submitted);
    await page.reload();
    expect(await page.locator('main').innerText()).not.toContain('Browser texture');
    expect(
      (await page.locator('script[type="application/ld+json"]').allTextContents()).join(''),
    ).not.toContain('aggregateRating');
    await page.context().clearCookies();
    await customerLogin(page, 10);
    const claim = await mutation(page, '/api/bff/me/reviews', {
      productId: adminIds()['ownProduct'],
      rating: 1,
      title: 'Browser claim',
      body: 'This cures illness',
      locale: 'en',
    });
    expect(claim.status).toBe(201);
    await page.context().clearCookies();
    await signIn(page, 6);
    await page.goto('/en/admin/reviews');
    const claimPanel = page
      .locator('section.admin-panel')
      .filter({ has: page.getByRole('heading', { name: 'Browser claim', exact: true }) });
    const approve = claimPanel.locator('form[data-admin-action$="/approve"]');
    await approve
      .getByRole('button', { name: getNamespace('en', 'admin').confirm, exact: true })
      .click();
    await expect(approve.getByRole('alert')).toBeVisible();
    const reject = claimPanel.locator('form[data-admin-action$="/reject"]');
    await reject
      .getByRole('button', { name: getNamespace('en', 'admin').confirm, exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: getNamespace('en', 'admin').confirm, exact: true })
      .click();
    await expect(claimPanel).toHaveCount(0);
    const safe = page
      .locator('section.admin-panel')
      .filter({ has: page.getByRole('heading', { name: 'Browser texture', exact: true }) });
    await expect(safe).toContainText('<script>window.injected=true</script>');
    expect(await page.evaluate(() => Reflect.get(window, 'injected'))).toBeUndefined();
    await axe(page);
    await responsive(page);
    await safe
      .locator('form[data-admin-action$="/approve"]')
      .getByRole('button', { name: getNamespace('en', 'admin').confirm, exact: true })
      .click();
    await expect(safe).toHaveCount(0);
    await expect
      .poll(
        async () => {
          await page.goto('/en/products/' + CATALOG_SEED.products.en.wildflower);
          return page.locator('main').innerText();
        },
        { timeout: 90000 },
      )
      .toContain('Browser texture');
    expect(await page.evaluate(() => Reflect.get(window, 'injected'))).toBeUndefined();
    const ld = (await page.locator('script[type="application/ld+json"]').allTextContents())
      .map((s) => record(JSON.parse(s) as unknown))
      .find((s) => s['@type'] === 'Product');
    expect(record(ld?.['aggregateRating'])).toMatchObject({ reviewCount: 1, ratingValue: 4 });
    await axe(page);
  });
  test('template editing and synthetic preview work, with honest disabled SMS and private admin security', async ({
    page,
    request,
  }) => {
    await signIn(page, 5);
    await page.goto('/en/admin/notifications');
    const e = getNamespace('en', 'editorial'),
      a = getNamespace('en', 'admin');
    const panel = page
      .locator('section.admin-panel')
      .filter({ has: page.getByRole('heading', { name: /newsletter-confirm.*en.*EMAIL/u }) });
    await panel.locator('summary').click();
    const preview = panel.locator('form[data-admin-action$="/preview"]');
    await preview.getByRole('button', { name: a.view, exact: true }).click();
    await expect(preview.getByRole('status')).toContainText(a.saved);
    await expect(panel.locator('div[role="status"]')).toContainText(
      'Confirm your newsletter subscription',
    );
    await expect(panel).toContainText(e.allowedVariables);
    await save(panel.locator('form[data-admin-action="/api/bff/admin/notifications/templates"]'));
    await expect(page.getByText(e.smsDisabled)).toHaveCount(4);
    await axe(page);
    await responsive(page);
    const privateResponse = await request.get('/en/admin/notifications');
    expect(privateResponse.headers()['cache-control']).toContain('no-store');
  });
  test('double opt-in and unsubscribe require explicit actions in FA and EN, with generic results and fresh resubscribe links', async ({
    page,
  }) => {
    for (const locale of ['fa', 'en'] as const) {
      const e = getNamespace(locale, 'editorial');
      await page.goto('/' + locale);
      const form = page.locator('section.editorial-newsletter form');
      await form.getByLabel(e.email, { exact: true }).fill(`phase18-${locale}@example.invalid`);
      await form.getByLabel(e.consent, { exact: true }).check();
      await form.getByRole('button', { name: e.subscribe, exact: true }).click();
      await expect(form.getByRole('status')).toContainText(e.subscribeResult);
      await axe(page);
      const subject = locale === 'fa' ? 'تأیید' : 'Confirm';
      const confirmMail = await mail(subject);
      expect(text(confirmMail['HTML'])).toContain(
        `lang="${locale}" dir="${locale === 'fa' ? 'rtl' : 'ltr'}"`,
      );
      const link = text(confirmMail['Text']).match(/http:\/\/[^\s]+/u)?.[0];
      if (link === undefined) throw new Error('Confirmation link missing.');
      await tokenPage(page, link, locale, 'confirm');
      const welcome = await mail(
        locale === 'fa' ? 'عضویت شما' : 'Your newsletter subscription is confirmed',
      );
      const unsubscribe = text(welcome['Text']).match(/http:\/\/[^\s]+/u)?.[0];
      if (unsubscribe === undefined) throw new Error('Unsubscribe link missing.');
      await tokenPage(page, unsubscribe, locale, 'unsubscribe');
      await tokenPage(page, unsubscribe, locale, 'unsubscribe');
      const welcomeSubject =
        locale === 'fa' ? 'عضویت شما' : 'Your newsletter subscription is confirmed';
      const confirmSubject = locale === 'fa' ? 'تأیید عضویت' : 'Confirm';
      const before = (await mailCount(confirmSubject)).length;
      await page.goto('/' + locale);
      await form.getByLabel(e.email, { exact: true }).fill(`phase18-${locale}@example.invalid`);
      await form.getByLabel(e.consent, { exact: true }).check();
      await form.getByRole('button', { name: e.subscribe, exact: true }).click();
      await expect(form.getByRole('status')).toContainText(e.subscribeResult);
      await expect
        .poll(async () => (await mailCount(confirmSubject)).length, { timeout: 90000 })
        .toBe(before + 1);
      const renewed = await mail(confirmSubject);
      const renewedLink = text(renewed['Text']).match(/http:\/\/[^\s]+/u)?.[0];
      if (renewedLink === undefined) throw new Error('Fresh confirmation link missing.');
      expect(renewedLink === link).toBe(false);
      await tokenPage(page, link, locale, 'confirm');
      expect((await mailCount(welcomeSubject)).length).toBe(1);
      await tokenPage(page, renewedLink, locale, 'confirm');
      await expect
        .poll(async () => (await mailCount(welcomeSubject)).length, { timeout: 90000 })
        .toBe(2);
      await axe(page);
      await responsive(page);
    }
  });
  test('sitemap includes published translations and archive removes public access and sitemap URLs', async ({
    page,
    request,
  }) => {
    const sitemap = await request.get('/sitemaps/en/articles');
    expect(await sitemap.text()).toContain('/en/articles/phase18-article-en');
    expect(await sitemap.text()).not.toMatch(/\/admin\/|newsletter\/|token=/u);
    await signIn(page, 7);
    await page.goto(articleAdmin);
    const form = action(page, `/api/bff/admin/content/article/${articleId}/archive`);
    await form
      .getByRole('button', { name: getNamespace('en', 'admin').archive, exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: getNamespace('en', 'admin').confirm, exact: true })
      .click();
    await expect(form).toHaveCount(0);
    await expect
      .poll(async () => (await request.get('/en/articles/phase18-article-en')).status(), {
        timeout: 90000,
      })
      .toBe(404);
    await expect
      .poll(async () => await (await request.get('/sitemaps/en/articles')).text(), {
        timeout: 90000,
      })
      .not.toContain('/en/articles/phase18-article-en');
  });
});
