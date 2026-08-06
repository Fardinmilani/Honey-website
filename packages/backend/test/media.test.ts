import { randomUUID } from 'node:crypto';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { ForbiddenAppError, NotFoundAppError, ValidationAppError } from '../src/errors/index.js';
import { MediaService } from '../src/modules/media/application/media.service.js';
import {
  MEDIA_DERIVATIVE_PROFILE,
  canonicalPublicUrl,
  normalizeAltText,
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
import { InMemoryStorageAdapter } from '../src/modules/media/infrastructure/in-memory-storage.adapter.js';
import { InMemoryUploadIntentAdapter } from '../src/modules/media/infrastructure/in-memory-upload-intent.adapter.js';
import { MagicContentInspector } from '../src/modules/media/infrastructure/magic-content-inspector.js';
import { SharpMediaProcessor } from '../src/modules/media/infrastructure/sharp-media-processor.js';

const staff = {
  userId: '018f0000-0000-7000-8000-000000000001',
  sessionId: '018f0000-0000-7000-8000-000000000002',
  kind: 'STAFF',
  permissions: ['content:write'],
} as const;

const otherStaff = {
  userId: '018f0000-0000-7000-8000-000000000003',
  sessionId: '018f0000-0000-7000-8000-000000000004',
  kind: 'STAFF',
  permissions: ['content:write'],
} as const;

const customer = {
  userId: '018f0000-0000-7000-8000-000000000005',
  sessionId: '018f0000-0000-7000-8000-000000000006',
  kind: 'CUSTOMER',
  permissions: [],
} as const;

const metadata = { requestId: 'media-test-request', clientIp: '192.0.2.10' } as const;

const config: MediaConfig = {
  publicBaseUrl: 'https://media.example.invalid/honey-media/',
  maxImageBytes: 15 * 1_024 * 1_024,
  maxVideoBytes: 100 * 1_024 * 1_024,
  maxDecodedPixels: 40_000_000,
  maxWidth: 12_000,
  maxHeight: 12_000,
  presignedUploadTtlSeconds: 300,
  privateDownloadTtlSeconds: 120,
  uploadIntentTtlSeconds: 600,
  processingTimeoutMs: 30_000,
};

class MemoryMediaRepository implements MediaRepository {
  readonly assets = new Map<string, MediaAsset>();
  createCalls = 0;

  async createAsset(input: PersistedAssetInput): Promise<MediaAsset> {
    const existing = this.assets.get(input.id);
    if (existing !== undefined) return existing;
    this.createCalls += 1;
    const now = '2026-08-06T12:00:00.000Z';
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
      url: isPublic ? canonicalPublicUrl(config.publicBaseUrl, input.storageKey) : null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      derivatives: input.derivatives.map((derivative) => ({
        id: derivative.id,
        variant: derivative.variant,
        format: derivative.format,
        mimeType: derivative.mimeType,
        width: derivative.width,
        height: derivative.height,
        bytes: derivative.bytes,
        checksum: derivative.checksum,
        url: isPublic ? canonicalPublicUrl(config.publicBaseUrl, derivative.storageKey) : null,
      })),
    };
    this.assets.set(input.id, asset);
    return asset;
  }

  async findAsset(assetId: string): Promise<MediaAsset | null> {
    return this.assets.get(assetId) ?? null;
  }

  async updateAltText(
    assetId: string,
    altTextByLocale: Readonly<Record<string, string>>,
  ): Promise<MediaAsset | null> {
    const asset = this.assets.get(assetId);
    if (asset === undefined) return null;
    const updated = { ...asset, altTextByLocale };
    this.assets.set(assetId, updated);
    return updated;
  }

  async deleteUnattachedAsset(assetId: string): Promise<MediaAsset | null> {
    const asset = this.assets.get(assetId);
    if (asset === undefined) return null;
    this.assets.delete(assetId);
    return asset;
  }

  async close(): Promise<void> {}
}

class MemoryAudit implements MediaAuditPort {
  readonly entries: MediaAuditInput[] = [];

  async append(input: MediaAuditInput): Promise<void> {
    this.entries.push(input);
  }

  async close(): Promise<void> {}
}

