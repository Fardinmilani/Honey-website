export type PageRobotsInput = {
  readonly indexingEnabled: boolean;
  readonly noindex?: boolean;
};

export type PageRobots = {
  readonly index: boolean;
  readonly follow: boolean;
  readonly googleBot: {
    readonly index: boolean;
    readonly follow: boolean;
  };
};

/**
 * Resolves per-page robots directives. Indexing is fail-closed: disabled
 * globally or via `noindex` both set `index: false`.
 */
export function pageRobots({ indexingEnabled, noindex }: PageRobotsInput): PageRobots {
  const index = indexingEnabled && noindex !== true;
  return {
    index,
    follow: true,
    googleBot: {
      index,
      follow: true,
    },
  };
}

export type RobotsTxtBodyInput = {
  readonly indexingEnabled: boolean;
  readonly sitemapUrl: string;
};

/**
 * Generates robots.txt body for production indexing or staging lockdown.
 */
export function robotsTxtBody({ indexingEnabled, sitemapUrl }: RobotsTxtBodyInput): string {
  if (!indexingEnabled) {
    return ['User-agent: *', 'Disallow: /', ''].join('\n');
  }

  return [
    'User-agent: *',
    'Allow: /',
    '',
    'Disallow: /*/admin',
    'Disallow: /*/cart',
    'Disallow: /*/checkout',
    'Disallow: /*/account',
    'Disallow: /api/',
    'Disallow: /*?*sort=',
    'Disallow: /*?*cursor=',
    'Disallow: /*?*filter=',
    '',
    `Sitemap: ${sitemapUrl}`,
    '',
  ].join('\n');
}
