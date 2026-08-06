import type {
  AltTextByLocale,
  DerivativeVariant,
  MediaAsset,
  MediaKind,
  MediaMimeType,
  MediaVisibility,
} from './media.js';

export type PersistedDerivativeInput = Readonly<{
  id: string;
  variant: DerivativeVariant;
  format: 'webp' | 'jpg';
  mimeType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
  bytes: number;
  checksum: string;
  storageKey: string;
}>;

export type PersistedAssetInput = Readonly<{
  id: string;
  kind: MediaKind;
  visibility: MediaVisibility;
  storageKey: string;
  mimeType: MediaMimeType;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  checksum: string;
  altTextByLocale: AltTextByLocale;
  createdBy: string;
  derivatives: readonly PersistedDerivativeInput[];
}>;

export interface MediaRepository {
  createAsset(input: PersistedAssetInput): Promise<MediaAsset>;
  findAsset(assetId: string): Promise<MediaAsset | null>;
  findAssets(assetIds: readonly string[]): Promise<readonly MediaAsset[]>;
  updateAltText(assetId: string, altTextByLocale: AltTextByLocale): Promise<MediaAsset | null>;
  deleteUnattachedAsset(assetId: string): Promise<MediaAsset | null>;
  close(): Promise<void>;
}
