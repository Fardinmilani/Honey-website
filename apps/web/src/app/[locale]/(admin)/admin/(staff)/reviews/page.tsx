import { getNamespace, isLocale } from '@honey/i18n';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { ModerationAction } from '@/components/admin/editorial-forms';
import {
  adminLocale,
  adminUser,
  adminRead,
  adminQuery,
  csrfConfig,
  type AdminSearchParams,
} from '@/lib/admin/server';
import { page, record, text, identifier } from '@/lib/admin/validation';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const locale = adminLocale((await params).locale);
  const user = await adminUser(locale);
  if (!user.permissions.includes('review:moderate')) return <AdminDenied locale={locale} />;
  const m = getNamespace(locale, 'editorial');
  const result = page(
    await adminRead(
      locale,
      '/v1/admin/reviews',
      adminQuery(await searchParams, ['cursor', 'limit']),
    ),
  );
  return (
    <AdminPage locale={locale} title="reviews">
      <p>{m.reviewGuidance}</p>
      {result.items.length === 0 && <p>{getNamespace(locale, 'admin').empty}</p>}
      {result.items.map((row) => {
        const id = identifier(row['id']);
        const l = text(row['locale']);
        const names = record(row['productNames']);
        return (
          <section className="admin-panel" key={id}>
            <p>
              {m.product}:{' '}
              {typeof names[locale] === 'string'
                ? text(names[locale])
                : identifier(row['productId'])}
            </p>
            <p>
              {m.verified} · {m.rating}: <bdi>{String(row['rating'])}</bdi>
            </p>
            <article lang={isLocale(l) ? l : undefined} dir={l === 'fa' ? 'rtl' : 'ltr'}>
              <h2>{text(row['title'])}</h2>
              <p className="editorial-preserve">{text(row['body'])}</p>
            </article>
            <div className="admin-grid">
              <ModerationAction locale={locale} csrf={csrfConfig()} id={id} action="approve" />
              <ModerationAction locale={locale} csrf={csrfConfig()} id={id} action="reject" />
            </div>
          </section>
        );
      })}
      {result.nextCursor && (
        <a href={`/${locale}/admin/reviews?cursor=${encodeURIComponent(result.nextCursor)}`}>
          {m.next}
        </a>
      )}
    </AdminPage>
  );
}
