import { stateLabel } from '@/lib/admin/labels';
import { getNamespace } from '@honey/i18n';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { ContentCreate } from '@/components/admin/editorial-forms';
import {
  adminLocale,
  adminUser,
  adminRead,
  adminQuery,
  csrfConfig,
  type AdminSearchParams,
} from '@/lib/admin/server';
import { page, identifier, records, text } from '@/lib/admin/validation';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const locale = adminLocale((await params).locale);
  const user = await adminUser(locale);
  if (!user.permissions.includes('content:read')) return <AdminDenied locale={locale} />;
  const m = getNamespace(locale, 'editorial'),
    a = getNamespace(locale, 'admin');
  const search = await searchParams;
  const kind = search['kind'] === 'article' ? 'article' : search['kind'] === 'faq' ? 'faq' : 'page';
  const query = adminQuery(search, ['q', 'cursor', 'limit']);
  const result = page(await adminRead(locale, '/v1/admin/content/' + kind, query));
  const path = `/${locale}/admin/content`;
  return (
    <AdminPage locale={locale} title="content">
      <nav className="admin-tabs">
        {(['page', 'article', 'faq'] as const).map((k) => (
          <a key={k} href={path + '?kind=' + k} aria-current={kind === k ? 'page' : undefined}>
            {k === 'page' ? m.pages : k === 'article' ? m.articles : m.faq}
          </a>
        ))}
      </nav>
      <form className="admin-filters">
        <input name="kind" type="hidden" value={kind} />
        <label>
          {a.search}
          <input name="q" defaultValue={query['q']} maxLength={120} />
        </label>
        <button type="submit">{a.search}</button>
      </form>
      <ul className="editorial-list">
        {result.items.map((row) => {
          const ts = records(row['translations']);
          const t = ts.find((t) => t['locale'] === locale);
          return (
            <li key={identifier(row['id'])}>
              <a href={path + '/' + kind + '/' + identifier(row['id'])}>
                {t === undefined ? text(row['key']) : text(t['title'])}
              </a>{' '}
              · {stateLabel(a, text(row['status']))}
            </li>
          );
        })}
      </ul>
      {result.items.length === 0 && <p>{a.empty}</p>}
      {result.nextCursor && (
        <a
          href={
            path +
            '?kind=' +
            kind +
            '&cursor=' +
            encodeURIComponent(result.nextCursor) +
            (query['q'] ? '&q=' + encodeURIComponent(query['q']) : '')
          }
        >
          {m.next}
        </a>
      )}
      {user.permissions.includes('content:write') && (
        <section className="admin-panel">
          <h2>{a.create}</h2>
          <ContentCreate locale={locale} csrf={csrfConfig()} kind={kind} />
        </section>
      )}
    </AdminPage>
  );
}
