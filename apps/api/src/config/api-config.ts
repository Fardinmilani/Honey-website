import { z } from 'zod';

import type { IdentityConfig } from '@honey/backend';

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
    REDIS_URL: z
      .string()
      .url()
      .refine((value) => value.startsWith('redis://') || value.startsWith('rediss://'), {
        message: 'must use the Redis protocol',
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
    SESSION_COOKIE_NAME: z.string().regex(/^(__Host-)?[A-Za-z0-9_-]{1,64}$/u),
    SESSION_COOKIE_SECURE: booleanString,
    PASSWORD_ARGON2_MEMORY_KIB: positiveInteger,
    PASSWORD_ARGON2_TIME_COST: positiveInteger,
    PASSWORD_ARGON2_PARALLELISM: z.coerce.number().int(),
    PASSWORD_MIN_LENGTH: positiveInteger,
    PASSWORD_MAX_LENGTH: positiveInteger,
    CUSTOMER_SESSION_IDLE_SECONDS: positiveInteger,
    CUSTOMER_SESSION_ABSOLUTE_SECONDS: positiveInteger,
    STAFF_SESSION_IDLE_SECONDS: positiveInteger,
    STAFF_SESSION_ABSOLUTE_SECONDS: positiveInteger,
    SESSION_TOUCH_INTERVAL_SECONDS: positiveInteger,
    EMAIL_VERIFICATION_TTL_SECONDS: positiveInteger,
    PASSWORD_RESET_TTL_SECONDS: positiveInteger,
    PREAUTH_CHALLENGE_TTL_SECONDS: positiveInteger,
    TOTP_ISSUER: z.string().min(1).max(64),
    TOTP_ENCRYPTION_KEY_BASE64: z.string().min(1),
    TOTP_DRIFT_SECONDS: z.coerce.number().int().min(0).max(30),
    AUTH_LOCKOUT_WINDOW_SECONDS: positiveInteger,
    AUTH_LOCKOUT_MAX_FAILURES: positiveInteger,
    AUTH_LOCKOUT_BASE_SECONDS: positiveInteger,
    AUTH_LOCKOUT_MAX_SECONDS: positiveInteger,
    PWNED_PASSWORDS_ENDPOINT: z.string().url(),
    PWNED_PASSWORDS_TIMEOUT_MS: positiveInteger.max(10_000),
    IDENTITY_SMTP_HOST: z.string().min(1),
    IDENTITY_SMTP_PORT: positiveInteger.max(65_535),
    IDENTITY_SMTP_SECURE: booleanString,
    IDENTITY_EMAIL_FROM: z.string().email(),
    IDENTITY_SMTP_TIMEOUT_MS: positiveInteger.max(30_000),
  })
  .passthrough();

