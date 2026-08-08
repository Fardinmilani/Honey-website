import 'server-only';

import type { paths, ProblemDetails } from '@honey/contracts';

import { getWebEnv } from '../env';
import { readCsrfCookieValue, readSessionCookieValue } from '../session';

export type ApiPresentationError = {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  readonly type?: string;
  readonly code?: string;
};

export class ApiClientError extends Error {
  readonly presentation: ApiPresentationError;

  constructor(presentation: ApiPresentationError) {
    super(presentation.title);
    this.name = 'ApiClientError';
    this.presentation = presentation;
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type AllowlistedPath = keyof paths & string;

export type ApiRequestOptions = {
  readonly method?: HttpMethod;
  readonly path: AllowlistedPath | (string & {});
  readonly searchParams?: Record<string, string | number | boolean | undefined>;
  readonly body?: unknown;
  readonly locale?: string;
  readonly requestId?: string;
  /** Forward session cookie for authenticated calls (server-only). */
  readonly withSession?: boolean;
  /** Forward CSRF header for unsafe cookie-authenticated writes. */
  readonly withCsrf?: boolean;
  readonly cache?: RequestCache;
  readonly next?: { revalidate?: number | false; tags?: string[] };
};

const ALLOWLIST_PREFIXES = ['/readyz', '/livez', '/v1/'] as const;

function assertAllowlisted(path: string): void {
  if (path.includes('://') || path.startsWith('//')) {
    throw new Error('Absolute upstream URLs are not allowed');
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const allowed = ALLOWLIST_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(prefix),
  );
  if (!allowed) {
    throw new Error(`API path is not allow-listed: ${normalized}`);
  }
}

function buildUrl(path: string, searchParams?: ApiRequestOptions['searchParams']): URL {
  const { internalApiUrl } = getWebEnv();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(normalized, internalApiUrl);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    'title' in value &&
    typeof (value as { title: unknown }).title === 'string'
  );
}

function toPresentation(status: number, payload: unknown): ApiPresentationError {
  if (isProblemDetails(payload)) {
    return {
      status,
      title: payload.title,
      ...(payload.detail !== undefined ? { detail: payload.detail } : {}),
      ...(payload.type !== undefined ? { type: payload.type } : {}),
      ...('code' in payload && typeof payload.code === 'string' ? { code: payload.code } : {}),
    };
  }
  return {
    status,
    title: status >= 500 ? 'Something went wrong' : 'Request failed',
  };
}

/**
 * Server-only HTTP client for the versioned Honey API.
 * Does not expose a generic browser proxy.
 */
export async function apiFetch<T>(options: ApiRequestOptions): Promise<T> {
  assertAllowlisted(options.path);
  const env = getWebEnv();
  const method = options.method ?? 'GET';
  const url = buildUrl(options.path, options.searchParams);
  const headers = new Headers({
    Accept: 'application/json',
  });

  const requestId = options.requestId ?? crypto.randomUUID();
  headers.set('x-request-id', requestId);

  if (options.locale) {
    headers.set('accept-language', options.locale);
  }

  if (options.withSession) {
    const session = await readSessionCookieValue();
    if (session) {
      headers.set('cookie', `${env.sessionCookieName}=${session}`);
    }
  }

  if (options.withCsrf && method !== 'GET') {
    const csrf = await readCsrfCookieValue();
    if (csrf) {
      headers.set(env.csrfHeaderName, csrf);
      const existing = headers.get('cookie');
      const csrfPair = `${env.csrfCookieName}=${csrf}`;
      headers.set('cookie', existing ? `${existing}; ${csrfPair}` : csrfPair);
    }
  }

  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(options.body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.apiTimeoutMs);

  try {
    const init: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } } = {
      method,
      headers,
      signal: controller.signal,
    };
    if (body !== undefined) {
      init.body = body;
    }
    if (options.cache !== undefined) {
      init.cache = options.cache;
    }
    if (options.next !== undefined) {
      init.next = options.next;
    }

    const response = await fetch(url, init);

    const text = await response.text();
    let payload: unknown = undefined;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = undefined;
      }
    }

    if (!response.ok) {
      throw new ApiClientError(toPresentation(response.status, payload));
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError({
      status: 502,
      title: 'Upstream unavailable',
    });
  } finally {
    clearTimeout(timeout);
  }
}
