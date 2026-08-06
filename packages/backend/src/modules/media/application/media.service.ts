import { createHash, randomUUID } from 'node:crypto';

import {
  ConflictAppError,
  DependencyUnavailableAppError,
  ForbiddenAppError,
  NotFoundAppError,
  ValidationAppError,
} from '../../../errors/index.js';
import type { AuthenticatedPrincipal, RequestMetadata } from '../../identity/index.js';
import type { ContentInspector } from '../domain/content-inspector.port.js';
import {
  isImageMimeType,
  isMediaMimeType,
  isVideoMimeType,
  normalizeAltText,
  type AltTextByLocale,
  type MediaAsset,
  type MediaConfig,
  type MediaMimeType,
  type MediaVisibility,
} from '../domain/media.js';
import type {
  MediaRepository,
  PersistedAssetInput,
  PersistedDerivativeInput,
} from '../domain/media-repository.port.js';
import type { MediaAuditInput, MediaAuditPort } from '../domain/media-audit.port.js';
import type { MediaProcessor } from '../domain/media-processor.port.js';
import type { StorageService, TrustedObjectInput } from '../domain/storage.port.js';
import type { UploadIntent, UploadIntentStore } from '../domain/upload-intent.port.js';

export type CreateUploadIntentCommand = Readonly<{
  declaredMimeType: string;
  declaredBytes: number;
  visibility: MediaVisibility;
  altTextByLocale: Readonly<Record<string, string>>;
}>;

export type UploadIntentResult = Readonly<{
  uploadId: string;
  assetId: string;
  expiresAt: string;
  upload: Readonly<{
    method: 'POST';
    url: string;
    fields: Readonly<Record<string, string>>;
    expiresAt: string;
  }>;
}>;

export type PrivateDownloadResult = Readonly<{ url: string; expiresAt: string }>;

type MediaServiceDependencies = Readonly<{
  config: MediaConfig;
  storage: StorageService;
  intents: UploadIntentStore;
  repository: MediaRepository;
  inspector: ContentInspector;
  processor: MediaProcessor;
  audit: MediaAuditPort;
  now?: () => Date;
}>;

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
const PRIVATE_CACHE = 'private, no-store';

function validation(path: string, code: string): ValidationAppError {
  return new ValidationAppError([{ path, code }]);
}

function audit(
  principal: AuthenticatedPrincipal,
  metadata: RequestMetadata,
  action: MediaAuditInput['action'],
  assetId: string,
): MediaAuditInput {
  return {
    actorUserId: principal.userId,
    action,
    assetId,
    requestId: metadata.requestId,
    ...(metadata.clientIp === undefined ? {} : { clientIp: metadata.clientIp }),
  };
}

function assertStaff(principal: AuthenticatedPrincipal): void {
  if (principal.kind !== 'STAFF') throw new ForbiddenAppError({ code: 'STAFF_REQUIRED' });
}

function extensionFor(mimeType: MediaMimeType): 'avif' | 'jpg' | 'mp4' | 'png' | 'webm' | 'webp' {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
    case 'video/mp4':
      return 'mp4';
    case 'video/webm':
      return 'webm';
  }
}

function sha256(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}

export class MediaService {
  readonly #now: () => Date;

  constructor(private readonly dependencies: MediaServiceDependencies) {
    this.#now = dependencies.now ?? (() => new Date());
  }

