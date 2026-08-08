'use client';

import { useEffect, useState } from 'react';

import {
  HERO_ASSETS,
  HERO_MOBILE_MEDIA_QUERY,
  REDUCED_MOTION_QUERY,
  type HeroViewport,
} from './hero-assets';

type HeroMotionMediaProps = {
  ariaHidden?: boolean;
};

/**
 * Progressively mounts Hero video only when:
 * - prefers-reduced-motion is NOT reduce
 * - client has determined the active viewport
 *
 * SSR and reduced-motion never include <video>, sources, or video URLs in the DOM.
 */
export function HeroMotionMedia({ ariaHidden = true }: HeroMotionMediaProps) {
  const [viewport, setViewport] = useState<HeroViewport | null>(null);
  const [allowMotion, setAllowMotion] = useState(false);

  useEffect(() => {
    const motionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const viewportQuery = window.matchMedia(HERO_MOBILE_MEDIA_QUERY);

    const sync = () => {
      const reduced = motionQuery.matches;
      setAllowMotion(!reduced);
      setViewport(viewportQuery.matches ? 'mobile' : 'desktop');
    };

    sync();
    motionQuery.addEventListener('change', sync);
    viewportQuery.addEventListener('change', sync);
    return () => {
      motionQuery.removeEventListener('change', sync);
      viewportQuery.removeEventListener('change', sync);
    };
  }, []);

  if (!allowMotion || viewport === null) {
    return null;
  }

  const assets = HERO_ASSETS[viewport];

  return (
    <video
      className="hero__video"
      autoPlay
      muted
      loop
      playsInline
      preload="none"
      poster={assets.poster}
      aria-hidden={ariaHidden ? true : undefined}
      tabIndex={-1}
    >
      <source src={assets.webm} type="video/webm" />
      <source src={assets.mp4} type="video/mp4" />
    </video>
  );
}
