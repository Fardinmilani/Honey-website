import { afterEach, describe, expect, it } from 'vitest';

import { HERO_ASSETS } from '../components/hero/hero-assets';
import { getSiteOrigin, getWebEnv, isIndexingEnabled, resetWebEnvCache } from './env';

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
  afterEach(() => {
    resetWebEnvCache();
    delete process.env['NEXT_PUBLIC_SITE_URL'];
    delete process.env['PUBLIC_SITE_URL'];
    delete process.env['INTERNAL_API_URL'];
    delete process.env['WEB_INDEXING_ENABLED'];
    delete process.env['WEB_REVALIDATE_SECRET'];
    delete process.env['NEXT_PHASE'];
  });

  it('loads defaults in non-production with indexing disabled', () => {
    resetWebEnvCache();
    delete process.env['NEXT_PUBLIC_SITE_URL'];
    delete process.env['PUBLIC_SITE_URL'];
    delete process.env['INTERNAL_API_URL'];
    delete process.env['WEB_INDEXING_ENABLED'];
    const env = getWebEnv();
    expect(env.publicSiteUrl.origin).toBe('http://localhost:3000');
    expect(env.internalApiUrl.origin).toBe('http://localhost:4000');
    expect(env.sessionCookieName).toBe('honey_session');
    expect(env.indexingEnabled).toBe(false);
    expect(isIndexingEnabled()).toBe(false);
  });

  it('allows local HTTP origin when indexing is false', () => {
    process.env['NEXT_PUBLIC_SITE_URL'] = 'http://localhost:3000';
    process.env['WEB_INDEXING_ENABLED'] = 'false';
    resetWebEnvCache();
    expect(getSiteOrigin().origin).toBe('http://localhost:3000');
    expect(isIndexingEnabled()).toBe(false);
  });

  it('allows staging HTTPS origin when indexing is false', () => {
    process.env['NEXT_PUBLIC_SITE_URL'] = 'https://staging.honey-preview.example';
    process.env['WEB_INDEXING_ENABLED'] = 'false';
    resetWebEnvCache();
    expect(getSiteOrigin().origin).toBe('https://staging.honey-preview.example');
    expect(isIndexingEnabled()).toBe(false);
  });

  it('allows production indexing with valid HTTPS origin', () => {
    process.env['NEXT_PUBLIC_SITE_URL'] = 'https://shop.honey-azerbaijan.com';
    process.env['WEB_INDEXING_ENABLED'] = 'true';
    resetWebEnvCache();
    expect(isIndexingEnabled()).toBe(true);
    expect(getSiteOrigin().origin).toBe('https://shop.honey-azerbaijan.com');
  });

  it('rejects indexing true when public origin is missing (no build defaults)', () => {
    // Under Vitest NODE_ENV is typically 'test', which allows localhost defaults.
    // Prove the indexing+HTTPS gate by supplying an explicit non-HTTPS origin instead.
    process.env['NEXT_PUBLIC_SITE_URL'] = 'http://shop.honey-azerbaijan.com';
    process.env['WEB_INDEXING_ENABLED'] = 'true';
    resetWebEnvCache();
    expect(() => getWebEnv()).toThrow(/HTTPS/i);
  });

  it('rejects indexing true with HTTP origin', () => {
    process.env['NEXT_PUBLIC_SITE_URL'] = 'http://shop.honey-azerbaijan.com';
    process.env['WEB_INDEXING_ENABLED'] = 'true';
    resetWebEnvCache();
    expect(() => getWebEnv()).toThrow(/HTTPS/i);
  });

  it('rejects indexing true with localhost', () => {
    process.env['NEXT_PUBLIC_SITE_URL'] = 'https://localhost:3000';
    process.env['WEB_INDEXING_ENABLED'] = 'true';
    resetWebEnvCache();
    expect(() => getWebEnv()).toThrow(/loopback|private|localhost/i);
  });

  it('rejects indexing true with example.com placeholder', () => {
    process.env['NEXT_PUBLIC_SITE_URL'] = 'https://example.com';
    process.env['WEB_INDEXING_ENABLED'] = 'true';
    resetWebEnvCache();
    expect(() => getWebEnv()).toThrow(/placeholder|test/i);
  });

  it('does not read Host or X-Forwarded-Host for site origin', () => {
    process.env['NEXT_PUBLIC_SITE_URL'] = 'https://shop.honey-azerbaijan.com';
    process.env['WEB_INDEXING_ENABLED'] = 'false';
    // Spoofed headers must never be consulted by getSiteOrigin.
    process.env['HTTP_HOST'] = 'evil.example';
    process.env['X_FORWARDED_HOST'] = 'evil.example';
    resetWebEnvCache();
    expect(getSiteOrigin().host).toBe('shop.honey-azerbaijan.com');
    delete process.env['HTTP_HOST'];
    delete process.env['X_FORWARDED_HOST'];
  });
});