function serviceHarness(
  overrides: Readonly<{ config?: MediaConfig; now?: () => Date }> = {},
): Readonly<{
  service: MediaService;
  storage: InMemoryStorageAdapter;
  intents: InMemoryUploadIntentAdapter;
  repository: MemoryMediaRepository;
  audit: MemoryAudit;
}> {
  const storage = new InMemoryStorageAdapter(overrides.now);
  const intents = new InMemoryUploadIntentAdapter(overrides.now);
  const repository = new MemoryMediaRepository();
  const audit = new MemoryAudit();
  const activeConfig = overrides.config ?? config;
  return {
    service: new MediaService({
      config: activeConfig,
      storage,
      intents,
      repository,
      inspector: new MagicContentInspector(),
      processor: new SharpMediaProcessor(activeConfig),
      audit,
      ...(overrides.now === undefined ? {} : { now: overrides.now }),
    }),
    storage,
    intents,
    repository,
    audit,
  };
}

async function image(
  format: 'avif' | 'jpeg' | 'png' | 'webp',
  width = 400,
  height = 200,
): Promise<Uint8Array> {
  const pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 220, g: 160, b: 40 } },
  });
  switch (format) {
    case 'jpeg':
      return pipeline.jpeg().toBuffer();
    case 'png':
      return pipeline.png().toBuffer();
    case 'webp':
      return pipeline.webp().toBuffer();
    case 'avif':
      return pipeline.avif().toBuffer();
  }
}

async function putQuarantine(
  storage: InMemoryStorageAdapter,
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  await storage.putTrustedObject({
    bucket: 'private',
    key,
    body,
    contentType,
    cacheControl: 'private, no-store',
    contentDisposition: 'inline',
  });
}

function addSyntheticGpsExif(jpeg: Uint8Array): Uint8Array {
  const tiff = Buffer.alloc(152);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8825, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt32LE(0, 22);
  tiff.writeUInt16LE(4, 26);
  const entries = [
    { tag: 1, type: 2, count: 2, value: 0x4e },
    { tag: 2, type: 5, count: 3, value: 80 },
    { tag: 3, type: 2, count: 2, value: 0x45 },
    { tag: 4, type: 5, count: 3, value: 104 },
  ] as const;
  entries.forEach((entry, index) => {
    const offset = 28 + index * 12;
    tiff.writeUInt16LE(entry.tag, offset);
    tiff.writeUInt16LE(entry.type, offset + 2);
    tiff.writeUInt32LE(entry.count, offset + 4);
    tiff.writeUInt32LE(entry.value, offset + 8);
  });
  tiff.writeUInt32LE(0, 76);
  const rationals = [35, 1, 41, 1, 30, 1, 51, 1, 23, 1, 45, 1] as const;
  rationals.forEach((value, index) => tiff.writeUInt32LE(value, 80 + index * 4));
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const segment = Buffer.alloc(payload.byteLength + 4);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment.writeUInt16BE(payload.byteLength + 2, 2);
  payload.copy(segment, 4);
  return Buffer.concat([Buffer.from(jpeg.subarray(0, 2)), segment, Buffer.from(jpeg.subarray(2))]);
}

describe('magic-number media validation', () => {
  it('detects JPEG, PNG, WebP, and AVIF from actual bytes', async () => {
    const inspector = new MagicContentInspector();
    for (const [format, mimeType] of [
      ['jpeg', 'image/jpeg'],
      ['png', 'image/png'],
      ['webp', 'image/webp'],
      ['avif', 'image/avif'],
    ] as const) {
      await expect(inspector.detect(await image(format))).resolves.toBe(mimeType);
    }
  });

  it('detects MP4 and WebM from container bytes', async () => {
    const inspector = new MagicContentInspector();
    const mp4 = Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex');
    const webm = Buffer.from(
      '1a45dfa39f4286810142f7810142f2810442f381084282847765626d42878102',
      'hex',
    );
    await expect(inspector.detect(mp4)).resolves.toBe('video/mp4');
    await expect(inspector.detect(webm)).resolves.toBe('video/webm');
  });

  it('rejects renamed executables, SVG with misleading MIME, and unknown bytes', async () => {
    const inspector = new MagicContentInspector();
    await expect(inspector.detect(Buffer.from('MZ executable called image.jpg'))).rejects.toThrow(
      ValidationAppError,
    );
    await expect(
      inspector.detect(Buffer.from('  <?xml version="1.0"?>\n<svg><script/></svg>')),
    ).rejects.toThrow(ValidationAppError);
    await expect(inspector.detect(Buffer.from('unknown content here'))).rejects.toThrow(
      ValidationAppError,
    );
  });
});

