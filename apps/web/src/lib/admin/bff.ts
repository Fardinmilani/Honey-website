import 'server-only';
import { NextResponse } from 'next/server';
import { apiRequest, ApiClientError } from '../api-client/server';
import { getWebEnv } from '../env';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type AdminRouteContext = { params: Promise<Record<string, string>> };
export type AdminRouteOptions = Readonly<{
  method: Method;
  path: string | ((params: Readonly<Record<string, string>>) => string);
  params?: readonly string[];
  query?: readonly string[];
  bodyKeys?: readonly string[];
  auth?: 'login' | 'totp';
  idempotent?: boolean;
}>;
function problem(status: number, code: string): NextResponse {
  return NextResponse.json(
    { type: 'about:blank', title: 'Request failed', status, code },
    {
      status,
      headers: { 'cache-control': 'private, no-store', 'content-type': 'application/problem+json' },
    },
  );
}
function cookies(request: Request): ReadonlyMap<string, string> {
  const pairs = new Map<string, string>();
  for (const pair of (request.headers.get('cookie') ?? '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    pairs.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  return pairs;
}
function validJson(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 20000;
  if (Array.isArray(value))
    return value.length <= 100 && value.every((item) => validJson(item, depth + 1));
  if (typeof value !== 'object') return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 100 &&
    entries.every(
      ([key, item]) =>
        key !== '__proto__' &&
        key !== 'constructor' &&
        key !== 'prototype' &&
        validJson(item, depth + 1),
    )
  );
}

/** Used only by concrete, method-specific route files with fixed upstream paths. */
export function adminRoute(options: AdminRouteOptions) {
  return async (request: Request, context: AdminRouteContext): Promise<NextResponse> => {
    const env = getWebEnv();
    const unsafe = options.method !== 'GET';
    if (unsafe && request.headers.get('origin') !== env.publicSiteUrl.origin)
      return problem(403, 'CSRF_TOKEN_INVALID');
    const incoming = cookies(request);
    const csrf = incoming.get(env.csrfCookieName);
    if (
      unsafe &&
      (options.auth === undefined || incoming.has(env.sessionCookieName)) &&
      (csrf === undefined ||
        csrf !== request.headers.get(env.csrfHeaderName) ||
        !/^[A-Za-z0-9_-]{16,256}$/u.test(csrf))
    )
      return problem(403, 'CSRF_TOKEN_INVALID');
    const selected = [
      env.sessionCookieName,
      env.csrfCookieName,
      'honey_staff_challenge',
      '__Host-staff-challenge',
    ];
    const cookiePairs: string[] = [];
    for (const name of selected) {
      const value = incoming.get(name);
      if (value === undefined) continue;
      if (!/^[A-Za-z0-9._-]{1,512}$/u.test(value)) return problem(400, 'INVALID_REQUEST');
      cookiePairs.push(`${name}=${value}`);
    }
    const params = await context.params;
    for (const key of options.params ?? []) {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          params[key] ?? '',
        )
      )
        return problem(400, 'ADMIN_IDENTIFIER_INVALID');
    }
    const url = new URL(request.url);
    const searchParams: Record<string, string> = {};
    for (const [key, value] of url.searchParams) {
      if (
        !(options.query ?? []).includes(key) ||
        Object.hasOwn(searchParams, key) ||
        value.length > 256
      )
        return problem(400, 'INVALID_REQUEST');
      searchParams[key] = value;
    }
    let body: unknown;
    if (unsafe && options.method !== 'DELETE') {
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        return problem(400, 'INVALID_REQUEST');
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 1_048_576)
        return problem(413, 'INVALID_REQUEST');
      try {
        body = JSON.parse(raw);
      } catch {
        return problem(400, 'INVALID_REQUEST');
      }
      if (
        !validJson(body) ||
        body === null ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        !Object.keys(body).every((key) => (options.bodyKeys ?? []).includes(key))
      )
        return problem(422, 'VALIDATION_FAILED');
    }
    const idempotencyKey = request.headers.get('idempotency-key') ?? undefined;
    if (
      options.idempotent === true &&
      (idempotencyKey === undefined ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u.test(idempotencyKey))
    )
      return problem(422, 'IDEMPOTENCY_KEY_REQUIRED');
    try {
      const upstream = await apiRequest({
        path: typeof options.path === 'string' ? options.path : options.path(params),
        method: options.method,
        searchParams,
        cache: 'no-store',
        cookieHeader: cookiePairs.join('; '),
        ...(body === undefined ? {} : { body }),
        ...(unsafe && csrf !== undefined && csrf === request.headers.get(env.csrfHeaderName)
          ? { csrfToken: csrf }
          : {}),
        ...(options.idempotent !== true || idempotencyKey === undefined ? {} : { idempotencyKey }),
      });
      const response =
        upstream.status === 204
          ? new NextResponse(null, { status: 204 })
          : NextResponse.json(upstream.payload, { status: upstream.status });
      response.headers.set('Cache-Control', 'private, no-store');
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
      for (const cookie of upstream.cookies) response.headers.append('set-cookie', cookie);
      return response;
    } catch (error) {
      if (error instanceof ApiClientError)
        return NextResponse.json(
          { type: 'about:blank', ...error.presentation },
          {
            status: error.presentation.status,
            headers: {
              'cache-control': 'private, no-store',
              'content-type': 'application/problem+json',
            },
          },
        );
      return problem(502, 'UPSTREAM_UNAVAILABLE');
    }
  };
}
