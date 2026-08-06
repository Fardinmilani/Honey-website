import { createHash } from 'node:crypto';

import sharp, { type Metadata, type Sharp } from 'sharp';

import { ValidationAppError } from '../../../errors/index.js';
import { MEDIA_DERIVATIVE_PROFILE, type ImageMimeType, type MediaConfig } from '../domain/media.js';
import type {
  MediaProcessor,
  ProcessedDerivative,
  ProcessedImage,
  ProcessedMediaObject,
} from '../domain/media-processor.port.js';

sharp.cache({ files: 0, items: 16, memory: 64 });
sharp.concurrency(1);

function checksum(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}

function fail(code: string): never {
  throw new ValidationAppError([{ path: 'upload', code }]);
}

function orientedDimensions(
  width: number,
  height: number,
  orientation: number | undefined,
): Readonly<{ width: number; height: number }> {
  return orientation !== undefined && orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height };
}

function canonicalPipeline(pipeline: Sharp, mimeType: ImageMimeType): Sharp {
  switch (mimeType) {
    case 'image/jpeg':
      return pipeline.jpeg({ quality: 90, chromaSubsampling: '4:4:4', progressive: true });
    case 'image/png':
      return pipeline.png({ compressionLevel: 9, palette: false, progressive: false });
    case 'image/webp':
      return pipeline.webp({ quality: 90, effort: 4 });
    case 'image/avif':
      return pipeline.avif({ quality: 58, effort: 4, chromaSubsampling: '4:4:4' });
  }
}

function extensionFor(mimeType: ImageMimeType): 'avif' | 'jpg' | 'png' | 'webp' {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
  }
}

async function describe<
  MimeType extends ProcessedMediaObject['mimeType'],
  Extension extends ProcessedMediaObject['extension'],
>(
  body: Uint8Array,
  mimeType: MimeType,
  extension: Extension,
): Promise<
  Omit<ProcessedMediaObject, 'extension' | 'mimeType'> &
    Readonly<{ mimeType: MimeType; extension: Extension }>
> {
  const metadata = await sharp(body, { failOn: 'error', limitInputPixels: false }).metadata();
  if (metadata.width === undefined || metadata.height === undefined)
    fail('MEDIA_DIMENSIONS_INVALID');
  return {
    body,
    mimeType,
    extension,
    width: metadata.width,
    height: metadata.height,
    bytes: body.byteLength,
    checksum: checksum(body),
  };
}

export class SharpMediaProcessor implements MediaProcessor {
  constructor(private readonly config: MediaConfig) {}

  async processImage(input: Uint8Array, mimeType: ImageMimeType): Promise<ProcessedImage> {
    let metadata: Metadata;
    try {
      metadata = await sharp(input, {
        failOn: 'error',
        limitInputPixels: this.config.maxDecodedPixels,
        sequentialRead: true,
      }).metadata();
    } catch {
      fail('MEDIA_IMAGE_DECODE_FAILED');
    }
    if (
      metadata.width === undefined ||
      metadata.height === undefined ||
      (metadata.pages ?? 1) !== 1
    ) {
      fail('MEDIA_DIMENSIONS_INVALID');
    }
    const dimensions = orientedDimensions(metadata.width, metadata.height, metadata.orientation);
    if (
      dimensions.width > this.config.maxWidth ||
      dimensions.height > this.config.maxHeight ||
      dimensions.width * dimensions.height > this.config.maxDecodedPixels
    ) {
      fail('MEDIA_DIMENSIONS_EXCEEDED');
    }

    let originalBody: Uint8Array;
    try {
      originalBody = await canonicalPipeline(
        sharp(input, {
          failOn: 'error',
          limitInputPixels: this.config.maxDecodedPixels,
          sequentialRead: true,
        }).rotate(),
        mimeType,
      ).toBuffer();
    } catch {
      fail('MEDIA_IMAGE_PROCESSING_FAILED');
    }
    const original = await describe(originalBody, mimeType, extensionFor(mimeType));
    const derivatives: ProcessedDerivative[] = [];
    for (const profile of MEDIA_DERIVATIVE_PROFILE) {
      let pipeline = sharp(input, {
        failOn: 'error',
        limitInputPixels: this.config.maxDecodedPixels,
        sequentialRead: true,
      })
        .rotate()
        .resize({ width: profile.width, fit: 'inside', withoutEnlargement: true });
      if (profile.format === 'jpg') {
        pipeline = pipeline
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: profile.quality, chromaSubsampling: '4:4:4', progressive: true });
      } else {
        pipeline = pipeline.webp({ quality: profile.quality, effort: 4 });
      }
      const body = await pipeline.toBuffer();
      const described = await describe(
        body,
        profile.format === 'jpg' ? 'image/jpeg' : 'image/webp',
        profile.format,
      );
      derivatives.push({ ...described, variant: profile.variant, format: profile.format });
    }
    return { original, derivatives };
  }
}
