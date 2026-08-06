import type { DerivativeVariant, ImageMimeType } from './media.js';

export type ProcessedMediaObject = Readonly<{
  body: Uint8Array;
  mimeType: ImageMimeType | 'image/jpeg' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp' | 'avif';
  width: number;
  height: number;
  bytes: number;
  checksum: string;
}>;

export type ProcessedDerivative = Omit<ProcessedMediaObject, 'extension' | 'mimeType'> &
  Readonly<{
    variant: DerivativeVariant;
    format: 'webp' | 'jpg';
    mimeType: 'image/webp' | 'image/jpeg';
    extension: 'webp' | 'jpg';
  }>;

export type ProcessedImage = Readonly<{
  original: ProcessedMediaObject;
  derivatives: readonly ProcessedDerivative[];
}>;

export interface MediaProcessor {
  processImage(input: Uint8Array, mimeType: ImageMimeType): Promise<ProcessedImage>;
}
