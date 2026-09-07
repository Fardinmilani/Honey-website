'use client';

import { createTranslator, type Locale } from '@honey/i18n';
import { VisuallyHidden, cx } from '@honey/ui';
import Image from 'next/image';
import { useCallback, useId, useState, type KeyboardEvent } from 'react';

import type { PublicCatalogMedia } from '../../lib/catalog/media';
import { pickGalleryImages, publicImageSrc } from '../../lib/catalog/media';

type ProductGalleryProps = {
  readonly media: readonly PublicCatalogMedia[];
  readonly productName: string;
  readonly locale: Locale;
};

type GallerySlide =
  | { readonly kind: 'image'; readonly item: PublicCatalogMedia }
  | {
      readonly kind: 'video';
      readonly item: PublicCatalogMedia;
      readonly poster?: PublicCatalogMedia;
    };

function buildSlides(media: readonly PublicCatalogMedia[]): GallerySlide[] {
  const images = pickGalleryImages(media);
  const videos = media.filter((item) => item.kind === 'VIDEO' || item.role === 'VIDEO');
  const slides: GallerySlide[] = images.map((item) => ({ kind: 'image', item }));

  for (const video of videos.sort((a, b) => a.position - b.position)) {
    const poster = images.find((image) => image.role === 'THUMBNAIL') ?? images[0];
    slides.push({
      kind: 'video',
      item: video,
      ...(poster !== undefined ? { poster } : {}),
    });
  }

  return slides;
}

export function ProductGallery({ media, productName, locale }: ProductGalleryProps) {
  const t = createTranslator(locale);
  const slides = buildSlides(media);
  const [activeIndex, setActiveIndex] = useState(0);
  const galleryId = useId();
  const mainId = `${galleryId}-main`;

  const selectSlide = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const onThumbKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        const next = (index + 1) % slides.length;
        setActiveIndex(next);
        document.getElementById(`${galleryId}-thumb-${next}`)?.focus();
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        const prev = (index - 1 + slides.length) % slides.length;
        setActiveIndex(prev);
        document.getElementById(`${galleryId}-thumb-${prev}`)?.focus();
      }
      if (event.key === 'Home') {
        event.preventDefault();
        setActiveIndex(0);
        document.getElementById(`${galleryId}-thumb-0`)?.focus();
      }
      if (event.key === 'End') {
        event.preventDefault();
        const last = slides.length - 1;
        setActiveIndex(last);
        document.getElementById(`${galleryId}-thumb-${last}`)?.focus();
      }
    },
    [galleryId, slides.length],
  );

  if (slides.length === 0) {
    return <div className="product-gallery product-gallery--empty" />;
  }

  const active = slides[activeIndex] ?? slides[0];
  if (active === undefined) {
    return null;
  }

  return (
    <div className="product-gallery" role="region" aria-labelledby={mainId}>
      <div className="product-gallery__main">
        <p id={mainId} className="visually-hidden">
          {productName}
        </p>
        {active.kind === 'image' ? (
          <Image
            src={publicImageSrc(active.item.url)}
            alt={active.item.altText}
            fill
            sizes="(max-width: 48rem) 100vw, 50vw"
            className="product-gallery__image"
            priority={activeIndex === 0}
          />
        ) : active.poster !== undefined ? (
          <Image
            src={publicImageSrc(active.poster.url)}
            alt={active.poster.altText}
            fill
            sizes="(max-width: 48rem) 100vw, 50vw"
            className="product-gallery__image"
            priority={activeIndex === 0}
          />
        ) : (
          <div className="product-gallery__video-fallback" aria-hidden="true" />
        )}
      </div>
      {slides.length > 1 ? (
        <div
          className="product-gallery__thumbs"
          role="tablist"
          aria-label={t('accessibility.galleryThumbnails')}
        >
          {slides.map((slide, index) => {
            const isSelected = index === activeIndex;
            const thumbSrc =
              slide.kind === 'image'
                ? publicImageSrc(slide.item.url)
                : slide.poster !== undefined
                  ? publicImageSrc(slide.poster.url)
                  : undefined;

            return (
              <button
                key={slide.item.id}
                id={`${galleryId}-thumb-${index}`}
                type="button"
                role="tab"
                className={cx(
                  'product-gallery__thumb',
                  isSelected ? 'product-gallery__thumb--selected' : undefined,
                )}
                aria-selected={isSelected}
                aria-controls={`${galleryId}-panel-${index}`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => selectSlide(index)}
                onKeyDown={(event) => onThumbKeyDown(event, index)}
              >
                {thumbSrc !== undefined ? (
                  <Image
                    src={thumbSrc}
                    alt=""
                    fill
                    sizes="80px"
                    className="product-gallery__thumb-image"
                    loading={index === 0 ? undefined : 'lazy'}
                  />
                ) : (
                  <span className="product-gallery__thumb-fallback" aria-hidden="true" />
                )}
                <VisuallyHidden>
                  {slide.kind === 'video'
                    ? `${productName} — video`
                    : slide.item.altText || productName}
                </VisuallyHidden>
              </button>
            );
          })}
        </div>
      ) : null}
      {slides.map((slide, index) => (
        <div
          key={`panel-${slide.item.id}`}
          id={`${galleryId}-panel-${index}`}
          role="tabpanel"
          className={cx(
            'product-gallery__panel',
            index === activeIndex ? undefined : 'product-gallery__panel--hidden',
          )}
          hidden={index !== activeIndex}
          aria-hidden={index !== activeIndex}
        />
      ))}
    </div>
  );
}
