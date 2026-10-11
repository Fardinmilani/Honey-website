import { getNamespace, isLocale, localizedHref } from '@honey/i18n';
import { Container } from '@honey/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContentBlocks } from './blocks';
import { JsonLdScript } from '@/components/catalog/json-ld-script';
import { SetEntityLocaleHrefs } from '@/components/shell/set-entity-locale-hrefs';
import { getContent } from '@/lib/editorial/api';
import { ApiClientError } from '@/lib/api-client/server';
import { absoluteUrl, buildCatalogMetadata, buildMetadataAlternates } from '@/lib/seo';
import { buildArticleJsonLd } from '@/lib/seo/builders/editorial';
type Props = { params: Promise<{ locale: string; slug: string }> };
async function load(kind: 'page' | 'article', props: Props) {
  const { locale, slug } = await props.params;
  if (!isLocale(locale)) notFound();
  try {
    return await getContent(kind, locale, slug);
  } catch (e) {
    if (e instanceof ApiClientError && e.presentation.status === 404) notFound();
    throw e;
  }
}
export async function contentMetadata(kind: 'page' | 'article', props: Props): Promise<Metadata> {
  const row = await load(kind, props);
  const path = kind === 'article' ? '/articles/[slug]' : '/pages/[slug]';
  const paths = Object.fromEntries(
    Object.entries(row.slugs).flatMap(([locale, slug]) =>
      isLocale(locale) && slug !== undefined
        ? [[locale, localizedHref(path, locale, { slug })]]
        : [],
    ),
  );
  return buildCatalogMetadata({
    locale: row.locale,
    title: row.metaTitle ?? row.title,
    description: row.metaDescription ?? row.title,
    canonicalPath: localizedHref(path, row.locale, { slug: row.slug }),
    alternates: buildMetadataAlternates(row.locale, paths),
  });
}
export async function EditorialContentPage({
  kind,
  ...props
}: Props & { kind: 'page' | 'article' }) {
  const row = await load(kind, props);
  const path = kind === 'article' ? '/articles/[slug]' : '/pages/[slug]';
  const paths = Object.fromEntries(
    Object.entries(row.slugs).flatMap(([locale, slug]) =>
      isLocale(locale) && slug !== undefined
        ? [[locale, localizedHref(path, locale, { slug })]]
        : [],
    ),
  );
  return (
    <Container>
      <SetEntityLocaleHrefs hrefs={paths} />
      <article className="editorial-page" lang={row.locale}>
        <h1>{row.title}</h1>
        <ContentBlocks blocks={row.blocks} media={row.media} />
      </article>
      {kind === 'article' && (
        <JsonLdScript
          data={buildArticleJsonLd({
            title: row.title,
            description: row.metaDescription ?? row.title,
            url: absoluteUrl(localizedHref(path, row.locale, { slug: row.slug })),
            locale: row.locale,
            publishedAt: row.publishedAt,
            updatedAt: row.updatedAt,
            brandName: getNamespace(row.locale, 'common').brandName,
          })}
        />
      )}
    </Container>
  );
}
