import { Controller, Get } from '@nestjs/common';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IdentityService, type AuthenticatedPrincipal, type SafeUser } from '@honey/backend';
import { AppModule } from '../src/app.module.js';
import { createApiApplication } from '../src/bootstrap/create-application.js';
import { loadApiConfig } from '../src/config/api-config.js';
import { Public, RequirePermissions } from '../src/http/auth/authorization.js';
import { assertControllerAuthorizationPolicies } from '../src/http/auth/route-policy-verifier.js';

const config = loadApiConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://api:api@127.0.0.1:5432/api',
  API_RATE_LIMIT_MAX: '100',
});
const user: SafeUser = {
  id: '018f0000-0000-7000-8000-000000000001',
  email: 'customer@example.invalid',
  emailVerified: true,
  displayName: 'Customer',
  preferredLocale: 'fa',
  status: 'ACTIVE',
  isStaff: false,
  roles: ['CUSTOMER'],
  permissions: [],
};
const principal: AuthenticatedPrincipal = {
  userId: user.id,
  sessionId: '018f0000-0000-7000-8000-000000000002',
  kind: 'CUSTOMER',
  permissions: [],
};

async function withApp(work: (api: FastifyInstance) => Promise<void>): Promise<void> {
  const app = await createApiApplication({
    config,
    databaseHealthOverride: { check: async () => Promise.resolve() },
    logger: pino({ level: 'silent' }),
  });
  try {
    await app.init();
    await work(app.getHttpAdapter().getInstance());
  } finally {
    await app.close();
  }
}

afterEach(() => vi.restoreAllMocks());

describe('identity HTTP boundary', () => {
  it('returns the opaque session only in Set-Cookie and documents secure cookie attributes', async () => {
    const rawToken = 'raw-session-token-that-must-never-enter-json';
    vi.spyOn(IdentityService.prototype, 'login').mockResolvedValue({
      next: 'AUTHENTICATED',
      session: {
        sessionToken: rawToken,
        expiresAt: new Date('2026-09-05T12:00:00.000Z'),
        user,
      },
    });
    await withApp(async (api) => {
      const response = await api.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: user.email, password: 'correct horse battery staple' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain(rawToken);
      expect(response.json()).toMatchObject({ next: 'AUTHENTICATED', user });
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(String(cookies)).toContain(`honey_session=${rawToken}`);
      expect(String(cookies)).toContain('HttpOnly');
      expect(String(cookies)).toContain('SameSite=Lax');
      expect(String(cookies)).toContain('Path=/');
    });
  });

  it('rejects authoritative registration fields and returns /v1/me safe shape only', async () => {
    const register = vi.spyOn(IdentityService.prototype, 'register');
    vi.spyOn(IdentityService.prototype, 'authenticateSession').mockResolvedValue(principal);
    vi.spyOn(IdentityService.prototype, 'me').mockResolvedValue(user);
    await withApp(async (api) => {
      const rejected = await api.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: user.email,
          password: 'correct horse battery staple',
          isStaff: true,
          role: 'OWNER',
          emailVerifiedAt: '2026-08-06T12:00:00.000Z',
        },
      });
      expect(rejected.statusCode).toBe(422);
      expect(register).not.toHaveBeenCalled();

      const response = await api.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { cookie: 'honey_session=opaque-cookie-value-with-enough-entropy' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(user);
      expect(response.body).not.toMatch(/credential|password|totp|tokenHash|audit/iu);
    });
  });

  it('requires CSRF for an unsafe cookie-authenticated operation', async () => {
    vi.spyOn(IdentityService.prototype, 'authenticateSession').mockResolvedValue(principal);
    const logout = vi.spyOn(IdentityService.prototype, 'logout').mockResolvedValue();
    await withApp(async (api) => {
      const response = await api.inject({
        method: 'POST',
        url: '/v1/auth/logout',
        headers: { cookie: 'honey_session=opaque-cookie-value-with-enough-entropy' },
      });
      expect(response.statusCode).toBe(403);
      expect(logout).not.toHaveBeenCalled();
    });
  });
});

describe('fail-closed route declarations', () => {
  it('accepts every production controller because each method declares exactly one policy', () => {
    expect(() => assertControllerAuthorizationPolicies(AppModule.controllers(false))).not.toThrow();
  });

  it('rejects a route without authorization metadata at startup', () => {
    @Controller('missing-policy')
    class MissingPolicyController {
      @Get()
      route(): Readonly<{ ok: true }> {
        return { ok: true };
      }
    }
    expect(() => assertControllerAuthorizationPolicies([MissingPolicyController])).toThrow(
      'MissingPolicyController.route',
    );
  });

  it('rejects a route that is both public and permission-protected', () => {
    @Controller('conflicting-policy')
    class ConflictingPolicyController {
      @Get()
      @Public()
      @RequirePermissions()
      route(): Readonly<{ ok: true }> {
        return { ok: true };
      }
    }
    expect(() => assertControllerAuthorizationPolicies([ConflictingPolicyController])).toThrow(
      'ConflictingPolicyController.route',
    );
  });
});
