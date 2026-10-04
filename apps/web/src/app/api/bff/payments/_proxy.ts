import { NextResponse } from 'next/server';

import { getWebEnv } from '@/lib/env';
import { forwardSetCookieHeaders } from '@/lib/session-forward';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ORDER_NUMBER_RE = /^HNY-\d{4}-\d{6}$/u;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;

export type StartPaymentInput = Readonly<{ orderNumber: string }>;

type PaymentsProxyOptions = Readonly<{
  path: '/v1/payments' | `/v1/payments/${string}` | `/v1/payments/${string}/return`;
  method: 'GET' | 'POST';
  body?: StartPaymentInput;
  idempotencyKey?: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      type: 'about:blank',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_REQUEST',
    },
    {
      status: 400,
      headers: { 'cache-control': 'no-store', 'content-type': 'application/problem+json' },
    },
  );
}

function csrfRejected(): NextResponse {
  return NextResponse.json(
    {
      type: 'about:blank',
      title: 'CSRF validation failed',
      status: 403,
      code: 'CSRF_FAILED',
    },
    {
      status: 403,
      headers: { 'cache-control': 'no-store', 'content-type': 'application/problem+json' },
    },
  );
}

function upstreamUnavailable(): NextResponse {
  return NextResponse.json(
    {
      type: 'about:blank',
      title: 'Upstream unavailable',
      status: 502,
    },
    {
      status: 502,
      headers: { 'cache-control': 'no-store', 'content-type': 'application/problem+json' },
    },
  );
}

function parseCookies(header: string | null): ReadonlyMap<string, string> {
  if (header === null || header === '') return new Map();
  const cookies = new Map<string, string>();
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name) || /[\r\n]/u.test(value)) continue;
    if (!cookies.has(name)) cookies.set(name, value);
  }
  return cookies;
}

function cartCookieNames(): readonly string[] {
  const configured = process.env['CART_COOKIE_NAME']?.trim();
  return configured === undefined || configured === ''
    ? ['honey_cart', '__Host-cart']
    : [configured, 'honey_cart', '__Host-cart'];
}

function selectedCookieHeader(request: Request): string | undefined {
  const env = getWebEnv();
  const cookies = parseCookies(request.headers.get('cookie'));
  const names = new Set([env.sessionCookieName, env.csrfCookieName, ...cartCookieNames()]);
  const pairs: string[] = [];
  for (const name of names) {
    const value = cookies.get(name);
    if (value !== undefined) pairs.push(`${name}=${value}`);
  }
  return pairs.length > 0 ? pairs.join('; ') : undefined;
}

function isSafeLocale(value: string | null): value is 'fa' | 'en' {
  return value === 'fa' || value === 'en';
}

function requireCsrf(request: Request): NextResponse | null {
  const env = getWebEnv();
  const cookies = parseCookies(request.headers.get('cookie'));
  const cookie = cookies.get(env.csrfCookieName);
  const header = request.headers.get(env.csrfHeaderName);
  if (cookie === undefined || header === null || header === '' || header !== cookie) {
    return csrfRejected();
  }
  return null;
}

function safeErrorBody(
  payload: unknown,
  status: number,
): Readonly<Record<string, string | number>> {
  if (!isRecord(payload)) {
    return { type: 'about:blank', title: 'Request failed', status };
  }
  const title = typeof payload['title'] === 'string' ? payload['title'] : 'Request failed';
  const type = typeof payload['type'] === 'string' ? payload['type'] : 'about:blank';
  const code = typeof payload['code'] === 'string' ? payload['code'] : undefined;
  return code === undefined ? { type, title, status } : { type, title, status, code };
}

async function parseUpstreamJson(response: Response): Promise<unknown | null> {
  const body = await response.text();
  if (body === '') return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

export function parseIdempotencyKey(request: Request): string | null {
  const key = request.headers.get('idempotency-key');
  return key !== null && IDEMPOTENCY_KEY_RE.test(key) ? key : null;
}

export function validPaymentId(value: string): boolean {
  return UUID_RE.test(value);
}

export async function parseStartPayment(request: Request): Promise<StartPaymentInput | null> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) return null;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (!isRecord(body) || Object.keys(body).length !== 1) return null;
  const orderNumber = body['orderNumber'];
  if (typeof orderNumber !== 'string' || !ORDER_NUMBER_RE.test(orderNumber)) return null;
  return { orderNumber };
}

export async function proxyPaymentRequest(
  request: Request,
  options: PaymentsProxyOptions,
): Promise<NextResponse> {
  if (options.method === 'POST') {
    const csrfFailure = requireCsrf(request);
    if (csrfFailure !== null) return csrfFailure;
  }

  const env = getWebEnv();
  const url = new URL(options.path, env.internalApiUrl);
  const requestedLocale = request.headers.get('x-honey-locale');
  const locale = isSafeLocale(requestedLocale) ? requestedLocale : 'fa';
  const headers = new Headers({
    accept: 'application/json',
    'accept-language': locale,
    'x-request-id': crypto.randomUUID(),
  });
  const cookies = selectedCookieHeader(request);
  if (cookies !== undefined) headers.set('cookie', cookies);
  if (options.method === 'POST') {
    const csrf = request.headers.get(env.csrfHeaderName);
    if (csrf !== null) headers.set(env.csrfHeaderName, csrf);
  }
  if (options.idempotencyKey !== undefined) {
    headers.set('idempotency-key', options.idempotencyKey);
  }
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
  }

  const init: RequestInit = {
    method: options.method,
    headers,
    cache: 'no-store',
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.apiTimeoutMs);
  try {
    init.signal = controller.signal;
    const upstream = await fetch(url, init);
    const payload = await parseUpstreamJson(upstream);
    if (!upstream.ok) {
      return forwardSetCookieHeaders(
        upstream,
        NextResponse.json(safeErrorBody(payload, upstream.status), {
          status: upstream.status,
          headers: { 'cache-control': 'no-store', 'content-type': 'application/problem+json' },
        }),
      );
    }
    if (payload === null) {
      return forwardSetCookieHeaders(upstream, upstreamUnavailable());
    }
    return forwardSetCookieHeaders(
      upstream,
      NextResponse.json(payload, {
        status: upstream.status,
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
      }),
    );
  } catch {
    return upstreamUnavailable();
  } finally {
    clearTimeout(timeout);
  }
}

export { invalidRequest };
