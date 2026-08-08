export const HERO_ASSETS = {
  desktop: {
    poster: '/media/hero/desktop/honey-poster.webp',
    mp4: '/media/hero/desktop/honey-scroll.mp4',
    webm: '/media/hero/desktop/honey-scroll.webm',
  },
  mobile: {
    poster: '/media/hero/mobile/honey-poster.webp',
    mp4: '/media/hero/mobile/honey-scroll.mp4',
    webm: '/media/hero/mobile/honey-scroll.webm',
  },
  stills: {
    start: '/media/hero/stills/hero-start.webp',
    end: '/media/hero/stills/hero-end.webp',
  },
} as const;

export type HeroViewport = 'mobile' | 'desktop';

/** Mobile breakpoint aligned with CSS (max-width 767px). */
export const HERO_MOBILE_MEDIA_QUERY = '(max-width: 767px)';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