  async createUploadIntent(
    principal: AuthenticatedPrincipal,
    command: CreateUploadIntentCommand,
  ): Promise<UploadIntentResult> {
    assertStaff(principal);
    if (!isMediaMimeType(command.declaredMimeType)) {
      throw validation('declaredMimeType', 'MEDIA_TYPE_NOT_ALLOWED');
    }
    const maximumBytes = isImageMimeType(command.declaredMimeType)
      ? this.dependencies.config.maxImageBytes
      : this.dependencies.config.maxVideoBytes;
    if (!Number.isSafeInteger(command.declaredBytes) || command.declaredBytes < 1) {
      throw validation('declaredBytes', 'MEDIA_SIZE_INVALID');
    }
    if (command.declaredBytes > maximumBytes) {
      throw validation('declaredBytes', 'MEDIA_SIZE_EXCEEDED');
    }

    let altTextByLocale: AltTextByLocale;
    try {
      altTextByLocale = normalizeAltText(command.altTextByLocale);
    } catch {
      throw validation('altTextByLocale', 'ALT_TEXT_INVALID');
    }

    const now = this.#now();
    const uploadId = randomUUID();
    const assetId = randomUUID();
    const quarantineKey = `quarantine/${uploadId}/original`;
    const expiresAt = new Date(
      now.getTime() + this.dependencies.config.uploadIntentTtlSeconds * 1_000,
    );
    const authorization = await this.dependencies.storage.createDirectUploadAuthorization({
      bucket: 'private',
      key: quarantineKey,
      contentType: command.declaredMimeType,
      maximumBytes: command.declaredBytes,
      expiresInSeconds: this.dependencies.config.presignedUploadTtlSeconds,
    });
    const intent: UploadIntent = {
      uploadId,
      assetId,
      ownerUserId: principal.userId,
      declaredMimeType: command.declaredMimeType,
      declaredBytes: command.declaredBytes,
      visibility: command.visibility,
      altTextByLocale,
      quarantineKey,
      expiresAt,
    };
    await this.dependencies.intents.create(intent, this.dependencies.config.uploadIntentTtlSeconds);
    return {
      uploadId,
      assetId,
      expiresAt: expiresAt.toISOString(),
      upload: {
        method: authorization.method,
        url: authorization.url,
        fields: authorization.fields,
        expiresAt: authorization.expiresAt.toISOString(),
      },
    };
  }

  async completeUpload(
    principal: AuthenticatedPrincipal,
    uploadId: string,
    metadata: RequestMetadata,
  ): Promise<MediaAsset> {
    assertStaff(principal);
    const completion = await this.dependencies.intents.beginCompletion(uploadId, principal.userId);
    if (completion === null) throw new NotFoundAppError({ code: 'UPLOAD_INTENT_NOT_FOUND' });
    if (completion.state === 'COMPLETED') return this.getAsset(principal, completion.assetId);
    if (completion.state === 'PROCESSING') {
      const existing = await this.dependencies.repository.findAsset(completion.intent.assetId);
      if (existing !== null) {
        await this.dependencies.audit.append(
          audit(principal, metadata, 'media.upload.completed', existing.id),
        );
        await this.dependencies.intents.markCompleted(uploadId, principal.userId, existing.id);
        await this.dependencies.storage.deleteObject('private', completion.intent.quarantineKey);
        return existing;
      }
      throw new ConflictAppError({ code: 'UPLOAD_ALREADY_PROCESSING', retryable: true });
    }

    const intent = completion.intent;
    const object = await this.dependencies.storage.inspectObject('private', intent.quarantineKey);
    if (object === null) throw new ConflictAppError({ code: 'UPLOAD_OBJECT_MISSING' });
    const maximumBytes = isImageMimeType(intent.declaredMimeType)
      ? this.dependencies.config.maxImageBytes
      : this.dependencies.config.maxVideoBytes;
    if (object.bytes < 1 || object.bytes > maximumBytes) {
      await this.#deleteInvalid(intent);
      throw validation('upload', 'MEDIA_SIZE_EXCEEDED');
    }

    let detectedMimeType: MediaMimeType;
    try {
      const prefix = await this.dependencies.storage.readObjectRange(
        'private',
        intent.quarantineKey,
        0,
        Math.min(object.bytes - 1, 8_191),
        object.versionTag ?? undefined,
      );
      detectedMimeType = await this.dependencies.inspector.detect(prefix);
    } catch (error) {
      await this.#deleteInvalid(intent);
      if (error instanceof ValidationAppError) throw error;
      throw validation('upload', 'MEDIA_CONTENT_INVALID');
    }
    if (detectedMimeType !== intent.declaredMimeType) {
      await this.#deleteInvalid(intent);
      throw validation('upload', 'MEDIA_CONTENT_MISMATCH');
    }

    const body = await this.dependencies.storage.readObject(
      'private',
      intent.quarantineKey,
      maximumBytes,
      object.versionTag ?? undefined,
    );
    let outputs: readonly TrustedObjectInput[] = [];
    try {
      const prepared = await this.#withProcessingTimeout(
        this.#prepareAsset(intent, detectedMimeType, body),
      );
      outputs = prepared.outputs;
      const stored: TrustedObjectInput[] = [];
      let persisted = false;
      try {
        for (const output of outputs) {
          await this.dependencies.storage.putTrustedObject(output);
          stored.push(output);
        }
        const asset = await this.dependencies.repository.createAsset(prepared.persistence);
        persisted = true;
        await this.dependencies.audit.append(
          audit(principal, metadata, 'media.upload.completed', intent.assetId),
        );
        await this.dependencies.intents.markCompleted(uploadId, principal.userId, asset.id);
        await this.dependencies.storage.deleteObject('private', intent.quarantineKey);
        return asset;
      } catch (error) {
        if (!persisted) {
          await Promise.allSettled(
            stored.map((storedObject) =>
              this.dependencies.storage.deleteObject(storedObject.bucket, storedObject.key),
            ),
          );
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof ValidationAppError) {
        await this.#deleteInvalid(intent);
        throw error;
      }
      if (error instanceof ConflictAppError || error instanceof NotFoundAppError) throw error;
      throw new DependencyUnavailableAppError({
        code: 'MEDIA_PROCESSING_FAILED',
        cause: error,
      });
    }
  }

