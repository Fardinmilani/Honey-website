import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { MediaService } from '../src/modules/media/application/media.service.js';
import {
  canonicalPublicUrl,
  type MediaAsset,
  type MediaConfig,
} from '../src/modules/media/domain/media.js';
import type {
  MediaRepository,
  PersistedAssetInput,
} from '../src/modules/media/domain/media-repository.port.js';
import type {
  MediaAuditInput,
  MediaAuditPort,
} from '../src/modules/media/domain/media-audit.port.js';
import { InMemoryUploadIntentAdapter } from '../src/modules/media/infrastructure/in-memory-upload-intent.adapter.js';
import { MagicContentInspector } from '../src/modules/media/infrastructure/magic-content-inspector.js';
import { S3StorageAdapter } from '../src/modules/media/infrastructure/s3-storage.adapter.js';
import { SharpMediaProcessor } from '../src/modules/media/infrastructure/sharp-media-processor.js';
import { postAuthorization } from './storage.contract.js';

const enabled = process.env['MEDIA_MINIO_TESTS'] === 'true';

const principal = {
  userId: '018f0000-0000-7000-8000-000000000001',
  sessionId: '018f0000-0000-7000-8000-000000000002',
  kind: 'STAFF',
  permissions: ['content:write'],
} as const;

class CapturingRepository implements MediaRepository {
  readonly assets = new Map<string, MediaAsset>();

  constructor(private readonly publicBaseUrl: string) {}

  async createAsset(input: PersistedAssetInput): Promise<MediaAsset> {
    const existing = this.assets.get(input.id);
    if (existing !== undefined) return existing;
    const isPublic = input.visibility === 'PUBLIC';
    const asset: MediaAsset = {
      id: input.id,
      kind: input.kind,
      visibility: input.visibility,
      mimeType: input.mimeType,
      bytes: input.bytes,
      width: input.width,
      height: input.height,
      durationSeconds: input.durationSeconds,
      checksum: input.checksum,
      altTextByLocale: input.altTextByLocale,
      url: isPublic ? canonicalPublicUrl(this.publicBaseUrl, input.storageKey) : null,
      createdBy: input.createdBy,
      createdAt: '2026-08-06T12:00:00.000Z',
      updatedAt: '2026-08-06T12:00:00.000Z',
      derivatives: input.derivatives.map((derivative) => ({
        id: derivative.id,
        variant: derivative.variant,
        format: derivative.format,
        mimeType: derivative.mimeType,
        width: derivative.width,
        height: derivative.height,
        bytes: derivative.bytes,
        checksum: derivative.checksum,
        url: isPublic ? canonicalPublicUrl(this.publicBaseUrl, derivative.storageKey) : null,
      })),
    };
    this.assets.set(asset.id, asset);
    return asset;
  }

  async findAsset(assetId: string): Promise<MediaAsset | null> {
    return this.assets.get(assetId) ?? null;
  }

  async findAssets(assetIds: readonly string[]): Promise<readonly MediaAsset[]> {
    return (await Promise.all(assetIds.map((assetId) => this.findAsset(assetId)))).filter(
      (asset): asset is MediaAsset => asset !== null,
    );
  }

  async updateAltText(): Promise<MediaAsset | null> {
    throw new Error('Not used by this integration test.');
  }

  async deleteUnattachedAsset(): Promise<MediaAsset | null> {
    throw new Error('Not used by this integration test.');
  }

  async close(): Promise<void> {}
}

class CapturingAudit implements MediaAuditPort {
  readonly entries: MediaAuditInput[] = [];

  async append(input: MediaAuditInput): Promise<void> {
    this.entries.push(input);
  }

  async close(): Promise<void> {}
}

