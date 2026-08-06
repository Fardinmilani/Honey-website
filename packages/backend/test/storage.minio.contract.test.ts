import { randomUUID } from 'node:crypto';

import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

import { S3StorageAdapter } from '../src/modules/media/infrastructure/s3-storage.adapter.js';
import { postAuthorization, storageContract } from './storage.contract.js';

const enabled = process.env['MEDIA_MINIO_TESTS'] === 'true';

function storage(): S3StorageAdapter {
  return new S3StorageAdapter({
    internalEndpoint: process.env['S3_INTERNAL_ENDPOINT'] ?? 'http://127.0.0.1:9000',
    browserEndpoint: process.env['S3_BROWSER_ENDPOINT'] ?? 'http://127.0.0.1:9000',
    region: process.env['S3_REGION'] ?? 'local',
    accessKeyId: process.env['S3_ACCESS_KEY'] ?? 'honey-local-minio',
    secretAccessKey: process.env['S3_SECRET_KEY'] ?? 'replace-with-local-development-password',
    forcePathStyle: true,
    publicBucket: process.env['S3_PUBLIC_BUCKET'] ?? 'honey-media',
    privateBucket: process.env['S3_PRIVATE_BUCKET'] ?? 'honey-private',
    requestTimeoutMs: 5_000,
  });
}

if (enabled) {
  storageContract('MinIO S3', async () => ({
    storage: storage(),
    uploadDirectly: postAuthorization,
    fetchSigned: async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Signed download failed with ${response.status}.`);
      return new Uint8Array(await response.arrayBuffer());
    },
  }));
}

describe.runIf(enabled)('MinIO signed URL expiry', () => {
  it('expires a short-lived private URL at the storage service', async () => {
    const adapter = storage();
    const key = `phase7-expiry/${randomUUID()}/object`;
    try {
      await adapter.putTrustedObject({
        bucket: 'private',
        key,
        body: new Uint8Array([1, 2, 3]),
        contentType: 'application/octet-stream',
        cacheControl: 'private, no-store',
        contentDisposition: 'inline',
      });
      const signed = await adapter.createSignedDownloadUrl('private', key, 1);
      expect((await fetch(signed.url)).status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 2_100));
      expect((await fetch(signed.url)).status).toBe(403);
    } finally {
      await adapter.deleteObject('private', key);
      await adapter.close();
    }
  });

  it('serves public objects anonymously and contains no Hero object in either bucket', async () => {
    const adapter = storage();
    const key = `phase7-public/${randomUUID()}/image.webp`;
    const endpoint = process.env['S3_BROWSER_ENDPOINT'] ?? 'http://127.0.0.1:9000';
    const publicBucket = process.env['S3_PUBLIC_BUCKET'] ?? 'honey-media';
    const privateBucket = process.env['S3_PRIVATE_BUCKET'] ?? 'honey-private';
    const client = new S3Client({
      endpoint: process.env['S3_INTERNAL_ENDPOINT'] ?? 'http://127.0.0.1:9000',
      region: process.env['S3_REGION'] ?? 'local',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env['S3_ACCESS_KEY'] ?? 'honey-local-minio',
        secretAccessKey: process.env['S3_SECRET_KEY'] ?? 'replace-with-local-development-password',
      },
    });
    try {
      await adapter.putTrustedObject({
        bucket: 'public',
        key,
        body: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
        contentDisposition: 'inline',
      });
      const publicUrl = `${endpoint}/${publicBucket}/${key}`;
      const response = await fetch(publicUrl);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/webp');

      const keys: string[] = [];
      for (const bucket of [publicBucket, privateBucket]) {
        const result = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
        for (const object of result.Contents ?? []) {
          if (object.Key !== undefined) keys.push(object.Key);
        }
      }
      expect(keys.join('\n')).not.toMatch(
        /(?:^|\/)hero(?:\/|$)|honey-scroll|honey-poster|hero-start|hero-end/iu,
      );
    } finally {
      await adapter.deleteObject('public', key);
      await adapter.close();
      client.destroy();
    }
  });
});
