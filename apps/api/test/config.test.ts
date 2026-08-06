import { describe, expect, it } from 'vitest';

import { loadApiConfig } from '../src/config/api-config.js';

const databaseUrl = 'postgresql://api:api@127.0.0.1:5432/api';

describe('API configuration', () => {
  it('loads documented local defaults while requiring the database URL', () => {
    const config = loadApiConfig({ NODE_ENV: 'test', DATABASE_URL: databaseUrl });
    expect(config.port).toBe(4000);
    expect(config.bodyLimitBytes).toBe(1_048_576);
    expect(config.trustProxy).toBe(false);
  });

  it('prevents startup when required configuration is missing or malformed', () => {
    expect(() => loadApiConfig({ NODE_ENV: 'test' })).toThrow('DATABASE_URL');
    expect(() => loadApiConfig({ NODE_ENV: 'test', DATABASE_URL: 'not-a-url' })).toThrow(
      'DATABASE_URL',
    );
  });

  it('rejects unsafe production origin, proxy, and cookie settings', () => {
    const base = {
      NODE_ENV: 'production',
      API_HOST: '0.0.0.0',
      API_PORT: '4000',
      DATABASE_URL: databaseUrl,
      LOG_LEVEL: 'info',
      API_BODY_LIMIT_BYTES: '1048576',
      API_SHUTDOWN_GRACE_MS: '10000',
      API_READINESS_TIMEOUT_MS: '2000',
      API_RATE_LIMIT_MAX: '300',
      API_RATE_LIMIT_WINDOW_MS: '60000',
      CSRF_HEADER_NAME: 'x-csrf-token',
      REDIS_URL: 'redis://127.0.0.1:6379',
      SESSION_COOKIE_NAME: '__Host-session',
      SESSION_COOKIE_SECURE: 'true',
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
      TOTP_ENCRYPTION_KEY_BASE64: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=',
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
      S3_INTERNAL_ENDPOINT: 'https://s3.internal.example',
      S3_BROWSER_ENDPOINT: 'https://storage.example',
      S3_REGION: 'eu-central-1',
      S3_ACCESS_KEY: 'production-access-key-placeholder',
      S3_SECRET_KEY: 'production-secret-key-placeholder',
      S3_FORCE_PATH_STYLE: 'true',
      S3_PUBLIC_BUCKET: 'honey-media-production',
      S3_PRIVATE_BUCKET: 'honey-private-production',
      S3_REQUEST_TIMEOUT_MS: '5000',
      PUBLIC_MEDIA_BASE_URL: 'https://media.example/',
      MEDIA_UPLOAD_ALLOWED_ORIGINS: 'https://shop.example',
      MEDIA_MAX_IMAGE_BYTES: '15728640',
      MEDIA_MAX_VIDEO_BYTES: '104857600',
      MEDIA_MAX_DECODED_PIXELS: '40000000',
      MEDIA_MAX_WIDTH: '12000',
      MEDIA_MAX_HEIGHT: '12000',
      MEDIA_PRESIGNED_UPLOAD_TTL_SECONDS: '300',
      MEDIA_PRIVATE_DOWNLOAD_TTL_SECONDS: '120',
      MEDIA_UPLOAD_INTENT_TTL_SECONDS: '600',
      MEDIA_PROCESSING_TIMEOUT_MS: '30000',
      MEDIA_DERIVATIVE_PROFILE: 'honey-v1',
    };
    expect(() =>
      loadApiConfig({
        ...base,
        TRUST_PROXY: '*',
        API_ALLOWED_ORIGINS: 'https://shop.example',
        CSRF_COOKIE_NAME: '__Host-csrf',
        CSRF_COOKIE_SECURE: 'true',
      }),
    ).toThrow('TRUST_PROXY');
    expect(() =>
      loadApiConfig({
        ...base,
        TRUST_PROXY: 'loopback',
        API_ALLOWED_ORIGINS: '*',
        CSRF_COOKIE_NAME: '__Host-csrf',
        CSRF_COOKIE_SECURE: 'true',
      }),
    ).toThrow('wildcard');
    expect(() =>
      loadApiConfig({
        ...base,
        TRUST_PROXY: 'loopback',
        API_ALLOWED_ORIGINS: 'https://shop.example',
        CSRF_COOKIE_NAME: 'csrf',
        CSRF_COOKIE_SECURE: 'false',
      }),
    ).toThrow('host-bound');
  });
});
