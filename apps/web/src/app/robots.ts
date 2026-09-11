import type { MetadataRoute } from 'next';

import { isIndexingEnabled } from '@/lib/env';
import { absoluteUrl } from '@/lib/seo';

/**
 * Next.js robots metadata equivalent to {@link robotsTxtBody} in robots-policy.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexingEnabled()) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/*/admin',
        '/*/cart',
        '/*/sabad-kharid',
        '/*/checkout',
        '/*/account',
        '/api/',
        '/*?*sort=',
        '/*?*cursor=',
        '/*?*filter=',
      ],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
