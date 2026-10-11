export type SecurityHeader = {
  readonly key: string;
  readonly value: string;
};

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "form-action 'self'",
].join('; ');

const HSTS_VALUE = 'max-age=31536000; includeSubDomains';

function configuredMediaOrigin(
  value: string | undefined,
  name: string,
  httpsSite: boolean,
): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    (httpsSite && url.protocol !== 'https:')
  ) {
    throw new Error(`${name} is not an allowed media origin`);
  }
  if (name === 'S3_BROWSER_ENDPOINT' && url.pathname !== '/')
    throw new Error(`${name} must be an origin`);
  return url.origin;
}

/** Human-approved Phase 17 policy, applied only to localized admin pages. */
export function buildAdminContentSecurityPolicy(
  nonce: string,
  env: Record<string, string | undefined> = process.env,
): string {
  if (!/^[A-Za-z0-9+/=_-]{22,128}$/u.test(nonce)) throw new Error('Invalid CSP nonce');
  const { upload, media } = adminMediaOrigins(env);
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `img-src 'self' data: blob:${media === undefined ? '' : ` ${media}`}`,
    `media-src 'self'${media === undefined ? '' : ` ${media}`}`,
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}'`,
    `connect-src 'self'${upload === undefined ? '' : ` ${upload}`}`,
    "form-action 'self'",
  ].join('; ');
}
export function adminMediaOrigins(
  env: Record<string, string | undefined> = process.env,
): Readonly<{ upload: string | undefined; media: string | undefined }> {
  const httpsSite = shouldEmitHsts(env);
  const upload = configuredMediaOrigin(
    env['S3_BROWSER_ENDPOINT'],
    'S3_BROWSER_ENDPOINT',
    httpsSite,
  );
  const media = configuredMediaOrigin(
    env['PUBLIC_MEDIA_BASE_URL'] ?? env['NEXT_PUBLIC_MEDIA_BASE_URL'],
    'PUBLIC_MEDIA_BASE_URL',
    httpsSite,
  );
  return { upload, media };
}

/**
 * HSTS is emitted only when the configured public site origin is HTTPS.
 * `NODE_ENV=production` alone is not sufficient — local HTTP Docker and other
 * non-TLS runtimes must not advertise Strict-Transport-Security.
 *
 * Reads `NEXT_PUBLIC_SITE_URL`, then `PUBLIC_SITE_URL`.
 */
export function shouldEmitHsts(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env['NEXT_PUBLIC_SITE_URL'] ?? env['PUBLIC_SITE_URL'];
  if (raw === undefined || raw.trim() === '') {
    return false;
  }
  try {
    return new URL(raw).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Baseline web security headers. CSP and other headers are always present;
 * HSTS is conditional on {@link shouldEmitHsts}.
 */
export function buildSecurityHeaders(
  env: Record<string, string | undefined> = process.env,
): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
    { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  ];

  if (shouldEmitHsts(env)) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: HSTS_VALUE,
    });
  }

  return headers;
}