  async getAsset(principal: AuthenticatedPrincipal, assetId: string): Promise<MediaAsset> {
    assertStaff(principal);
    const asset = await this.dependencies.repository.findAsset(assetId);
    if (asset === null) throw new NotFoundAppError({ code: 'MEDIA_ASSET_NOT_FOUND' });
    return asset;
  }

  async updateAltText(
    principal: AuthenticatedPrincipal,
    assetId: string,
    input: Readonly<Record<string, string>>,
    metadata: RequestMetadata,
  ): Promise<MediaAsset> {
    assertStaff(principal);
    let altTextByLocale: AltTextByLocale;
    try {
      altTextByLocale = normalizeAltText(input);
    } catch {
      throw validation('altTextByLocale', 'ALT_TEXT_INVALID');
    }
    const asset = await this.dependencies.repository.updateAltText(assetId, altTextByLocale);
    if (asset === null) throw new NotFoundAppError({ code: 'MEDIA_ASSET_NOT_FOUND' });
    await this.dependencies.audit.append(
      audit(principal, metadata, 'media.alt-text.updated', assetId),
    );
    return asset;
  }

  async createPrivateDownload(
    principal: AuthenticatedPrincipal,
    assetId: string,
  ): Promise<PrivateDownloadResult> {
    assertStaff(principal);
    const stored = await this.dependencies.repository.findAsset(assetId);
    if (stored === null || stored.visibility !== 'PRIVATE') {
      throw new NotFoundAppError({ code: 'MEDIA_ASSET_NOT_FOUND' });
    }
    const key = `private/${stored.id}/original.${extensionFor(stored.mimeType)}`;
    const result = await this.dependencies.storage.createSignedDownloadUrl(
      'private',
      key,
      this.dependencies.config.privateDownloadTtlSeconds,
    );
    return { url: result.url, expiresAt: result.expiresAt.toISOString() };
  }

  async deleteAsset(
    principal: AuthenticatedPrincipal,
    assetId: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    assertStaff(principal);
    await this.dependencies.audit.append(
      audit(principal, metadata, 'media.delete.requested', assetId),
    );
    const asset = await this.dependencies.repository.deleteUnattachedAsset(assetId);
    if (asset === null) throw new NotFoundAppError({ code: 'MEDIA_ASSET_NOT_FOUND' });
    const bucket = asset.visibility === 'PUBLIC' ? 'public' : 'private';
    const keys = [
      `${asset.visibility === 'PUBLIC' ? 'media' : 'private'}/${asset.id}/original.${extensionFor(asset.mimeType)}`,
      ...asset.derivatives.map((derivative) => {
        const prefix = asset.visibility === 'PUBLIC' ? 'media' : 'private';
        return `${prefix}/${asset.id}/${derivative.variant}-${derivative.width}.${derivative.format}`;
      }),
    ];
    const results = await Promise.allSettled(
      keys.map((key) => this.dependencies.storage.deleteObject(bucket, key)),
    );
    if (results.some((result) => result.status === 'rejected')) {
      throw new DependencyUnavailableAppError({ code: 'MEDIA_CLEANUP_FAILED' });
    }
  }

