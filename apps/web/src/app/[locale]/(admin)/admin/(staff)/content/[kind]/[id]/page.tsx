import { editorialImages } from '@/lib/editorial/media';
import { stateLabel } from '@/lib/admin/labels';
import { getNamespace } from '@honey/i18n';
import { notFound } from 'next/navigation';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { ContentTransition, TranslationEditor } from '@/components/admin/editorial-forms';
import { ContentBlocks } from '@/components/editorial/blocks';
import { blocks } from '@/lib/editorial/types';
import { adminLocale, adminUser, adminRead, csrfConfig } from '@/lib/admin/server';
import { identifier, record, records, text, optionalText, page } from '@/lib/admin/validation';
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; kind: string; id: string }>;
}) {
  const p = await params;
  const locale = adminLocale(p.locale),
    kind = p.kind;
  if (kind !== 'page' && kind !== 'article' && kind !== 'faq') notFound();
  const id = identifier(p.id);
  const user = await adminUser(locale);
  if (!user.permissions.includes('content:read')) return <AdminDenied locale={locale} />;
  const row = record(await adminRead(locale, `/v1/admin/content/${kind}/${id}`));
  const translations = records(row['translations']);
  const m = getNamespace(locale, 'editorial');
  const write = user.permissions.includes('content:write') && row['status'] !== 'ARCHIVED';
  const mediaPage = write
    ? page(
        await adminRead(locale, '/v1/admin/media', {
          kind: 'IMAGE',
          visibility: 'PUBLIC',
          limit: '100',
        }),
      )
    : { items: [], nextCursor: null };
  const images = editorialImages(mediaPage.items);
  return (
    <AdminPage locale={locale} title="content">
      <p>
        {m.status}: {stateLabel(getNamespace(locale, 'admin'), text(row['status']))}
      </p>
      <p>{m.publication}</p>
      {(['fa', 'en'] as const).map((l) => {
        const t = translations.find((t) => t['locale'] === l);
        const initial = {
          title: t === undefined ? '' : text(t['title']),
          slug: t === undefined ? '' : text(t['slug']),
          metaTitle: t === undefined ? null : optionalText(t['metaTitle']),
          metaDescription: t === undefined ? null : optionalText(t['metaDescription']),
          blocks:
            t === undefined ? [{ type: 'paragraph' as const, text: '' }] : blocks(t['blocks']),
        };
        return (
          <section className="admin-panel" key={l}>
            <h2>{getNamespace(locale, 'admin')[l === 'fa' ? 'persian' : 'english']}</h2>
            {write ? (
              <TranslationEditor
                key={l}
                locale={locale}
                csrf={csrfConfig()}
                kind={kind}
                id={id}
                translationLocale={l}
                initial={initial}
                images={images}
                nextMediaCursor={mediaPage.nextCursor}
              />
            ) : (
              <div lang={l} dir={l === 'fa' ? 'rtl' : 'ltr'}>
                <h3>{initial.title}</h3>
                <ContentBlocks blocks={initial.blocks} />
              </div>
            )}
          </section>
        );
      })}
      {user.permissions.includes('content:publish') && row['status'] !== 'ARCHIVED' && (
        <section className="admin-panel">
          {row['status'] === 'DRAFT' && (
            <ContentTransition
              locale={locale}
              csrf={csrfConfig()}
              kind={kind}
              id={id}
              action="publish"
            />
          )}
          <ContentTransition
            locale={locale}
            csrf={csrfConfig()}
            kind={kind}
            id={id}
            action="archive"
          />
        </section>
      )}
    </AdminPage>
  );
}
