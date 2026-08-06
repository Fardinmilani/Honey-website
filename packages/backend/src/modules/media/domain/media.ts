export const MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
] as const;

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const;
export const MEDIA_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;
export const DERIVATIVE_VARIANTS = ['thumb', 'card', 'hero', 'og'] as const;

export type MediaMimeType = (typeof MEDIA_MIME_TYPES)[number];
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];
export type VideoMimeType = (typeof VIDEO_MIME_TYPES)[number];
export type MediaVisibility = (typeof MEDIA_VISIBILITIES)[number];
export type DerivativeVariant = (typeof DERIVATIVE_VARIANTS)[number];
export type MediaKind = 'IMAGE' | 'VIDEO';

export type AltTextByLocale = Readonly<Record<string, string>>;

export type MediaDerivative = Readonly<{
  id: string;
  variant: DerivativeVariant;
  format: 'webp' | 'jpg';
  mimeType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
  bytes: number;
  checksum: string;
  url: string | null;
}>;

export type MediaAsset = Readonly<{
  id: string;
  kind: MediaKind;
  visibility: MediaVisibility;
  mimeType: MediaMimeType;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  checksum: string;
  altTextByLocale: AltTextByLocale;
  url: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  derivatives: readonly MediaDerivative[];
}>;

export type MediaConfig = Readonly<{
  publicBaseUrl: string;
  maxImageBytes: number;
  maxVideoBytes: number;
  maxDecodedPixels: number;
  maxWidth: number;
  maxHeight: number;
  presignedUploadTtlSeconds: number;
  privateDownloadTtlSeconds: number;
  uploadIntentTtlSeconds: number;
  processingTimeoutMs: number;
}>;

export type DerivativeProfile = Readonly<{
  variant: DerivativeVariant;
  width: number;
  format: 'webp' | 'jpg';
  quality: number;
}>;

export const MEDIA_DERIVATIVE_PROFILE = [
  { variant: 'thumb', width: 320, format: 'webp', quality: 80 },
  { variant: 'card', width: 720, format: 'webp', quality: 82 },
  { variant: 'hero', width: 1440, format: 'webp', quality: 84 },
  { variant: 'og', width: 1200, format: 'jpg', quality: 86 },
] as const satisfies readonly DerivativeProfile[];

export function isMediaMimeType(value: string): value is MediaMimeType {
  return MEDIA_MIME_TYPES.some((mimeType) => mimeType === value);
}

export function isImageMimeType(value: MediaMimeType): value is ImageMimeType {
  return IMAGE_MIME_TYPES.some((mimeType) => mimeType === value);
}

export function isVideoMimeType(value: MediaMimeType): value is VideoMimeType {
  return VIDEO_MIME_TYPES.some((mimeType) => mimeType === value);
}

export function normalizeAltText(input: Readonly<Record<string, string>>): AltTextByLocale {
  const output: Record<string, string> = {};
  for (const [localeInput, textInput] of Object.entries(input)) {
    let locale: string;
    try {
      locale = Intl.getCanonicalLocales(localeInput)[0] ?? '';
    } catch {
      throw new TypeError('Alt text locale keys must be valid BCP-47 language tags.');
    }
    if (locale.length === 0 || locale.length > 35) {
      throw new TypeError('Alt text locale keys must be valid BCP-47 language tags.');
    }
    const text = textInput.normalize('NFC').trim();
    const length = Array.from(text).length;
    if (length === 0 || length > 300) {
      throw new TypeError('Alt text values must contain between 1 and 300 characters.');
    }
    if (
      /[<>]|&(?:#\d+|#x[\da-f]+|[a-z]+);/iu.test(text) ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)
    ) {
      throw new TypeError('Alt text values may not contain markup or control characters.');
    }
    if (output[locale] !== undefined) throw new TypeError('Alt text locale keys must be unique.');
    output[locale] = text;
  }
  return output;
}

export function canonicalPublicUrl(baseUrl: string, key: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(key.split('/').map(encodeURIComponent).join('/'), base).toString();
}
