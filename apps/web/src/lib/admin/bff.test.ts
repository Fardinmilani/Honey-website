import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../env', () => ({
  getWebEnv: () => ({
    publicSiteUrl: new URL('http://localhost:3000'),
    sessionCookieName: 'honey_session',
    csrfCookieName: 'csrf_token',
    csrfHeaderName: 'x-csrf-token',
  }),
}));
vi.mock('../api-client/server', () => ({
  apiRequest: vi.fn(),
  ApiClientError: class extends Error {},
}));
import { apiRequest } from '../api-client/server';
import { adminRoute } from './bff';
const upstream = vi.mocked(apiRequest);
const id = '018f0000-0000-7000-8000-000000000801';
const token = 'c'.repeat(32);
const context = { params: Promise.resolve({ id }) };
function request(body: unknown, extra: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/bff/admin/orders', {
    method: 'POST',
    headers: {
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
      cookie: `honey_session=session-test; csrf_token=${token}; unrelated=discard`,
      'x-csrf-token': token,
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
afterEach(() => vi.resetAllMocks());
describe('explicit admin browser transport', () => {
  it('rejects cross-origin writes, missing or mismatched CSRF before any upstream call', async () => {
    const route = adminRoute({ method: 'POST', path: '/v1/admin/orders', bodyKeys: ['body'] });
    for (const headers of [
      { origin: 'http://attacker.invalid' },
      { 'x-csrf-token': '' },
      { cookie: 'honey_session=session-test' },
    ])
      expect((await route(request({ body: 'note' }, headers), context)).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects unknown money fields, nested prototype keys, unsupported queries and invalid identifiers', async () => {
    const route = adminRoute({ method: 'POST', path: '/v1/admin/orders', bodyKeys: ['body'] });
    expect((await route(request({ body: 'note', grandTotalMinor: '1' }), context)).status).toBe(
      422,
    );
    const nested = JSON.parse('{"body":{"__proto__":{"polluted":true}}}');
    expect((await route(request(nested), context)).status).toBe(422);
    const read = adminRoute({
      method: 'GET',
      path: '/v1/admin/orders',
      query: ['cursor'],
      params: ['id'],
    });
    expect(
      (
        await read(
          new Request('http://localhost:3000/api/bff/admin/orders?target=http://attacker.invalid'),
          context,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await read(
          new Request('http://localhost:3000/api/bff/admin/orders?cursor=a&cursor=b'),
          context,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await read(new Request('http://localhost:3000/api/bff/admin/orders'), {
          params: Promise.resolve({ id: '../other' }),
        })
      ).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('forwards only selected cookies and fixed paths, preserves upstream status and private caching', async () => {
    upstream.mockResolvedValue({
      status: 200,
      payload: { id },
      cookies: ['honey_session=new-session; HttpOnly; SameSite=Strict'],
    });
    const route = adminRoute({
      method: 'POST',
      path: (params) => `/v1/admin/orders/${params['id']}/notes`,
      params: ['id'],
      bodyKeys: ['body'],
    });
    const response = await route(request({ body: 'note' }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(upstream).toHaveBeenCalledWith({
      path: `/v1/admin/orders/${id}/notes`,
      method: 'POST',
      searchParams: {},
      cache: 'no-store',
      cookieHeader: `honey_session=session-test; csrf_token=${token}`,
      csrfToken: token,
      body: { body: 'note' },
    });
  });
  it('requires a stable idempotency key on financial writes', async () => {
    upstream.mockResolvedValue({ status: 200, payload: { id }, cookies: [] });
    const route = adminRoute({
      method: 'POST',
      path: '/v1/admin/payments/refunds',
      bodyKeys: ['amountMinor', 'reason'],
      idempotent: true,
    });
    expect((await route(request({ amountMinor: null, reason: 'reason' }), context)).status).toBe(
      422,
    );
    const key = 'phase17-refund-stable-key';
    expect(
      (
        await route(
          request({ amountMinor: null, reason: 'reason' }, { 'idempotency-key': key }),
          context,
        )
      ).status,
    ).toBe(200);
    expect(upstream).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: key }));
  });
  it('returns safe dependency failures without exposing upstream exceptions', async () => {
    upstream.mockRejectedValue(new Error('private-internal-marker'));
    const route = adminRoute({ method: 'GET', path: '/v1/admin/orders' });
    const response = await route(
      new Request('http://localhost:3000/api/bff/admin/orders'),
      context,
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private-internal-marker');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
