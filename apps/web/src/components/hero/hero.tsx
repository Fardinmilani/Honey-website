import { createTranslator, type Locale } from '@honey/i18n';
import NextLink from 'next/link';

import { HERO_ASSETS } from './hero-assets';
import { HeroMotionMedia } from './hero-motion-media';

type HeroProps = {
  locale: Locale;
  headline: string;
  supporting: string;
  ctaLabel: string;
  ctaHref: string;
  ariaLabel: string;
};

/**
 * Poster-first Hero. Video is never SSR'd. Under reduced motion the client
 * keeps the poster still and does not mount <video> (no MP4/WebM requests).
 *
 * Posters are referenced as static public URLs (unprocessed) so protected Hero
 * bytes are never rewritten by an image optimizer pipeline.
 */
export function Hero({ locale, headline, supporting, ctaLabel, ctaHref, ariaLabel }: HeroProps) {
  const t = createTranslator(locale);

  return (
    <section className="hero" aria-label={ariaLabel}>
      <div className="hero__media" aria-hidden="true">
        <picture>
          <source media="(max-width: 767px)" srcSet={HERO_ASSETS.mobile.poster} type="image/webp" />
          <img
            className="hero__poster"
            src={HERO_ASSETS.desktop.poster}
            alt=""
            width={1920}
            height={1080}
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <HeroMotionMedia />
      </div>
      <div className="hero__scrim" aria-hidden="true" />
      <div className="hero__content ui-container">
        <p className="hero__brand">
          <bdi>{t('common.brandName')}</bdi>
        </p>
        <h1 className="hero__headline">{headline}</h1>
        <p className="hero__supporting">{supporting}</p>
        <div className="hero__cta">
          <NextLink className="ui-button ui-button--primary ui-button--md" href={ctaHref}>
            {ctaLabel}
          </NextLink>
        </div>
      </div>
    </section>
  );
}
