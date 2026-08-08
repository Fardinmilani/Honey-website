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
  return url;
}

export type WebEnv = {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly publicSiteUrl: URL;
  readonly internalApiUrl: URL;
  readonly sessionCookieName: string;
  readonly csrfCookieName: string;
  readonly csrfHeaderName: string;
  readonly apiTimeoutMs: number;
};

let cached: WebEnv | undefined;

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

  cached = {
    nodeEnv,
    publicSiteUrl,
    internalApiUrl,
    sessionCookieName,
    csrfCookieName,
    csrfHeaderName,
    apiTimeoutMs,
  };
  return cached;
}

/** Test-only: clear cached env between cases. */
export function resetWebEnvCache(): void {
  cached = undefined;
}
