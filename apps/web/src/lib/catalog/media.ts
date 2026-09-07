import type { PublicProduct } from './api';

export type PublicCatalogMedia = PublicProduct['media'][number];

/**
 * Prefer THUMBNAIL, then first GALLERY image for card/list thumbnails.
 */
export function pickThumbnail(
  media: readonly PublicCatalogMedia[],
): PublicCatalogMedia | undefined {
  const thumbnail = media.find((item) => item.role === 'THUMBNAIL' && item.kind === 'IMAGE');
  if (thumbnail !== undefined) {
    return thumbnail;
  }
  return media.find((item) => item.role === 'GALLERY' && item.kind === 'IMAGE');
}

/**
 * Gallery-ready images in display order (GALLERY, LIFESTYLE, THUMBNAIL).
 * VIDEO entries are handled separately in the gallery component.
 */
export function pickGalleryImages(media: readonly PublicCatalogMedia[]): PublicCatalogMedia[] {
  return [...media]
    .filter(
      (item) =>
        item.kind === 'IMAGE' &&
        (item.role === 'GALLERY' || item.role === 'LIFESTYLE' || item.role === 'THUMBNAIL'),
    )
    .sort((a, b) => a.position - b.position);
}

/**
 * Resolves a catalog media URL for next/image. API responses are usually
 * absolute; relative keys are joined against PUBLIC_MEDIA_BASE_URL.
 */
export function publicImageSrc(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const base =
    process.env['PUBLIC_MEDIA_BASE_URL']?.trim() ||
    process.env['NEXT_PUBLIC_MEDIA_BASE_URL']?.trim();
  if (base === undefined || base === '') {
    return url;
  }
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const path = url.startsWith('/') ? url.slice(1) : url;
  return new URL(path, normalizedBase).href;
}
