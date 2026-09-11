import { NextResponse } from 'next/server';

import { getWebEnv } from '@/lib/env';
import { forwardSetCookieHeaders } from '@/lib/session-forward';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CURRENCY_RE = /^[A-Z]{3}$/u;
const COUPON_CODE_RE = /^[A-Za-z0-9_-]{1,64}$/u;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;

type CartWriteMethod = 'POST' | 'PATCH' | 'DELETE';

export type AddCartLineInput = Readonly<{
  variantId: string;
  quantity: number;
}>;

export type UpdateCartLineInput = Readonly<{
  quantity: number;
}>;

export type ApplyCouponInput = Readonly<{
  code: string;
}>;

type ProxyOptions = Readonly<{
  path: string;
  method: 'GET' | CartWriteMethod;
  body?: unknown;
  idempotencyKey?: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validString(value: unknown, maximumLength = 160): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength;
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

async function requestJson(request: Request): Promise<unknown | null> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) return null;
  try {
    const parsed: unknown = await request.json();
    return parsed;
  } catch {
    return null;
  }
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function positiveQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 10_000;
}

export async function parseAddCartLine(request: Request): Promise<AddCartLineInput | null> {
  const body = await requestJson(request);
  if (!isRecord(body) || !exactKeys(body, ['variantId', 'quantity'])) return null;
  const variantId = body['variantId'];
  const quantity = body['quantity'];
  if (!validString(variantId, 36) || !UUID_RE.test(variantId) || !positiveQuantity(quantity)) {
    return null;
  }
  return { variantId, quantity };
}

export function parseIdempotencyKey(request: Request): string | null {
  const key = request.headers.get('idempotency-key');
  return key !== null && IDEMPOTENCY_KEY_RE.test(key) ? key : null;
}

export async function parseUpdateCartLine(request: Request): Promise<UpdateCartLineInput | null> {
  const body = await requestJson(request);
  if (!isRecord(body) || !exactKeys(body, ['quantity'])) return null;
  const quantity = body['quantity'];
  return positiveQuantity(quantity) ? { quantity } : null;
}

export async function parseApplyCoupon(request: Request): Promise<ApplyCouponInput | null> {
  const body = await requestJson(request);
  if (!isRecord(body) || !exactKeys(body, ['code'])) return null;
  const code = body['code'];
  if (!validString(code, 64) || !COUPON_CODE_RE.test(code)) return null;
  return { code };
}

export function validLineId(value: string): boolean {
  return UUID_RE.test(value);
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

function safeCurrency(value: string | null): string | undefined {
  return value !== null && CURRENCY_RE.test(value) ? value : undefined;
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
  const title = validString(payload['title'], 120) ? payload['title'] : 'Request failed';
  const type = validString(payload['type'], 240) ? payload['type'] : 'about:blank';
  const code = validString(payload['code'], 80) ? payload['code'] : undefined;
  return code === undefined ? { type, title, status } : { type, title, status, code };
}

async function parseUpstreamJson(response: Response): Promise<unknown | null> {
  const text = await response.text();
  if (text === '') return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return null;
  }
}

function responseWithCookies(upstream: Response, response: NextResponse): NextResponse {
  return forwardSetCookieHeaders(upstream, response);
}

/**
 * Explicit cart-only BFF transport. It forwards only the three cookies the cart
 * API can consume and never accepts an arbitrary upstream path or request body.
 */
export async function proxyCartRequest(
  request: Request,
  options: ProxyOptions,
): Promise<NextResponse> {
  if (options.method !== 'GET') {
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
  if (options.idempotencyKey !== undefined) {
    headers.set('idempotency-key', options.idempotencyKey);
  }
  const cookies = selectedCookieHeader(request);
  if (cookies !== undefined) headers.set('cookie', cookies);
  const currency = safeCurrency(request.headers.get('x-currency'));
  if (currency !== undefined) headers.set('x-currency', currency);
  if (options.method !== 'GET') {
    const csrf = request.headers.get(env.csrfHeaderName);
    if (csrf !== null) headers.set(env.csrfHeaderName, csrf);
  }

  const init: RequestInit = {
    method: options.method,
    headers,
    cache: 'no-store',
  };
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
    init.body = JSON.stringify(options.body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.apiTimeoutMs);
  try {
    init.signal = controller.signal;
    const upstream = await fetch(url, init);
    const payload = await parseUpstreamJson(upstream);
    if (!upstream.ok) {
      return responseWithCookies(
        upstream,
        NextResponse.json(safeErrorBody(payload, upstream.status), {
          status: upstream.status,
          headers: { 'cache-control': 'no-store', 'content-type': 'application/problem+json' },
        }),
      );
    }
    if (payload === null) {
      return responseWithCookies(upstream, upstreamUnavailable());
    }
    return responseWithCookies(
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
