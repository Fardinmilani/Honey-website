import { z } from 'zod';

const NODE_ENV_VALUES = ['development', 'test', 'production'] as const;
const LOG_LEVEL_VALUES = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const positiveInteger = z.coerce.number().int().positive();
const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(NODE_ENV_VALUES),
    API_HOST: z.string().min(1),
    API_PORT: positiveInteger.max(65_535),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
        message: 'must use the PostgreSQL protocol',
      }),
    LOG_LEVEL: z.enum(LOG_LEVEL_VALUES),
    TRUST_PROXY: z.string().min(1),
    API_ALLOWED_ORIGINS: z.string(),
    API_BODY_LIMIT_BYTES: positiveInteger.max(1_048_576),
    API_SHUTDOWN_GRACE_MS: positiveInteger.max(120_000),
    API_READINESS_TIMEOUT_MS: positiveInteger.max(30_000),
    API_RATE_LIMIT_MAX: positiveInteger.max(100_000),
    API_RATE_LIMIT_WINDOW_MS: positiveInteger.max(3_600_000),
    CSRF_COOKIE_NAME: z.string().regex(/^(__Host-)?[A-Za-z0-9_-]{1,64}$/u),
    CSRF_HEADER_NAME: z.string().regex(/^x-[a-z0-9-]{1,62}$/u),
    CSRF_COOKIE_SECURE: booleanString,
  })
  .passthrough();

export type ApiConfig = Readonly<{
  nodeEnv: (typeof NODE_ENV_VALUES)[number];
  host: string;
  port: number;
  databaseUrl: string;
  logLevel: (typeof LOG_LEVEL_VALUES)[number];
  trustProxy: false | string[];
  allowedOrigins: readonly string[];
  bodyLimitBytes: number;
  shutdownGraceMs: number;
  readinessTimeoutMs: number;
  rateLimit: Readonly<{ max: number; windowMs: number }>;
  csrf: Readonly<{ cookieName: string; headerName: string; secureCookie: boolean }>;
}>;

function defaultsFor(environment: string | undefined): Readonly<Record<string, string>> {
  if (environment === 'production') return {};
  return {
    NODE_ENV: environment ?? 'development',
    API_HOST: '127.0.0.1',
    API_PORT: '4000',
    LOG_LEVEL: 'info',
    TRUST_PROXY: 'false',
    API_ALLOWED_ORIGINS: 'http://localhost:3000',
    API_BODY_LIMIT_BYTES: '1048576',
    API_SHUTDOWN_GRACE_MS: '10000',
    API_READINESS_TIMEOUT_MS: '2000',
    API_RATE_LIMIT_MAX: '300',
    API_RATE_LIMIT_WINDOW_MS: '60000',
    CSRF_COOKIE_NAME: 'csrf_token',
    CSRF_HEADER_NAME: 'x-csrf-token',
    CSRF_COOKIE_SECURE: 'false',
  };
}

function parseTrustProxy(value: string): false | string[] {
  if (value === 'false') return false;
  if (value === 'true' || value === '*')
    throw new Error('TRUST_PROXY must name explicit trusted proxies.');
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) throw new Error('TRUST_PROXY must be false or an explicit proxy list.');
  return entries;
}

function parseOrigins(value: string): readonly string[] {
  const origins = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const origin of origins) {
    if (origin === '*') throw new Error('API_ALLOWED_ORIGINS may not contain a wildcard.');
    const parsed = new URL(origin);
    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('API_ALLOWED_ORIGINS entries must be exact HTTP origins.');
    }
  }
  return origins;
}

export function loadApiConfig(environment: NodeJS.ProcessEnv): ApiConfig {
  const parsed = schema.safeParse({ ...defaultsFor(environment['NODE_ENV']), ...environment });
  if (!parsed.success) {
    const keys = [
      ...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'environment'))),
    ];
    throw new Error(`Invalid API environment configuration: ${keys.join(', ')}.`);
  }

  const trustProxy = parseTrustProxy(parsed.data.TRUST_PROXY);
  const allowedOrigins = parseOrigins(parsed.data.API_ALLOWED_ORIGINS);
  if (parsed.data.NODE_ENV === 'production') {
    if (
      allowedOrigins.length === 0 ||
      allowedOrigins.some((origin) => !origin.startsWith('https://'))
    ) {
      throw new Error('Production API_ALLOWED_ORIGINS must contain explicit HTTPS origins.');
    }
    if (!parsed.data.CSRF_COOKIE_SECURE || !parsed.data.CSRF_COOKIE_NAME.startsWith('__Host-')) {
      throw new Error('Production CSRF cookie configuration must be secure and host-bound.');
    }
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    host: parsed.data.API_HOST,
    port: parsed.data.API_PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    logLevel: parsed.data.LOG_LEVEL,
    trustProxy,
    allowedOrigins,
    bodyLimitBytes: parsed.data.API_BODY_LIMIT_BYTES,
    shutdownGraceMs: parsed.data.API_SHUTDOWN_GRACE_MS,
    readinessTimeoutMs: parsed.data.API_READINESS_TIMEOUT_MS,
    rateLimit: {
      max: parsed.data.API_RATE_LIMIT_MAX,
      windowMs: parsed.data.API_RATE_LIMIT_WINDOW_MS,
    },
    csrf: {
      cookieName: parsed.data.CSRF_COOKIE_NAME,
      headerName: parsed.data.CSRF_HEADER_NAME,
      secureCookie: parsed.data.CSRF_COOKIE_SECURE,
    },
  };
}
