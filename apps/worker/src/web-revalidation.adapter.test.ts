import { describe, expect, it } from 'vitest';

import { FixedWebRevalidationAdapter } from './web-revalidation.adapter.js';

describe('fixed worker/web revalidation boundary', () => {
  it('uses only the configured origin, fixed endpoint, bearer secret, and FA/EN locale', async () => {
    const requests: { url: string; body: unknown; auth: string | null }[] = [];
    const request: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      requests.push({
        url,
        body: JSON.parse(String(init?.body)),
        auth: headers.get('authorization'),
      });
      return new Response('{}', { status: 200 });
    };
    const adapter = new FixedWebRevalidationAdapter(
      'https://shop.example.test',
      'safe-local-test-secret',
      request,
    );
    await adapter.revalidateSitemap({ locale: 'fa', correlationId: 'test-1' });
    await adapter.revalidateSitemap({ locale: 'en', correlationId: 'test-2' });
    expect(requests.map((entry) => entry.url)).toEqual([
      'https://shop.example.test/api/bff/revalidate',
      'https://shop.example.test/api/bff/revalidate',
    ]);
    expect(requests.map((entry) => entry.body)).toEqual([
      { scope: 'sitemap', locale: 'fa' },
      { scope: 'sitemap', locale: 'en' },
    ]);
    expect(requests.map((entry) => entry.auth)).toEqual([
      'Bearer safe-local-test-secret',
      'Bearer safe-local-test-secret',
    ]);
  });

  it('cannot accept an arbitrary destination and rejects failed authentication', async () => {
    expect(
      () => new FixedWebRevalidationAdapter('https://shop.example.test/path', 'secret'),
    ).toThrowError();
    const request: typeof fetch = async () => new Response('{}', { status: 401 });
    const adapter = new FixedWebRevalidationAdapter(
      'https://shop.example.test',
      'wrong-secret',
      request,
    );
    await expect(
      adapter.revalidateSitemap({ locale: 'fa', correlationId: 'test' }),
    ).rejects.toThrow('WEB_REVALIDATION_AUTH_REJECTED');
  });
});
