import { describe, expect, it } from 'vitest';

import { InMemoryStorageAdapter } from '../src/modules/media/infrastructure/in-memory-storage.adapter.js';
import { storageContract } from './storage.contract.js';

storageContract('in-memory fake', async () => {
  const storage = new InMemoryStorageAdapter();
  return {
    storage,
    uploadDirectly: async (authorization, body, contentType) => {
      const key = authorization.fields['key'];
      if (key === undefined) throw new Error('Fake authorization is missing its exact key.');
      await storage.putTrustedObject({
        bucket: 'private',
        key,
        body,
        contentType,
        cacheControl: 'private, no-store',
        contentDisposition: 'inline',
      });
    },
  };
});

describe('in-memory storage deterministic expiry', () => {
  it('uses an injected clock for upload and private URL expiry', async () => {
    let now = new Date('2026-08-06T12:00:00.000Z');
    const storage = new InMemoryStorageAdapter(() => now);
    const authorization = await storage.createDirectUploadAuthorization({
      bucket: 'private',
      key: 'quarantine/018f0000-0000-7000-8000-000000000001/original',
      contentType: 'image/jpeg',
      maximumBytes: 100,
      expiresInSeconds: 30,
    });
    expect(authorization.expiresAt.toISOString()).toBe('2026-08-06T12:00:30.000Z');
    await storage.putTrustedObject({
      bucket: 'private',
      key: 'private/018f0000-0000-7000-8000-000000000001/original.jpg',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/jpeg',
      cacheControl: 'private, no-store',
      contentDisposition: 'inline',
    });
    now = new Date('2026-08-06T12:01:00.000Z');
    const signed = await storage.createSignedDownloadUrl(
      'private',
      'private/018f0000-0000-7000-8000-000000000001/original.jpg',
      20,
    );
    expect(signed.expiresAt.toISOString()).toBe('2026-08-06T12:01:20.000Z');
  });
});
