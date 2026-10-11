import { getNamespace, isLocale, localizedHref } from '@honey/i18n';
import { Container } from '@honey/ui';
import { notFound } from 'next/navigation';
import { listContent } from '@/lib/editorial/api';
import { JsonLdScript } from '@/components/catalog/json-ld-script';
import { buildFaqJsonLd } from '@/lib/seo/builders/editorial';
import { buildCatalogMetadata, buildMetadataAlternates } from '@/lib/seo';
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ cursor?: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const title = getNamespace(locale, 'editorial').faq;
  return buildCatalogMetadata({
    locale,
    title,
    description: title,
    canonicalPath: localizedHref('/faq', locale),
    alternates: buildMetadataAlternates(locale, {
      fa: localizedHref('/faq', 'fa'),
      en: localizedHref('/faq', 'en'),
    }),
  });
}
export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getNamespace(locale, 'editorial');
  const rows = await listContent('faq', locale, (await searchParams).cursor);
  const items = rows.items.flatMap((r) =>
    r.blocks[0]?.type === 'paragraph'
      ? [{ id: r.id, question: r.title, answer: r.blocks[0].text }]
      : [],
  );
  return (
    <Container>
      <section className="editorial-page">
        <h1>{m.faq}</h1>
        {items.length === 0 ? (
          <p>{m.empty}</p>
        ) : (
          items.map((item) => (
            <details className="editorial-faq" key={item.id}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))
        )}
        {rows.nextCursor && (
          <a
            href={localizedHref('/faq', locale) + '?cursor=' + encodeURIComponent(rows.nextCursor)}
          >
            {m.next}
          </a>
        )}
      </section>
      {items.length > 0 && <JsonLdScript data={buildFaqJsonLd(items, locale)} />}
    </Container>
  );
}
