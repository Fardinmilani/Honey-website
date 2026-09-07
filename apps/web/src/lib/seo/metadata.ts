import { getLocaleConfig, type Locale } from '@honey/i18n';
import type { Metadata } from 'next';

import { isIndexingEnabled } from '../env';
import { absoluteUrl } from './absolute-url';
import type { MetadataAlternates } from './alternates';
import { pageRobots } from './robots-policy';

export type CatalogMetadataInput = {
  readonly locale: Locale;
  readonly title: string;
  readonly description: string;
  readonly canonicalPath: string;
  readonly alternates: MetadataAlternates;
  readonly noindex?: boolean;
  readonly ogImage?: string;
};

/**
 * Builds catalog page metadata with canonical, hreflang alternates, robots,
 * and Open Graph / Twitter cards.
 */
export function buildCatalogMetadata(input: CatalogMetadataInput): Metadata {
  const config = getLocaleConfig(input.locale);
  const canonical = absoluteUrl(input.canonicalPath);
  const robots = pageRobots({
    indexingEnabled: isIndexingEnabled(),
    ...(input.noindex === true ? { noindex: true } : {}),
  });

  const openGraphImages = input.ogImage !== undefined ? [{ url: input.ogImage }] : undefined;
  const twitterImages = input.ogImage !== undefined ? [input.ogImage] : undefined;

  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical,
      languages: input.alternates.languages,
    },
    robots,
    openGraph: {
      title: input.title,
      description: input.description,
      url: canonical,
      locale: config.ogLocale,
      type: 'website',
      ...(openGraphImages !== undefined ? { images: openGraphImages } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      ...(twitterImages !== undefined ? { images: twitterImages } : {}),
    },
  };
}
