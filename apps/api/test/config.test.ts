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
