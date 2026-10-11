import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contentBlocks, assertContentComplete } from '../src/modules/content/domain/content.js';
import { editorialText, assertEditorialPublication } from '../src/policy/editorial-text.js';
import {
  renderTemplate,
  validateTemplate,
  type Template,
} from '../src/modules/notifications/domain/templates.js';
import { decodeJobEnvelope, createJobEnvelope, JOB_NAMES } from '../src/jobs/contracts.js';
const base: Template = {
  code: 'shipment-shipped',
  locale: 'fa',
  channel: 'EMAIL',
  subject: 'سفارش {{orderNumber}}',
  body: 'رهگیری {{trackingNumber}} {{trackingUrl}}',
};
const variables = {
  orderNumber: 'HNY-1',
  trackingNumber: '<img src=x onerror=alert(1)>',
  trackingUrl: 'https://example.invalid/track',
};
describe('Phase 18 bounded content and publication', () => {
  it('accepts only the four flat V1 block types', () =>
    expect(
      contentBlocks([
        { type: 'heading', level: 2, text: 'Taste' },
        { type: 'paragraph', text: 'Floral aroma' },
        { type: 'quote', text: 'Harvest story' },
        { type: 'image', mediaAssetId: randomUUID(), alt: 'Honey jar' },
      ]),
    ).toHaveLength(4));
  it.each(
    [
      [],
      [{ type: 'iframe', text: 'x' }],
      [{ type: 'heading', level: 1, text: 'x' }],
      [{ type: 'paragraph', text: 'x', html: 'x' }],
      [{ type: 'image', mediaAssetId: '/media/hero/desktop/honey-poster.webp', alt: 'x' }],
      Array.from({ length: 61 }, () => ({ type: 'paragraph', text: 'x' })),
      [{ type: 'paragraph', text: '<script>alert(1)</script>' }],
      [{ type: 'paragraph', text: '<img src=x onerror=alert(1)>' }],
      [{ type: 'paragraph', text: 'javascript:alert(1)' }],
      [{ type: 'paragraph', text: 'onload = alert(1)' }],
    ].map((b) => ({ blocks: b })),
  )('rejects malformed, oversized and executable blocks %#', (b) =>
    expect(() => contentBlocks(b.blocks)).toThrow(),
  );
  it('requires every enabled language', () => {
    const t = {
      locale: 'en',
      title: 'Origin',
      slug: 'origin',
      blocks: contentBlocks([{ type: 'paragraph', text: 'Mountain flowers' }]),
      metaTitle: null,
      metaDescription: null,
    };
    expect(() => assertContentComplete([t], ['en', 'fa'])).toThrow();
    expect(() => assertContentComplete([t, { ...t, locale: 'fa' }], ['en', 'fa'])).not.toThrow();
  });
  it.each(['', '\u0000', '\u202eabc', '\ud800', 'x'.repeat(201)])(
    'rejects invalid editorial text %#',
    (s) => expect(() => editorialText(s, 200, 'title')).toThrow(),
  );
  it.each([
    'This cures illness',
    'Boost immunity',
    'antibacterial',
    'lab verified',
    'moisture 12%',
    'درمان بیماری',
    'تقویت سیستم ایمنی',
    'آزمایشگاه',
  ])('holds prohibited copy out of publication %#', (s) =>
    expect(() => assertEditorialPublication(s)).toThrow(),
  );
  it('permits sensory and origin copy', () =>
    expect(() =>
      assertEditorialPublication(
        'Floral aroma, mountain origin, smooth texture. عطر گل و بافت نرم',
      ),
    ).not.toThrow());
});
describe('Phase 18 notification rendering', () => {
  it.each([
    '{{password}}',
    '{{user.email}}',
    '{{__proto__}}',
    '{{constructor}}',
    '{{{orderNumber}}}',
    '{{orderNumber',
  ])('rejects unsupported placeholder %#', (body) =>
    expect(() => validateTemplate({ ...base, body }, ['fa', 'en'])).toThrow(),
  );
  it('escapes variable and static HTML and sets Persian direction', () => {
    const r = renderTemplate(
      { ...base, body: '<img src=x> {{trackingNumber}} {{trackingUrl}}' },
      variables,
      'https://example.invalid',
    );
    expect(r.html).toContain('lang="fa" dir="rtl"');
    expect(r.html).toContain('&lt;img');
    expect(r.html).not.toContain('<img');
    expect(r.html).toContain('<bdi dir="ltr">');
  });
  it('renders English explicitly in LTR', () =>
    expect(
      renderTemplate({ ...base, locale: 'en' }, variables, 'https://example.invalid').html,
    ).toContain('lang="en" dir="ltr"'));
  it.each(['Bad\r\nBcc: x@example.invalid', '\nInjected'])(
    'rejects header injection %#',
    (subject) => expect(() => validateTemplate({ ...base, subject }, ['fa', 'en'])).toThrow(),
  );
  it('rejects variable header injection', () =>
    expect(() =>
      renderTemplate(
        base,
        { ...variables, orderNumber: 'x\r\nBcc: injected' },
        'https://example.invalid',
      ),
    ).toThrow());
  it.each([
    'javascript:alert(1)',
    'http://example.invalid/track',
    'https://user:pass@example.invalid/track',
  ])('rejects unsafe tracking URL %#', (trackingUrl) =>
    expect(() =>
      renderTemplate(base, { ...variables, trackingUrl }, 'https://example.invalid'),
    ).toThrow(),
  );
  it('rejects a missing variable, locale and external action link', () => {
    expect(() => renderTemplate(base, { orderNumber: 'x' }, 'https://example.invalid')).toThrow();
    expect(() => validateTemplate({ ...base, locale: 'fr' }, ['fa', 'en'])).toThrow();
    expect(() =>
      renderTemplate(
        {
          code: 'newsletter-confirm',
          locale: 'en',
          channel: 'EMAIL',
          subject: 'Confirm',
          body: '{{actionUrl}}',
        },
        { actionUrl: 'https://evil.invalid/en/newsletter/confirm' },
        'https://example.invalid',
      ),
    ).toThrow();
  });
  it('requires an actual confirmation/unsubscribe link placeholder', () =>
    expect(() =>
      validateTemplate(
        {
          code: 'newsletter-confirm',
          locale: 'en',
          channel: 'EMAIL',
          subject: 'Confirm',
          body: 'No action',
        },
        ['fa', 'en'],
      ),
    ).toThrow());
  it('keeps existing shipment payloads and adds ID-only newsletter jobs', () => {
    expect(
      decodeJobEnvelope(
        createJobEnvelope(
          JOB_NAMES.fulfilmentEmail,
          { shipmentId: randomUUID(), kind: 'SHIPPED' },
          'test',
        ),
      ).type,
    ).toBe(JOB_NAMES.fulfilmentEmail);
    expect(
      decodeJobEnvelope(
        createJobEnvelope(JOB_NAMES.newsletterEmail, { deliveryId: randomUUID() }, 'test'),
      ).type,
    ).toBe(JOB_NAMES.newsletterEmail);
    expect(() =>
      createJobEnvelope(
        JOB_NAMES.newsletterEmail,
        { deliveryId: randomUUID(), token: 'raw', email: 'x@example.invalid' },
        'test',
      ),
    ).toThrow();
  });
});
