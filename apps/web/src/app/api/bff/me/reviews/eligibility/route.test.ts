import { beforeEach, expect, it, vi } from 'vitest';
const upstream = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin/bff', () => ({ adminRoute: () => upstream }));
import { GET } from './route';
beforeEach(() => vi.resetAllMocks());
it('returns a neutral private result for an unauthenticated storefront without granting eligibility', async () => {
  upstream.mockResolvedValue(new Response('{}', { status: 401 }));
  const response = await GET(new Request('http://localhost/api/bff/me/reviews/eligibility'), {
    params: Promise.resolve({}),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ eligible: false });
});
it('preserves permission denials and the protected API result', async () => {
  for (const status of [200, 403, 422]) {
    const original = new Response('{"eligible":true}', { status });
    upstream.mockResolvedValue(original);
    expect(
      await GET(new Request('http://localhost/api/bff/me/reviews/eligibility'), {
        params: Promise.resolve({}),
      }),
    ).toBe(original);
  }
});