describe('safe image processing', () => {
  it('strips synthetic EXIF GPS from the canonical output and every derivative', async () => {
    const source = addSyntheticGpsExif(await image('jpeg'));
    expect((await sharp(source).metadata()).exif).toBeDefined();
    const result = await new SharpMediaProcessor(config).processImage(source, 'image/jpeg');
    expect((await sharp(result.original.body).metadata()).exif).toBeUndefined();
    for (const derivative of result.derivatives) {
      const processed = await sharp(derivative.body).metadata();
      expect(processed.exif).toBeUndefined();
      expect(processed.width).toBeGreaterThan(0);
      expect(processed.height).toBeGreaterThan(0);
    }
  });

  it('uses a deterministic derivative matrix, preserves aspect ratio, and never enlarges', async () => {
    const result = await new SharpMediaProcessor(config).processImage(
      await image('png', 200, 100),
      'image/png',
    );
    expect(result.derivatives.map(({ variant, format }) => ({ variant, format }))).toEqual(
      MEDIA_DERIVATIVE_PROFILE.map(({ variant, format }) => ({ variant, format })),
    );
    for (const derivative of result.derivatives) {
      expect(derivative.width).toBe(200);
      expect(derivative.height).toBe(100);
      expect(derivative.width / derivative.height).toBe(2);
      expect(derivative.checksum).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it('rejects excessive decoded dimensions before derivative processing', async () => {
    const limited = { ...config, maxDecodedPixels: 100, maxWidth: 100, maxHeight: 100 };
    await expect(
      new SharpMediaProcessor(limited).processImage(await image('png', 20, 20), 'image/png'),
    ).rejects.toThrow(ValidationAppError);
  });
});

describe('upload intent state', () => {
  it('is expiring, single-processing, owner-bound, and idempotently completed using a fake clock', async () => {
    let now = new Date('2026-08-06T12:00:00.000Z');
    const store = new InMemoryUploadIntentAdapter(() => now);
    const intent = {
      uploadId: randomUUID(),
      assetId: randomUUID(),
      ownerUserId: staff.userId,
      declaredMimeType: 'image/jpeg',
      declaredBytes: 10,
      visibility: 'PUBLIC',
      altTextByLocale: {},
      quarantineKey: `quarantine/${randomUUID()}/original`,
      expiresAt: new Date('2026-08-06T12:01:00.000Z'),
    } as const;
    await store.create(intent, 60);
    await expect(store.beginCompletion(intent.uploadId, otherStaff.userId)).resolves.toBeNull();
    await expect(store.beginCompletion(intent.uploadId, staff.userId)).resolves.toMatchObject({
      state: 'CLAIMED',
    });
    await expect(store.beginCompletion(intent.uploadId, staff.userId)).resolves.toMatchObject({
      state: 'PROCESSING',
    });
    await store.markCompleted(intent.uploadId, staff.userId, intent.assetId);
    await expect(store.beginCompletion(intent.uploadId, staff.userId)).resolves.toEqual({
      state: 'COMPLETED',
      assetId: intent.assetId,
    });
    now = new Date('2026-08-06T12:01:00.000Z');
    await expect(store.beginCompletion(intent.uploadId, staff.userId)).resolves.toBeNull();
  });
});

describe('media application service', () => {
  it('generates keys server-side, processes a valid upload once, and returns only safe public URLs', async () => {
    const harness = serviceHarness();
    const body = await image('jpeg');
    const intent = await harness.service.createUploadIntent(staff, {
      declaredMimeType: 'image/jpeg',
      declaredBytes: body.byteLength,
      visibility: 'PUBLIC',
      altTextByLocale: { fa: 'شیشه عسل', en: 'Honey jar' },
    });
    const key = intent.upload.fields['key'];
    expect(key).toMatch(/^quarantine\/[0-9a-f-]+\/original$/u);
    expect(key).not.toContain('filename');
    if (key === undefined) throw new Error('Authorization key is missing.');
    await putQuarantine(harness.storage, key, body, 'image/jpeg');
    const asset = await harness.service.completeUpload(staff, intent.uploadId, metadata);
    expect(asset.id).toBe(intent.assetId);
    expect(asset.url).toBe(
      `https://media.example.invalid/honey-media/media/${asset.id}/original.jpg`,
    );
    expect(asset.derivatives).toHaveLength(4);
    expect(new Set(asset.derivatives.map((value) => `${value.variant}:${value.format}`)).size).toBe(
      4,
    );
    expect(harness.repository.createCalls).toBe(1);
    expect(await harness.storage.objectExists('private', key)).toBe(false);
    const retry = await harness.service.completeUpload(staff, intent.uploadId, metadata);
    expect(retry.id).toBe(asset.id);
    expect(harness.repository.createCalls).toBe(1);
    expect(JSON.stringify(harness.audit.entries)).not.toMatch(/X-Amz|https?:|credential/iu);
  });

  it('blocks customer use and prevents another staff principal completing an intent', async () => {
    const harness = serviceHarness();
    await expect(
      harness.service.createUploadIntent(customer, {
        declaredMimeType: 'image/jpeg',
        declaredBytes: 10,
        visibility: 'PUBLIC',
        altTextByLocale: {},
      }),
    ).rejects.toThrow(ForbiddenAppError);
    const intent = await harness.service.createUploadIntent(staff, {
      declaredMimeType: 'image/jpeg',
      declaredBytes: 10,
      visibility: 'PUBLIC',
      altTextByLocale: {},
    });
    await expect(
      harness.service.completeUpload(otherStaff, intent.uploadId, metadata),
    ).rejects.toThrow(NotFoundAppError);
  });

  it('deletes invalid executable and SVG uploads from quarantine', async () => {
    for (const body of [
      Buffer.from('MZ executable called photo.jpg'),
      Buffer.from('  <?xml version="1.0"?><svg/>'),
    ]) {
      const harness = serviceHarness();
      const intent = await harness.service.createUploadIntent(staff, {
        declaredMimeType: 'image/jpeg',
        declaredBytes: body.byteLength,
        visibility: 'PUBLIC',
        altTextByLocale: {},
      });
      const key = intent.upload.fields['key'];
      if (key === undefined) throw new Error('Authorization key is missing.');
      await putQuarantine(harness.storage, key, body, 'image/jpeg');
      await expect(
        harness.service.completeUpload(staff, intent.uploadId, metadata),
      ).rejects.toThrow(ValidationAppError);
      expect(await harness.storage.objectExists('private', key)).toBe(false);
      expect(harness.repository.assets.size).toBe(0);
    }
  });

  it('rejects oversized image and video objects using actual stored bytes', async () => {
    for (const [mimeType, maximum] of [
      ['image/jpeg', 16],
      ['video/mp4', 24],
    ] as const) {
      const limited = {
        ...config,
        maxImageBytes: mimeType === 'image/jpeg' ? maximum : config.maxImageBytes,
        maxVideoBytes: mimeType === 'video/mp4' ? maximum : config.maxVideoBytes,
      };
      const harness = serviceHarness({ config: limited });
      const intent = await harness.service.createUploadIntent(staff, {
        declaredMimeType: mimeType,
        declaredBytes: maximum,
        visibility: 'PRIVATE',
        altTextByLocale: {},
      });
      const key = intent.upload.fields['key'];
      if (key === undefined) throw new Error('Authorization key is missing.');
      await putQuarantine(harness.storage, key, new Uint8Array(maximum + 1), mimeType);
      await expect(
        harness.service.completeUpload(staff, intent.uploadId, metadata),
      ).rejects.toThrow(ValidationAppError);
      expect(await harness.storage.objectExists('private', key)).toBe(false);
    }
  });

  it('supports Persian and English alt text, rejects markup and invalid locales', async () => {
    expect(normalizeAltText({ fa: 'عسل کوهی', en: 'Mountain honey' })).toEqual({
      fa: 'عسل کوهی',
      en: 'Mountain honey',
    });
    expect(() => normalizeAltText({ 'bad_locale!': 'Text' })).toThrow();
    expect(() => normalizeAltText({ en: '<script>alert(1)</script>' })).toThrow();
  });

  it('signs only a persisted private asset and never accepts an arbitrary private key', async () => {
    const harness = serviceHarness();
    const body = await image('webp');
    const intent = await harness.service.createUploadIntent(staff, {
      declaredMimeType: 'image/webp',
      declaredBytes: body.byteLength,
      visibility: 'PRIVATE',
      altTextByLocale: {},
    });
    const key = intent.upload.fields['key'];
    if (key === undefined) throw new Error('Authorization key is missing.');
    await putQuarantine(harness.storage, key, body, 'image/webp');
    const asset = await harness.service.completeUpload(staff, intent.uploadId, metadata);
    expect(asset.url).toBeNull();
    expect(asset.derivatives.every((derivative) => derivative.url === null)).toBe(true);
    const signed = await harness.service.createPrivateDownload(staff, asset.id);
    expect(signed.url).toContain(encodeURIComponent(`private/${asset.id}/original.webp`));
    await expect(harness.service.createPrivateDownload(staff, randomUUID())).rejects.toThrow(
      NotFoundAppError,
    );
  });
});
