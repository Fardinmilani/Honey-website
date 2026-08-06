import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';

import type { FastifyInstance } from 'fastify';
import type { DatabaseHealthPort } from '@honey/backend';
import { createApiApplication } from '../src/bootstrap/create-application.js';
import { loadApiConfig } from '../src/config/api-config.js';
import { InMemoryRateLimitStore, type RateLimitStore } from '../src/http/security/rate-limit.js';

const baseConfig = loadApiConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://api:api@127.0.0.1:5432/api',
  API_RATE_LIMIT_MAX: '100',
});

async function withApp(
  database: DatabaseHealthPort,
  work: (instance: FastifyInstance) => Promise<void>,
  rateLimitStore?: RateLimitStore,
): Promise<void> {
  const app = await createApiApplication({
    config: baseConfig,
    databaseHealthOverride: database,
    enableTestRoutes: true,
    logger: pino({ level: 'silent' }),
    ...(rateLimitStore === undefined ? {} : { rateLimitStore }),
  });
  try {
    await app.init();
    await work(app.getHttpAdapter().getInstance());
  } finally {
    await app.close();
  }
}

describe('API HTTP foundation', () => {
  it('boots, serves liveness without a database query, and applies security headers', async () => {
    const check = vi.fn(async () => undefined);
    await withApp({ check }, async (api) => {
      const response = await api.inject({ method: 'GET', url: '/healthz' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
      expect(check).not.toHaveBeenCalled();
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(response.headers['permissions-policy']).toContain('camera=()');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  it('maps readiness success and dependency failure through the backend service', async () => {
    await withApp({ check: async () => undefined }, async (api) => {
      const response = await api.inject({ method: 'GET', url: '/readyz' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ready', checks: { database: 'ready' } });
    });
    await withApp(
      {
        check: async () => {
          throw new Error('database credential detail');
        },
      },
      async (api) => {
        const response = await api.inject({ method: 'GET', url: '/readyz' });
        expect(response.statusCode).toBe(503);
        expect(response.headers['content-type']).toContain('application/problem+json');
        expect(response.body).not.toContain('credential');
        expect(response.json()).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', status: 503 });
      },
    );
  });

  it.runIf(process.env['DATABASE_URL'] !== undefined)(
    'serves readiness through the real backend-to-PostgreSQL adapter',
    async () => {
      const databaseUrl = process.env['DATABASE_URL'];
      if (databaseUrl === undefined) throw new Error('DATABASE_URL disappeared during the test.');
      const app = await createApiApplication({
        config: { ...baseConfig, databaseUrl },
        logger: pino({ level: 'silent' }),
      });
      try {
        await app.init();
        const response = await app
          .getHttpAdapter()
          .getInstance()
          .inject({ method: 'GET', url: '/readyz' });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ready', checks: { database: 'ready' } });
      } finally {
        await app.close();
      }
    },
  );

  it('generates or echoes only valid request ids', async () => {
    await withApp({ check: async () => undefined }, async (api) => {
      const generated = await api.inject({ method: 'GET', url: '/healthz' });
      expect(generated.headers['x-request-id']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/u);
      const echoed = await api.inject({
        method: 'GET',
        url: '/healthz',
        headers: { 'x-request-id': 'client-request-1234' },
      });
      expect(echoed.headers['x-request-id']).toBe('client-request-1234');
      const replaced = await api.inject({
        method: 'GET',
        url: '/healthz',
        headers: { 'x-request-id': '<invalid>' },
      });
      expect(replaced.headers['x-request-id']).not.toBe('<invalid>');
    });
  });

  it('returns 400 for malformed JSON and 422 for unknown DTO properties', async () => {
    const token = 'a'.repeat(32);
    const headers = {
      'content-type': 'application/json',
      cookie: `csrf_token=${token}`,
      'x-csrf-token': token,
    };
    await withApp({ check: async () => undefined }, async (api) => {
      const malformed = await api.inject({
        method: 'POST',
        url: '/__testing/validation',
        headers,
        payload: '{',
      });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json()).toMatchObject({ code: 'MALFORMED_JSON', status: 400 });
      const unknown = await api.inject({
        method: 'POST',
        url: '/__testing/validation',
        headers,
        payload: { value: 'ok', extra: true },
      });
      expect(unknown.statusCode).toBe(422);
      expect(unknown.json()).toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
    });
  });

  it('sanitizes unexpected failures and returns rate-limit problems', async () => {
    await withApp(
      { check: async () => undefined },
      async (api) => {
        const first = await api.inject({ method: 'GET', url: '/__testing/unexpected' });
        expect(first.statusCode).toBe(500);
        expect(first.body).not.toContain('database');
        expect(first.body).not.toContain('stack');
        const limited = await api.inject({ method: 'GET', url: '/__testing/unexpected' });
        expect(limited.statusCode).toBe(429);
        expect(limited.headers['retry-after']).toBeDefined();
        expect(limited.json()).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
      },
      new InMemoryRateLimitStore(1, 60_000),
    );
  });

  it('allows credentials only for explicitly configured CORS origins', async () => {
    await withApp({ check: async () => undefined }, async (api) => {
      const allowed = await api.inject({
        method: 'OPTIONS',
        url: '/healthz',
        headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET' },
      });
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');
      const denied = await api.inject({
        method: 'OPTIONS',
        url: '/healthz',
        headers: { origin: 'https://untrusted.example', 'access-control-request-method': 'GET' },
      });
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
