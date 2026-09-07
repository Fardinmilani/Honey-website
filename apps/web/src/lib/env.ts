function requireUrl(name: string, value: string | undefined): URL {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must use http or https`);
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error(`${name} must be an origin only (scheme + host[+port], no path)`);
  }
  return url;
}

function parseBooleanFlag(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

const BLOCKED_INDEXING_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'example.com',
  'www.example.com',
  'example.org',
  'www.example.org',
  'example.net',
  'www.example.net',
  'test',
  'invalid',
]);

function assertProductionIndexableOrigin(origin: URL): void {
  if (origin.protocol !== 'https:') {
    throw new Error('WEB_INDEXING_ENABLED=true requires an HTTPS public site origin');
  }
  const host = origin.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./u.test(host)
  ) {
    throw new Error('WEB_INDEXING_ENABLED=true rejects loopback and private hosts');
  }
  if (BLOCKED_INDEXING_HOSTS.has(host) || host.endsWith('.example') || host.endsWith('.test')) {
    throw new Error('WEB_INDEXING_ENABLED=true rejects placeholder/test hosts');
  }
}

export type WebEnv = {
  readonly nodeEnv: 'development' | 'test' | 'production';
  /** Validated absolute site origin. Never derived from request Host headers. */
  readonly publicSiteUrl: URL;
  readonly internalApiUrl: URL;
  readonly sessionCookieName: string;
  readonly csrfCookieName: string;
  readonly csrfHeaderName: string;
  readonly apiTimeoutMs: number;
  /**
   * Explicit indexing switch. Defaults false (fail closed).
   * Production indexing requires this true AND a valid HTTPS public origin.
   */
  readonly indexingEnabled: boolean;
  /** Secret for allow-listed catalog cache revalidation. Server-only. */
  readonly revalidateSecret: string | undefined;
};

let cached: WebEnv | undefined;

/**
 * Single authoritative accessor for web runtime configuration, including the
 * canonical site origin used by metadata, sitemaps, robots, and JSON-LD.
 */
export function getWebEnv(): WebEnv {
  if (cached !== undefined) {
    return cached;
  }

  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  // Next production builds set NODE_ENV=production before runtime env is available.
  // Allow localhost defaults only during the build phase; live production still requires URLs.
  const allowBuildDefaults =
    nodeEnv !== 'production' || process.env['NEXT_PHASE'] === 'phase-production-build';

  const publicSiteUrl = requireUrl(
    'NEXT_PUBLIC_SITE_URL',
    process.env['NEXT_PUBLIC_SITE_URL'] ??
      process.env['PUBLIC_SITE_URL'] ??
      (allowBuildDefaults ? 'http://localhost:3000' : undefined),
  );
  const internalApiUrl = requireUrl(
    'INTERNAL_API_URL',
    process.env['INTERNAL_API_URL'] ?? (allowBuildDefaults ? 'http://localhost:4000' : undefined),
  );

  const indexingEnabled = parseBooleanFlag(
    'WEB_INDEXING_ENABLED',
    process.env['WEB_INDEXING_ENABLED'],
    false,
  );

  if (indexingEnabled) {
    assertProductionIndexableOrigin(publicSiteUrl);
  }

  const sessionCookieName =
    process.env['SESSION_COOKIE_NAME']?.trim() ||
    (nodeEnv === 'production' ? '__Host-session' : 'honey_session');
  const csrfCookieName =
    process.env['CSRF_COOKIE_NAME']?.trim() ||
    (nodeEnv === 'production' ? '__Host-csrf' : 'csrf_token');
  const csrfHeaderName = process.env['CSRF_HEADER_NAME']?.trim() || 'x-csrf-token';

  const timeoutRaw = process.env['WEB_API_TIMEOUT_MS'] ?? '5000';
  const apiTimeoutMs = Number.parseInt(timeoutRaw, 10);
  if (!Number.isFinite(apiTimeoutMs) || apiTimeoutMs < 100 || apiTimeoutMs > 30_000) {
    throw new Error('WEB_API_TIMEOUT_MS must be between 100 and 30000');
  }

  const revalidateSecret = process.env['WEB_REVALIDATE_SECRET']?.trim() || undefined;

  cached = {
    nodeEnv,
    publicSiteUrl,
    internalApiUrl,
    sessionCookieName,
    csrfCookieName,
    csrfHeaderName,
    apiTimeoutMs,
    indexingEnabled,
    revalidateSecret,
  };
  return cached;
}

/** Canonical site origin — never from request Host / X-Forwarded-Host. */
export function getSiteOrigin(): URL {
  return getWebEnv().publicSiteUrl;
}

/** Whether pages may be indexed. Fail closed unless explicitly enabled. */
export function isIndexingEnabled(): boolean {
  return getWebEnv().indexingEnabled;
}

/** Test-only: clear cached env between cases. */
export function resetWebEnvCache(): void {
  cached = undefined;
}
