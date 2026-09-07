import { describe, expect, it } from 'vitest';

import { pageRobots, robotsTxtBody } from './robots-policy';

describe('pageRobots', () => {
  it('allows indexing when enabled and not explicitly noindex', () => {
    expect(pageRobots({ indexingEnabled: true })).toEqual({
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    });
  });

  it('blocks indexing when globally disabled', () => {
    expect(pageRobots({ indexingEnabled: false }).index).toBe(false);
    expect(pageRobots({ indexingEnabled: false }).googleBot.index).toBe(false);
  });

  it('blocks indexing when noindex is set even if globally enabled', () => {
    expect(pageRobots({ indexingEnabled: true, noindex: true }).index).toBe(false);
    expect(pageRobots({ indexingEnabled: true, noindex: true }).googleBot.index).toBe(false);
  });
});

describe('robotsTxtBody', () => {
  it('locks down staging when indexing is disabled', () => {
    expect(robotsTxtBody({ indexingEnabled: false, sitemapUrl: 'https://example.com/sitemap.xml' }))
      .toBe(`User-agent: *
Disallow: /
`);
  });

  it('allows crawling with production disallow rules and sitemap when indexing is enabled', () => {
    const body = robotsTxtBody({
      indexingEnabled: true,
      sitemapUrl: 'https://example.com/sitemap.xml',
    });

    expect(body).toContain('User-agent: *');
    expect(body).toContain('Allow: /');
    expect(body).toContain('Disallow: /*/admin');
    expect(body).toContain('Disallow: /*/cart');
    expect(body).toContain('Disallow: /*/checkout');
    expect(body).toContain('Disallow: /*/account');
    expect(body).toContain('Disallow: /api/');
    expect(body).toContain('Disallow: /*?*sort=');
    expect(body).toContain('Disallow: /*?*cursor=');
    expect(body).toContain('Disallow: /*?*filter=');
    expect(body).toContain('Sitemap: https://example.com/sitemap.xml');
  });
});
