import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { TemplateEditor } from '@/components/admin/editorial-forms';
import {
  adminLocale,
  adminUser,
  adminRead,
  adminQuery,
  csrfConfig,
  type AdminSearchParams,
} from '@/lib/admin/server';
import { page, text, optionalText, identifier } from '@/lib/admin/validation';
import { getNamespace } from '@honey/i18n';
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
  const result = page(
    await adminRead(
      locale,
      '/v1/admin/notifications/templates',
      adminQuery(await searchParams, ['cursor', 'limit']),
    ),
  );
  return (
    <AdminPage locale={locale} title="notifications">
      {result.items.map((row) => {
        const channel = row['channel'];
        if (channel !== 'EMAIL' && channel !== 'SMS') throw new Error('TEMPLATE_RESPONSE_INVALID');
        return (
          <TemplateEditor
            key={identifier(row['id'])}
            locale={locale}
            csrf={csrfConfig()}
            write={user.permissions.includes('content:write')}
            complete={row['complete'] === true}
            allowedVariables={
              Array.isArray(row['allowedVariables']) ? row['allowedVariables'].map(text) : []
            }
            initial={{
              code: text(row['code']),
              locale: text(row['locale']),
              channel,
              subject: optionalText(row['subject']),
              body: text(row['body']),
            }}
          />
        );
      })}
      {result.nextCursor && (
        <a href={`/${locale}/admin/notifications?cursor=${encodeURIComponent(result.nextCursor)}`}>
          {getNamespace(locale, 'editorial').next}
        </a>
      )}
    </AdminPage>
  );
}
