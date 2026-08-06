import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import {
  assertStorageKey,
  type DirectUploadAuthorization,
  type StorageBucket,
  type StorageService,
  type StoredObjectMetadata,
  type TrustedObjectInput,
} from '../domain/storage.port.js';

export type S3StorageConfig = Readonly<{
  internalEndpoint: string;
  browserEndpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicBucket: string;
  privateBucket: string;
  requestTimeoutMs: number;
}>;

function isNotFound(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  if ('name' in error && (error.name === 'NotFound' || error.name === 'NoSuchKey')) return true;
  if ('$metadata' in error && error.$metadata !== null && typeof error.$metadata === 'object') {
    return (
      'httpStatusCode' in error.$metadata &&
      (error.$metadata.httpStatusCode === 404 || error.$metadata.httpStatusCode === 403)
    );
  }
  return false;
}

function safeByteCount(value: number | undefined): number {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Storage returned an invalid object byte count.');
  }
  return value;
}

function versionTag(value: string | undefined): string | null {
  return value?.replace(/^"|"$/gu, '') ?? null;
}

function copySource(bucket: string, key: string): string {
  return `${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export class S3StorageAdapter implements StorageService {
  readonly #internal: S3Client;
  readonly #browser: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    const internalEndpoint = new URL(config.internalEndpoint);
    const browserEndpoint = new URL(config.browserEndpoint);
    if (
      !['http:', 'https:'].includes(internalEndpoint.protocol) ||
      !['http:', 'https:'].includes(browserEndpoint.protocol)
    ) {
      throw new TypeError('S3 endpoints must use HTTP or HTTPS.');
    }
    const base = {
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: config.forcePathStyle,
      maxAttempts: 2,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: config.requestTimeoutMs,
        requestTimeout: config.requestTimeoutMs,
      }),
    };
    this.#internal = new S3Client({ ...base, endpoint: config.internalEndpoint });
    this.#browser = new S3Client({ ...base, endpoint: config.browserEndpoint });
  }

  async createDirectUploadAuthorization(
    input: Parameters<StorageService['createDirectUploadAuthorization']>[0],
  ): Promise<DirectUploadAuthorization> {
    assertStorageKey(input.key);
    if (input.maximumBytes < 1 || input.expiresInSeconds < 1) {
      throw new TypeError('Upload authorization limits must be positive.');
    }
    const bucket = this.#bucket(input.bucket);
    const result = await createPresignedPost(this.#browser, {
      Bucket: bucket,
      Key: input.key,
      Expires: input.expiresInSeconds,
      Fields: { 'Content-Type': input.contentType },
      Conditions: [
        ['content-length-range', 1, input.maximumBytes],
        ['eq', '$key', input.key],
        ['eq', '$Content-Type', input.contentType],
      ],
    });
    return {
      method: 'POST',
      url: result.url,
      fields: result.fields,
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000),
    };
  }

  async inspectObject(
    bucketKind: StorageBucket,
    key: string,
  ): Promise<StoredObjectMetadata | null> {
    assertStorageKey(key);
    const bucket = this.#bucket(bucketKind);
    try {
      const result = await this.#internal.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return {
        bucket: bucketKind,
        key,
        bytes: safeByteCount(result.ContentLength),
        contentType: result.ContentType ?? null,
        versionTag: versionTag(result.ETag),
        lastModified: result.LastModified ?? null,
        metadata: { ...(result.Metadata ?? {}) },
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async readObjectRange(
    bucketKind: StorageBucket,
    key: string,
    start: number,
    endInclusive: number,
    expectedVersionTag?: string,
  ): Promise<Uint8Array> {
    assertStorageKey(key);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(endInclusive) ||
      start < 0 ||
      endInclusive < start
    ) {
      throw new RangeError('Object range is invalid.');
    }
    const result = await this.#internal.send(
      new GetObjectCommand({
        Bucket: this.#bucket(bucketKind),
        Key: key,
        Range: `bytes=${start}-${endInclusive}`,
        ...(expectedVersionTag === undefined ? {} : { IfMatch: expectedVersionTag }),
      }),
    );
    if (result.Body === undefined) throw new Error('Storage returned an empty object body.');
    const body = await result.Body.transformToByteArray();
    const maximum = endInclusive - start + 1;
    if (body.byteLength > maximum) throw new RangeError('Storage range exceeded its bound.');
    return body;
  }

  async readObject(
    bucketKind: StorageBucket,
    key: string,
    maximumBytes: number,
    expectedVersionTag?: string,
  ): Promise<Uint8Array> {
    assertStorageKey(key);
    const result = await this.#internal.send(
      new GetObjectCommand({
        Bucket: this.#bucket(bucketKind),
        Key: key,
        ...(expectedVersionTag === undefined ? {} : { IfMatch: expectedVersionTag }),
      }),
    );
    if (result.Body === undefined) throw new Error('Storage returned an empty object body.');
    if (result.ContentLength !== undefined && result.ContentLength > maximumBytes) {
      throw new RangeError('Object exceeds the read limit.');
    }
    const reader = result.Body.transformToWebStream().getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > maximumBytes) throw new RangeError('Object exceeds the read limit.');
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  }

  async putTrustedObject(input: TrustedObjectInput): Promise<StoredObjectMetadata> {
    assertStorageKey(input.key);
    const bucket = this.#bucket(input.bucket);
    const result = await this.#internal.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.body,
        ContentLength: input.body.byteLength,
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
        ContentDisposition: input.contentDisposition,
        Metadata: { ...(input.metadata ?? {}) },
      }),
    );
    return {
      bucket: input.bucket,
      key: input.key,
      bytes: input.body.byteLength,
      contentType: input.contentType,
      versionTag: versionTag(result.ETag),
      lastModified: new Date(),
      metadata: { ...(input.metadata ?? {}) },
    };
  }

  async copyObject(
    source: Readonly<{ bucket: StorageBucket; key: string }>,
    destination: Readonly<{ bucket: StorageBucket; key: string }>,
  ): Promise<void> {
    assertStorageKey(source.key);
    assertStorageKey(destination.key);
    await this.#internal.send(
      new CopyObjectCommand({
        Bucket: this.#bucket(destination.bucket),
        Key: destination.key,
        CopySource: copySource(this.#bucket(source.bucket), source.key),
      }),
    );
  }

  async deleteObject(bucket: StorageBucket, key: string): Promise<void> {
    assertStorageKey(key);
    await this.#internal.send(new DeleteObjectCommand({ Bucket: this.#bucket(bucket), Key: key }));
  }

  async objectExists(bucket: StorageBucket, key: string): Promise<boolean> {
    return (await this.inspectObject(bucket, key)) !== null;
  }

  async createSignedDownloadUrl(
    bucketKind: 'private',
    key: string,
    expiresInSeconds: number,
  ): Promise<Readonly<{ url: string; expiresAt: Date }>> {
    assertStorageKey(key);
    if (expiresInSeconds < 1) throw new TypeError('Signed URL expiry must be positive.');
    const exists = await this.objectExists(bucketKind, key);
    if (!exists) throw new Error('Private object does not exist.');
    const url = await getSignedUrl(
      this.#browser,
      new GetObjectCommand({ Bucket: this.#bucket(bucketKind), Key: key }),
      { expiresIn: expiresInSeconds },
    );
    return { url, expiresAt: new Date(Date.now() + expiresInSeconds * 1_000) };
  }

  async close(): Promise<void> {
    this.#internal.destroy();
    this.#browser.destroy();
  }

  #bucket(bucket: StorageBucket): string {
    return bucket === 'public' ? this.config.publicBucket : this.config.privateBucket;
  }
}