function harness(): Readonly<{
  service: MediaService;
  storage: S3StorageAdapter;
  repository: CapturingRepository;
}> {
  const publicBucket = process.env['S3_PUBLIC_BUCKET'] ?? 'honey-media';
  const endpoint = process.env['S3_BROWSER_ENDPOINT'] ?? 'http://127.0.0.1:9000';
  const publicBaseUrl = process.env['PUBLIC_MEDIA_BASE_URL'] ?? `${endpoint}/${publicBucket}/`;
  const mediaConfig: MediaConfig = {
    publicBaseUrl,
    maxImageBytes: 15 * 1_024 * 1_024,
    maxVideoBytes: 100 * 1_024 * 1_024,
    maxDecodedPixels: 40_000_000,
    maxWidth: 12_000,
    maxHeight: 12_000,
    presignedUploadTtlSeconds: 60,
    privateDownloadTtlSeconds: 60,
    uploadIntentTtlSeconds: 120,
    processingTimeoutMs: 30_000,
  };
  const storage = new S3StorageAdapter({
    internalEndpoint: process.env['S3_INTERNAL_ENDPOINT'] ?? 'http://127.0.0.1:9000',
    browserEndpoint: endpoint,
    region: process.env['S3_REGION'] ?? 'local',
    accessKeyId: process.env['S3_ACCESS_KEY'] ?? 'honey-local-minio',
    secretAccessKey: process.env['S3_SECRET_KEY'] ?? 'replace-with-local-development-password',
    forcePathStyle: true,
    publicBucket,
    privateBucket: process.env['S3_PRIVATE_BUCKET'] ?? 'honey-private',
    requestTimeoutMs: 5_000,
  });
  const repository = new CapturingRepository(publicBaseUrl);
  return {
    storage,
    repository,
    service: new MediaService({
      config: mediaConfig,
      storage,
      intents: new InMemoryUploadIntentAdapter(),
      repository,
      inspector: new MagicContentInspector(),
      processor: new SharpMediaProcessor(mediaConfig),
      audit: new CapturingAudit(),
    }),
  };
}

describe.runIf(enabled)('media processing against real MinIO', () => {
  it('uploads to quarantine, promotes processed outputs, serves public media, and retries idempotently', async () => {
    const value = harness();
    const body = await sharp({
      create: { width: 96, height: 48, channels: 3, background: '#d99b2b' },
    })
      .png()
      .toBuffer();
    const intent = await value.service.createUploadIntent(principal, {
      declaredMimeType: 'image/png',
      declaredBytes: body.byteLength,
      visibility: 'PUBLIC',
      altTextByLocale: { fa: 'عسل' },
    });
    await postAuthorization(intent.upload, body, 'image/png');
    try {
      const asset = await value.service.completeUpload(principal, intent.uploadId, {
        requestId: 'minio-media-valid',
      });
      expect(asset.derivatives).toHaveLength(4);
      expect(await value.storage.objectExists('public', `media/${asset.id}/original.png`)).toBe(
        true,
      );
      expect((await fetch(asset.url ?? '')).status).toBe(200);
      expect(
        (await value.service.completeUpload(principal, intent.uploadId, { requestId: 'retry' })).id,
      ).toBe(asset.id);
      expect(value.repository.assets.size).toBe(1);
    } finally {
      const asset = value.repository.assets.get(intent.assetId);
      if (asset !== undefined) {
        await value.storage.deleteObject('public', `media/${asset.id}/original.png`);
        for (const derivative of asset.derivatives) {
          await value.storage.deleteObject(
            'public',
            `media/${asset.id}/${derivative.variant}-${derivative.width}.${derivative.format}`,
          );
        }
      }
      await value.storage.close();
    }
  });

  it('removes an executable disguised as an image from MinIO quarantine', async () => {
    const value = harness();
    const body = Buffer.from('MZ executable disguised as image.jpg');
    const intent = await value.service.createUploadIntent(principal, {
      declaredMimeType: 'image/jpeg',
      declaredBytes: body.byteLength,
      visibility: 'PUBLIC',
      altTextByLocale: {},
    });
    const key = intent.upload.fields['key'];
    if (key === undefined) throw new Error('Upload authorization is missing its key.');
    await postAuthorization(intent.upload, body, 'image/jpeg');
    try {
      await expect(
        value.service.completeUpload(principal, intent.uploadId, { requestId: 'minio-invalid' }),
      ).rejects.toThrow();
      expect(await value.storage.objectExists('private', key)).toBe(false);
      expect(value.repository.assets.size).toBe(0);
    } finally {
      await value.storage.deleteObject('private', key);
      await value.storage.close();
    }
  });
});