export type ApiConfig = Readonly<{
  nodeEnv: (typeof NODE_ENV_VALUES)[number];
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  logLevel: (typeof LOG_LEVEL_VALUES)[number];
  trustProxy: false | string[];
  allowedOrigins: readonly string[];
  bodyLimitBytes: number;
  shutdownGraceMs: number;
  readinessTimeoutMs: number;
  rateLimit: Readonly<{ max: number; windowMs: number }>;
  csrf: Readonly<{ cookieName: string; headerName: string; secureCookie: boolean }>;
  sessionCookie: Readonly<{ name: string; secure: boolean }>;
  identity: Readonly<{
    config: IdentityConfig;
    totpEncryptionKey: string;
    breachedPasswordEndpoint: string;
    breachedPasswordTimeoutMs: number;
    smtp: Readonly<{
      host: string;
      port: number;
      secure: boolean;
      from: string;
      connectionTimeoutMs: number;
    }>;
  }>;
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
    REDIS_URL: 'redis://localhost:6379',
    SESSION_COOKIE_NAME: 'honey_session',
    SESSION_COOKIE_SECURE: 'false',
    PASSWORD_ARGON2_MEMORY_KIB: '65536',
    PASSWORD_ARGON2_TIME_COST: '3',
    PASSWORD_ARGON2_PARALLELISM: '1',
    PASSWORD_MIN_LENGTH: '10',
    PASSWORD_MAX_LENGTH: '128',
    CUSTOMER_SESSION_IDLE_SECONDS: '2592000',
    CUSTOMER_SESSION_ABSOLUTE_SECONDS: '2592000',
    STAFF_SESSION_IDLE_SECONDS: '28800',
    STAFF_SESSION_ABSOLUTE_SECONDS: '43200',
    SESSION_TOUCH_INTERVAL_SECONDS: '300',
    EMAIL_VERIFICATION_TTL_SECONDS: '86400',
    PASSWORD_RESET_TTL_SECONDS: '1800',
    PREAUTH_CHALLENGE_TTL_SECONDS: '300',
    TOTP_ISSUER: 'Honey',
    TOTP_ENCRYPTION_KEY_BASE64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    TOTP_DRIFT_SECONDS: '30',
    AUTH_LOCKOUT_WINDOW_SECONDS: '900',
    AUTH_LOCKOUT_MAX_FAILURES: '10',
    AUTH_LOCKOUT_BASE_SECONDS: '30',
    AUTH_LOCKOUT_MAX_SECONDS: '900',
    PWNED_PASSWORDS_ENDPOINT: 'https://api.pwnedpasswords.com/range/',
    PWNED_PASSWORDS_TIMEOUT_MS: '3000',
    IDENTITY_SMTP_HOST: 'localhost',
    IDENTITY_SMTP_PORT: '1025',
    IDENTITY_SMTP_SECURE: 'false',
    IDENTITY_EMAIL_FROM: 'no-reply@example.invalid',
    IDENTITY_SMTP_TIMEOUT_MS: '5000',
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
    if (
      !parsed.data.SESSION_COOKIE_SECURE ||
      parsed.data.SESSION_COOKIE_NAME !== '__Host-session'
    ) {
      throw new Error('Production session cookie configuration must be secure and host-bound.');
    }
  }
  const totpKey = Buffer.from(parsed.data.TOTP_ENCRYPTION_KEY_BASE64, 'base64');
  if (totpKey.length !== 32)
    throw new Error('Invalid API environment configuration: TOTP_ENCRYPTION_KEY_BASE64.');
  if (
    parsed.data.NODE_ENV === 'production' &&
    parsed.data.TOTP_ENCRYPTION_KEY_BASE64 === 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
  ) {
    throw new Error('Production TOTP encryption key may not use the development placeholder.');
  }
  if (
    parsed.data.PASSWORD_ARGON2_MEMORY_KIB < 65_536 ||
    parsed.data.PASSWORD_ARGON2_TIME_COST < 3 ||
    parsed.data.PASSWORD_ARGON2_PARALLELISM !== 1 ||
    parsed.data.PASSWORD_MIN_LENGTH < 10 ||
    parsed.data.PASSWORD_MAX_LENGTH < 128
  ) {
    throw new Error('Identity password configuration is below the documented minimum.');
  }
  if (
    parsed.data.STAFF_SESSION_IDLE_SECONDS !== 28_800 ||
    parsed.data.STAFF_SESSION_ABSOLUTE_SECONDS !== 43_200
  ) {
    throw new Error('Staff session limits must remain 8 hours idle and 12 hours absolute.');
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    host: parsed.data.API_HOST,
    port: parsed.data.API_PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    redisUrl: parsed.data.REDIS_URL,
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
    sessionCookie: {
      name: parsed.data.SESSION_COOKIE_NAME,
      secure: parsed.data.SESSION_COOKIE_SECURE,
    },
    identity: {
      config: {
        password: {
          memoryCostKiB: parsed.data.PASSWORD_ARGON2_MEMORY_KIB,
          timeCost: parsed.data.PASSWORD_ARGON2_TIME_COST,
          parallelism: 1,
          minLength: parsed.data.PASSWORD_MIN_LENGTH,
          maxLength: parsed.data.PASSWORD_MAX_LENGTH,
        },
        session: {
          customerIdleMs: parsed.data.CUSTOMER_SESSION_IDLE_SECONDS * 1_000,
          customerAbsoluteMs: parsed.data.CUSTOMER_SESSION_ABSOLUTE_SECONDS * 1_000,
          staffIdleMs: parsed.data.STAFF_SESSION_IDLE_SECONDS * 1_000,
          staffAbsoluteMs: parsed.data.STAFF_SESSION_ABSOLUTE_SECONDS * 1_000,
          touchIntervalMs: parsed.data.SESSION_TOUCH_INTERVAL_SECONDS * 1_000,
        },
        verificationTokenTtlMs: parsed.data.EMAIL_VERIFICATION_TTL_SECONDS * 1_000,
        passwordResetTtlMs: parsed.data.PASSWORD_RESET_TTL_SECONDS * 1_000,
        preAuthChallengeTtlMs: parsed.data.PREAUTH_CHALLENGE_TTL_SECONDS * 1_000,
        totpIssuer: parsed.data.TOTP_ISSUER,
        totpDriftSeconds: parsed.data.TOTP_DRIFT_SECONDS,
        authThrottle: {
          windowMs: parsed.data.AUTH_LOCKOUT_WINDOW_SECONDS * 1_000,
          maxFailures: parsed.data.AUTH_LOCKOUT_MAX_FAILURES,
          baseLockMs: parsed.data.AUTH_LOCKOUT_BASE_SECONDS * 1_000,
          maxLockMs: parsed.data.AUTH_LOCKOUT_MAX_SECONDS * 1_000,
        },
      },
      totpEncryptionKey: parsed.data.TOTP_ENCRYPTION_KEY_BASE64,
      breachedPasswordEndpoint: parsed.data.PWNED_PASSWORDS_ENDPOINT,
      breachedPasswordTimeoutMs: parsed.data.PWNED_PASSWORDS_TIMEOUT_MS,
      smtp: {
        host: parsed.data.IDENTITY_SMTP_HOST,
        port: parsed.data.IDENTITY_SMTP_PORT,
        secure: parsed.data.IDENTITY_SMTP_SECURE,
        from: parsed.data.IDENTITY_EMAIL_FROM,
        connectionTimeoutMs: parsed.data.IDENTITY_SMTP_TIMEOUT_MS,
      },
    },
  };
}
