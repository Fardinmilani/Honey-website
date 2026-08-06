import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IdentityService, MediaService, type AuthenticatedPrincipal } from '@honey/backend';
import { createApiApplication } from '../src/bootstrap/create-application.js';
import { loadApiConfig } from '../src/config/api-config.js';

const config = loadApiConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://api:api@127.0.0.1:5432/api',
  API_RATE_LIMIT_MAX: '100',
});

const staff: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-000000000001',
  sessionId: '018f0000-0000-7000-8000-000000000002',
  kind: 'STAFF',
  permissions: ['content:write'],
};

const customer: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-000000000003',
  sessionId: '018f0000-0000-7000-8000-000000000004',
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

function authenticatedHeaders(): Readonly<Record<string, string>> {
  const csrf = 'a'.repeat(32);
  return {
    cookie: `honey_session=opaque-session; csrf_token=${csrf}`,
    'x-csrf-token': csrf,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('media HTTP boundary', () => {
  it('rejects customer media uploads before calling the media service', async () => {
    vi.spyOn(IdentityService.prototype, 'authenticateSession').mockResolvedValue(customer);
    const create = vi.spyOn(MediaService.prototype, 'createUploadIntent');
    await withApp(async (api) => {
      const response = await api.inject({
        method: 'POST',
        url: '/v1/admin/media/upload-intents',
        headers: authenticatedHeaders(),
        payload: {
          declaredMimeType: 'image/jpeg',
          declaredBytes: 100,
          visibility: 'PUBLIC',
          altTextByLocale: {},
        },
      });
      expect(response.statusCode).toBe(403);
      expect(create).not.toHaveBeenCalled();
    });
  });

  it('rejects bucket, storage key, filename, checksum, dimensions, and byte payload fields', async () => {
    vi.spyOn(IdentityService.prototype, 'authenticateSession').mockResolvedValue(staff);
    const create = vi.spyOn(MediaService.prototype, 'createUploadIntent');
    await withApp(async (api) => {
      const response = await api.inject({
        method: 'POST',
        url: '/v1/admin/media/upload-intents',
        headers: authenticatedHeaders(),
        payload: {
          declaredMimeType: 'image/jpeg',
          declaredBytes: 100,
          visibility: 'PUBLIC',
          altTextByLocale: {},
          bucket: 'honey-media',
          storageKey: '../chosen',
          filename: 'user.jpg',
          checksum: '0'.repeat(64),
          width: 1,
          file: 'base64-bytes',
        },
      });
      expect(response.statusCode).toBe(422);
      expect(create).not.toHaveBeenCalled();
    });
  });

  it('returns a direct storage authorization without proxying uploaded bytes', async () => {
    vi.spyOn(IdentityService.prototype, 'authenticateSession').mockResolvedValue(staff);
    vi.spyOn(MediaService.prototype, 'createUploadIntent').mockResolvedValue({
      uploadId: '018f0000-0000-7000-8000-000000000010',
      assetId: '018f0000-0000-7000-8000-000000000011',
      expiresAt: '2026-08-06T12:10:00.000Z',
      upload: {
        method: 'POST',
        url: 'http://localhost:9000/honey-private',
        fields: { key: 'quarantine/generated/original', policy: 'short-lived-policy' },
        expiresAt: '2026-08-06T12:05:00.000Z',
      },
    });
    await withApp(async (api) => {
      const response = await api.inject({
        method: 'POST',
        url: '/v1/admin/media/upload-intents',
        headers: authenticatedHeaders(),
        payload: {
          declaredMimeType: 'image/jpeg',
          declaredBytes: 100,
          visibility: 'PUBLIC',
          altTextByLocale: { fa: 'عسل' },
        },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ upload: { method: 'POST' } });
      expect(response.body).not.toContain('base64');
      expect(response.body).not.toContain('secret');
    });
  });
});
