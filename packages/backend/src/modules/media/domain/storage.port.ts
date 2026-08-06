export type StorageBucket = 'public' | 'private';

export type StoredObjectMetadata = Readonly<{
  bucket: StorageBucket;
  key: string;
  bytes: number;
  contentType: string | null;
  versionTag: string | null;
  lastModified: Date | null;
  metadata: Readonly<Record<string, string>>;
}>;

export type DirectUploadAuthorization = Readonly<{
  method: 'POST';
  url: string;
  fields: Readonly<Record<string, string>>;
  expiresAt: Date;
}>;

export type TrustedObjectInput = Readonly<{
  bucket: StorageBucket;
  key: string;
  body: Uint8Array;
  contentType: string;
  cacheControl: string;
  contentDisposition: 'inline';
  metadata?: Readonly<Record<string, string>>;
}>;

export interface StorageService {
  createDirectUploadAuthorization(
    input: Readonly<{
      bucket: StorageBucket;
      key: string;
      contentType: string;
      maximumBytes: number;
      expiresInSeconds: number;
    }>,
  ): Promise<DirectUploadAuthorization>;
  inspectObject(bucket: StorageBucket, key: string): Promise<StoredObjectMetadata | null>;
  readObjectRange(
    bucket: StorageBucket,
    key: string,
    start: number,
    endInclusive: number,
    versionTag?: string,
  ): Promise<Uint8Array>;
  readObject(
    bucket: StorageBucket,
    key: string,
    maximumBytes: number,
    versionTag?: string,
  ): Promise<Uint8Array>;
  putTrustedObject(input: TrustedObjectInput): Promise<StoredObjectMetadata>;
  copyObject(
    source: Readonly<{ bucket: StorageBucket; key: string }>,
    destination: Readonly<{ bucket: StorageBucket; key: string }>,
  ): Promise<void>;
  deleteObject(bucket: StorageBucket, key: string): Promise<void>;
  objectExists(bucket: StorageBucket, key: string): Promise<boolean>;
  createSignedDownloadUrl(
    bucket: 'private',
    key: string,
    expiresInSeconds: number,
  ): Promise<Readonly<{ url: string; expiresAt: Date }>>;
  close(): Promise<void>;
}

const KEY_PATTERN = /^(?!\/)(?!.*(?:\\|\.\.))(?!.*\/\/)[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/u;

export function assertStorageKey(key: string): void {
  if (
    !KEY_PATTERN.test(key) ||
    /(?:^|\/)hero(?:\/|$)|honey-scroll|honey-poster|hero-start|hero-end/iu.test(key)
  ) {
    throw new TypeError('Storage keys must be safe server-generated non-Hero paths.');
  }
}