  async #prepareAsset(
    intent: UploadIntent,
    mimeType: MediaMimeType,
    body: Uint8Array,
  ): Promise<
    Readonly<{ outputs: readonly TrustedObjectInput[]; persistence: PersistedAssetInput }>
  > {
    const targetBucket = intent.visibility === 'PUBLIC' ? 'public' : 'private';
    const targetPrefix = intent.visibility === 'PUBLIC' ? 'media' : 'private';
    const cacheControl = intent.visibility === 'PUBLIC' ? IMMUTABLE_CACHE : PRIVATE_CACHE;
    if (isImageMimeType(mimeType)) {
      const processed = await this.dependencies.processor.processImage(body, mimeType);
      const originalKey = `${targetPrefix}/${intent.assetId}/original.${processed.original.extension}`;
      const outputs: TrustedObjectInput[] = [
        {
          bucket: targetBucket,
          key: originalKey,
          body: processed.original.body,
          contentType: processed.original.mimeType,
          cacheControl,
          contentDisposition: 'inline',
          metadata: { checksum: processed.original.checksum },
        },
      ];
      const derivatives: PersistedDerivativeInput[] = [];
      for (const derivative of processed.derivatives) {
        const key = `${targetPrefix}/${intent.assetId}/${derivative.variant}-${derivative.width}.${derivative.format}`;
        outputs.push({
          bucket: targetBucket,
          key,
          body: derivative.body,
          contentType: derivative.mimeType,
          cacheControl,
          contentDisposition: 'inline',
          metadata: { checksum: derivative.checksum },
        });
        derivatives.push({
          id: randomUUID(),
          variant: derivative.variant,
          format: derivative.format,
          mimeType: derivative.mimeType,
          width: derivative.width,
          height: derivative.height,
          bytes: derivative.bytes,
          checksum: derivative.checksum,
          storageKey: key,
        });
      }
      return {
        outputs,
        persistence: {
          id: intent.assetId,
          kind: 'IMAGE',
          visibility: intent.visibility,
          storageKey: originalKey,
          mimeType: processed.original.mimeType,
          bytes: processed.original.bytes,
          width: processed.original.width,
          height: processed.original.height,
          durationSeconds: null,
          checksum: processed.original.checksum,
          altTextByLocale: intent.altTextByLocale,
          createdBy: intent.ownerUserId,
          derivatives,
        },
      };
    }
    if (!isVideoMimeType(mimeType)) throw validation('upload', 'MEDIA_CONTENT_INVALID');
    const originalKey = `${targetPrefix}/${intent.assetId}/original.${extensionFor(mimeType)}`;
    const checksum = sha256(body);
    const original: TrustedObjectInput = {
      bucket: targetBucket,
      key: originalKey,
      body,
      contentType: mimeType,
      cacheControl,
      contentDisposition: 'inline',
      metadata: { checksum },
    };
    return {
      outputs: [original],
      persistence: {
        id: intent.assetId,
        kind: 'VIDEO',
        visibility: intent.visibility,
        storageKey: originalKey,
        mimeType,
        bytes: body.byteLength,
        width: null,
        height: null,
        durationSeconds: null,
        checksum,
        altTextByLocale: intent.altTextByLocale,
        createdBy: intent.ownerUserId,
        derivatives: [],
      },
    };
  }

  async #deleteInvalid(intent: UploadIntent): Promise<void> {
    try {
      await this.dependencies.storage.deleteObject('private', intent.quarantineKey);
    } catch (error) {
      throw new DependencyUnavailableAppError({ code: 'MEDIA_CLEANUP_FAILED', cause: error });
    }
  }

  async #withProcessingTimeout<Result>(operation: Promise<Result>): Promise<Result> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Media processing exceeded its bounded timeout.')),
        this.dependencies.config.processingTimeoutMs,
      );
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
