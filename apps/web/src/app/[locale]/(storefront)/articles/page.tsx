import { getNamespace, isLocale, localizedHref } from '@honey/i18n';
import { Container } from '@honey/ui';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { listContent } from '@/lib/editorial/api';
import { buildCatalogMetadata, buildMetadataAlternates } from '@/lib/seo';
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ cursor?: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return buildCatalogMetadata({
    locale,
    title: getNamespace(locale, 'editorial').articles,
    description: getNamespace(locale, 'editorial').articles,
    canonicalPath: localizedHref('/articles', locale),
    alternates: buildMetadataAlternates(locale, {
      fa: localizedHref('/articles', 'fa'),
      en: localizedHref('/articles', 'en'),
    }),
  });
}
export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getNamespace(locale, 'editorial');
  const rows = await listContent('article', locale, (await searchParams).cursor);
  return (
    <Container>
      <section className="editorial-page">
        <h1>{m.articles}</h1>
        {rows.items.length === 0 ? (
          <p>{m.empty}</p>
        ) : (
          <ul className="editorial-list">
            {rows.items.map((row) => (
              <li key={row.id}>
                <Link href={localizedHref('/articles/[slug]', locale, { slug: row.slug })}>
                  {row.title}
                </Link>
                {row.metaDescription && <p>{row.metaDescription}</p>}
              </li>
            ))}
          </ul>
        )}
        {rows.nextCursor && (
          <Link
            href={
              localizedHref('/articles', locale) + '?cursor=' + encodeURIComponent(rows.nextCursor)
            }
          >
            {m.next}
          </Link>
        )}
      </section>
    </Container>
  );
}
