import { createHash } from 'node:crypto';

import {
  assertStorageKey,
  type DirectUploadAuthorization,
  type StorageBucket,
  type StorageService,
  type StoredObjectMetadata,
  type TrustedObjectInput,
} from '../domain/storage.port.js';

type MemoryObject = Readonly<{
  body: Uint8Array;
  contentType: string;
  cacheControl: string;
  contentDisposition: 'inline';
  versionTag: string;
  lastModified: Date;
  metadata: Readonly<Record<string, string>>;
}>;

function objectId(bucket: StorageBucket, key: string): string {
  return `${bucket}:${key}`;
}

function etag(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}

export class InMemoryStorageAdapter implements StorageService {
  readonly #objects = new Map<string, MemoryObject>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createDirectUploadAuthorization(
    input: Parameters<StorageService['createDirectUploadAuthorization']>[0],
  ): Promise<DirectUploadAuthorization> {
    assertStorageKey(input.key);
    if (input.maximumBytes < 1 || input.expiresInSeconds < 1) {
      throw new TypeError('Upload authorization limits must be positive.');
    }
    return {
      method: 'POST',
      url: `memory://storage/${input.bucket}`,
      fields: {
        key: input.key,
        'Content-Type': input.contentType,
        'x-memory-maximum-bytes': String(input.maximumBytes),
      },
      expiresAt: new Date(this.now().getTime() + input.expiresInSeconds * 1_000),
    };
  }

  async inspectObject(bucket: StorageBucket, key: string): Promise<StoredObjectMetadata | null> {
    assertStorageKey(key);
    const object = this.#objects.get(objectId(bucket, key));
    return object === undefined ? null : this.#metadata(bucket, key, object);
  }

  async readObjectRange(
    bucket: StorageBucket,
    key: string,
    start: number,
    endInclusive: number,
    versionTag?: string,
  ): Promise<Uint8Array> {
    const object = this.#required(bucket, key, versionTag);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(endInclusive) ||
      start < 0 ||
      endInclusive < start
    ) {
      throw new RangeError('Object range is invalid.');
    }
    return object.body.slice(start, Math.min(object.body.byteLength, endInclusive + 1));
  }

  async readObject(
    bucket: StorageBucket,
    key: string,
    maximumBytes: number,
    versionTag?: string,
  ): Promise<Uint8Array> {
    const object = this.#required(bucket, key, versionTag);
    if (object.body.byteLength > maximumBytes)
      throw new RangeError('Object exceeds the read limit.');
    return object.body.slice();
  }

  async putTrustedObject(input: TrustedObjectInput): Promise<StoredObjectMetadata> {
    assertStorageKey(input.key);
    const body = input.body.slice();
    const object: MemoryObject = {
      body,
      contentType: input.contentType,
      cacheControl: input.cacheControl,
      contentDisposition: input.contentDisposition,
      versionTag: etag(body),
      lastModified: this.now(),
      metadata: { ...(input.metadata ?? {}) },
    };
    this.#objects.set(objectId(input.bucket, input.key), object);
    return this.#metadata(input.bucket, input.key, object);
  }

  async copyObject(
    source: Readonly<{ bucket: StorageBucket; key: string }>,
    destination: Readonly<{ bucket: StorageBucket; key: string }>,
  ): Promise<void> {
    const object = this.#required(source.bucket, source.key);
    await this.putTrustedObject({
      bucket: destination.bucket,
      key: destination.key,
      body: object.body,
      contentType: object.contentType,
      cacheControl: object.cacheControl,
      contentDisposition: object.contentDisposition,
      metadata: object.metadata,
    });
  }

  async deleteObject(bucket: StorageBucket, key: string): Promise<void> {
    assertStorageKey(key);
    this.#objects.delete(objectId(bucket, key));
  }

  async objectExists(bucket: StorageBucket, key: string): Promise<boolean> {
    assertStorageKey(key);
    return this.#objects.has(objectId(bucket, key));
  }

  async createSignedDownloadUrl(
    bucket: 'private',
    key: string,
    expiresInSeconds: number,
  ): Promise<Readonly<{ url: string; expiresAt: Date }>> {
    this.#required(bucket, key);
    const expiresAt = new Date(this.now().getTime() + expiresInSeconds * 1_000);
    return {
      url: `memory://storage/private/${encodeURIComponent(key)}?expires=${expiresAt.getTime()}`,
      expiresAt,
    };
  }

  async close(): Promise<void> {}

  #required(bucket: StorageBucket, key: string, versionTag?: string): MemoryObject {
    assertStorageKey(key);
    const object = this.#objects.get(objectId(bucket, key));
    if (object === undefined) throw new Error('Stored object does not exist.');
    if (versionTag !== undefined && versionTag !== object.versionTag) {
      throw new Error('Stored object changed during the bounded read.');
    }
    return object;
  }

  #metadata(bucket: StorageBucket, key: string, object: MemoryObject): StoredObjectMetadata {
    return {
      bucket,
      key,
      bytes: object.body.byteLength,
      contentType: object.contentType,
      versionTag: object.versionTag,
      lastModified: new Date(object.lastModified),
      metadata: object.metadata,
    };
  }
}
