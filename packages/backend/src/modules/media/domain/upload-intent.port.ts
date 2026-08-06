import type { AltTextByLocale, MediaMimeType, MediaVisibility } from './media.js';

export type UploadIntent = Readonly<{
  uploadId: string;
  assetId: string;
  ownerUserId: string;
  declaredMimeType: MediaMimeType;
  declaredBytes: number;
  visibility: MediaVisibility;
  altTextByLocale: AltTextByLocale;
  quarantineKey: string;
  expiresAt: Date;
}>;

export type UploadIntentCompletion =
  | Readonly<{ state: 'CLAIMED'; intent: UploadIntent }>
  | Readonly<{ state: 'PROCESSING'; intent: UploadIntent }>
  | Readonly<{ state: 'COMPLETED'; assetId: string }>;

export interface UploadIntentStore {
  create(intent: UploadIntent, ttlSeconds: number): Promise<void>;
  beginCompletion(uploadId: string, ownerUserId: string): Promise<UploadIntentCompletion | null>;
  markCompleted(uploadId: string, ownerUserId: string, assetId: string): Promise<void>;
  close(): Promise<void>;
}
