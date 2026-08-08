import { describe, expect, it } from 'vitest';

import { HERO_ASSETS } from '../components/hero/hero-assets';
import { getWebEnv, resetWebEnvCache } from './env';

describe('hero assets', () => {
  it('references protected public paths only', () => {
    expect(HERO_ASSETS.desktop.poster).toBe('/media/hero/desktop/honey-poster.webp');
    expect(HERO_ASSETS.desktop.mp4).toBe('/media/hero/desktop/honey-scroll.mp4');
    expect(HERO_ASSETS.desktop.webm).toBe('/media/hero/desktop/honey-scroll.webm');
    expect(HERO_ASSETS.mobile.poster).toBe('/media/hero/mobile/honey-poster.webp');
    expect(HERO_ASSETS.mobile.mp4).toBe('/media/hero/mobile/honey-scroll.mp4');
    expect(HERO_ASSETS.mobile.webm).toBe('/media/hero/mobile/honey-scroll.webm');
  });
});

describe('web env', () => {
  it('loads defaults in non-production', () => {
    resetWebEnvCache();
    delete process.env['NEXT_PUBLIC_SITE_URL'];
    delete process.env['PUBLIC_SITE_URL'];
    delete process.env['INTERNAL_API_URL'];
    const env = getWebEnv();
    expect(env.publicSiteUrl.origin).toBe('http://localhost:3000');
    expect(env.internalApiUrl.origin).toBe('http://localhost:4000');
    expect(env.sessionCookieName).toBe('honey_session');
  });
});
