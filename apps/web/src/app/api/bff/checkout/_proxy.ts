import { NextResponse } from 'next/server';

import { getWebEnv } from '@/lib/env';
import { forwardSetCookieHeaders } from '@/lib/session-forward';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ORDER_NUMBER_RE = /^HNY-\d{4}-\d{6}$/u;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;
const COUNTRY_RE = /^[A-Z]{2}$/u;

export type CheckoutAddressInput = Readonly<{
  fullName: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  postalCode: string;
  line1: string;
  line2?: string;
}>;

export type StartCheckoutInput = Readonly<{
  email: string;
  phone?: string;
  shippingAddress: CheckoutAddressInput;
  billingAddress?: CheckoutAddressInput;
  sameAsShipping: boolean;
}>;

type CheckoutProxyOptions = Readonly<{
  path:
    | '/v1/checkout'
    | `/v1/checkout/${string}`
    | `/v1/checkout/${string}/confirm`
    | '/v1/orders'
    | `/v1/orders/${string}`;
  method: 'GET' | 'POST';
  body?: StartCheckoutInput;
  idempotencyKey?: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximumLength;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
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
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

function parseAddress(value: unknown): CheckoutAddressInput | null {
  if (!isRecord(value)) return null;
  if (
    !exactKeys(value, [
      'fullName',
      'phone',
      'country',
      'province',
      'city',
      'postalCode',
      'line1',
      'line2',
    ])
  ) {
    return null;
  }

  const fullName = value['fullName'];
  const phone = value['phone'];
  const country = value['country'];
  const province = value['province'];
  const city = value['city'];
  const postalCode = value['postalCode'];
  const line1 = value['line1'];
  const line2 = value['line2'];
  if (
    !isNonEmptyString(fullName, 160) ||
    !isNonEmptyString(phone, 40) ||
    !isNonEmptyString(country, 2) ||
    !COUNTRY_RE.test(country) ||
    !isNonEmptyString(province, 120) ||
    !isNonEmptyString(city, 120) ||
    !isNonEmptyString(postalCode, 32) ||
    !isNonEmptyString(line1, 240) ||
    (line2 !== undefined && !isNonEmptyString(line2, 240))
  ) {
    return null;
  }
  return line2 === undefined
    ? { fullName, phone, country, province, city, postalCode, line1 }
    : { fullName, phone, country, province, city, postalCode, line1, line2 };
}

function validEmail(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)
  );
}

/** Parses only the server-supported, client-safe checkout-start fields. */
export async function parseStartCheckout(request: Request): Promise<StartCheckoutInput | null> {
  const body = await requestJson(request);
  if (!isRecord(body)) return null;
  if (
    !exactKeys(body, ['email', 'phone', 'shippingAddress', 'billingAddress', 'sameAsShipping'])
  ) {
    return null;
  }

  const email = body['email'];
  const phone = body['phone'];
  const shippingAddress = parseAddress(body['shippingAddress']);
  const billingAddressRaw = body['billingAddress'];
  const sameAsShipping = body['sameAsShipping'];
  const billingAddress =
    billingAddressRaw === undefined ? undefined : parseAddress(billingAddressRaw);

  if (
    !validEmail(email) ||
    (phone !== undefined && !isNonEmptyString(phone, 40)) ||
    shippingAddress === null ||
    typeof sameAsShipping !== 'boolean' ||
    (billingAddressRaw !== undefined && billingAddress === null) ||
    (sameAsShipping === false && billingAddress === undefined)
  ) {
    return null;
  }

  const normalizedEmail = email.trim();
  const normalizedPhone = phone?.trim();
  return normalizedPhone === undefined
    ? {
        email: normalizedEmail,
        shippingAddress,
        ...(billingAddress === undefined ? {} : { billingAddress }),
        sameAsShipping,
      }
    : {
        email: normalizedEmail,
        phone: normalizedPhone,
        shippingAddress,
        ...(billingAddress === undefined ? {} : { billingAddress }),
        sameAsShipping,
      };
}

export function parseIdempotencyKey(request: Request): string | null {
  const key = request.headers.get('idempotency-key');
  return key !== null && IDEMPOTENCY_KEY_RE.test(key) ? key : null;
}

export function validCheckoutId(value: string): boolean {
  return UUID_RE.test(value);
}

export function validOrderNumber(value: string): boolean {
  return ORDER_NUMBER_RE.test(value);
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
  const title = isNonEmptyString(payload['title'], 120) ? payload['title'] : 'Request failed';
  const type = isNonEmptyString(payload['type'], 240) ? payload['type'] : 'about:blank';
  const code = isNonEmptyString(payload['code'], 80) ? payload['code'] : undefined;
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

function responseWithCookies(upstream: Response, response: NextResponse): NextResponse {
  return forwardSetCookieHeaders(upstream, response);
}

/**
 * Explicit checkout/order BFF transport.  Each route supplies a fixed API
 * path and a parser has already reduced the input to permitted customer data.
 */
export async function proxyCheckoutRequest(
  request: Request,
  options: CheckoutProxyOptions,
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
