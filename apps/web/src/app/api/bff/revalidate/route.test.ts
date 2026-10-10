import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetWebEnvCache } from '@/lib/env';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { revalidatePath, revalidateTag } from 'next/cache';

import { POST } from './route';

function request(body: unknown, secret = 'test-revalidation-secret'): Request {
  return new Request('http://localhost:3000/api/bff/revalidate', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('authenticated sitemap revalidation', () => {
  beforeEach(() => {
    process.env['WEB_REVALIDATE_SECRET'] = 'test-revalidation-secret';
    resetWebEnvCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env['WEB_REVALIDATE_SECRET'];
    resetWebEnvCache();
  });

  it.each(['fa', 'en'] as const)('revalidates only fixed %s sitemap paths', async (locale) => {
    const response = await POST(request({ scope: 'sitemap', locale }));
    expect(response.status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledTimes(5);
    expect(revalidatePath).toHaveBeenCalledWith(`/sitemaps/${locale}/static`);
    expect(revalidatePath).toHaveBeenCalledWith(`/sitemaps/${locale}/products`);
    expect(revalidatePath).toHaveBeenCalledWith(`/sitemaps/${locale}/categories`);
    expect(revalidatePath).toHaveBeenCalledWith(`/sitemaps/${locale}/collections`);
    expect(revalidatePath).toHaveBeenCalledWith('/sitemap.xml');
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(`locale:${locale}`, { expire: 0 });
  });

  it('rejects an invalid secret before touching caches', async () => {
    const response = await POST(request({ scope: 'sitemap', locale: 'fa' }, 'wrong-secret'));
    expect(response.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects arbitrary URLs and invalid locales', async () => {
    const arbitrary = await POST(
      request({ scope: 'sitemap', locale: 'fa', url: 'https://example.invalid/admin' }),
    );
    const invalidLocale = await POST(request({ scope: 'sitemap', locale: 'de' }));
    expect(arbitrary.status).toBe(400);
    expect(invalidLocale.status).toBe(400);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects extra fields for catalog cache requests as well', async () => {
    const response = await POST(
      request({
        scope: 'product',
        id: '018f0000-0000-7000-8000-000000000001',
        url: 'https://example.invalid',
      }),
    );
    expect(response.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('is safe to repeat the same fixed invalidation', async () => {
    expect((await POST(request({ scope: 'sitemap', locale: 'en' }))).status).toBe(200);
    expect((await POST(request({ scope: 'sitemap', locale: 'en' }))).status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledTimes(10);
  });
});
