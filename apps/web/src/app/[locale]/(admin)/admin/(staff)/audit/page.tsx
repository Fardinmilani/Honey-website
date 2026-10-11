import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { adminPageData, DataTable, Filters, Pagination } from '@/components/admin/admin-data';
import {
  adminLocale,
  adminQuery,
  adminRead,
  adminUser,
  type AdminSearchParams,
} from '@/lib/admin/server';
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const locale = adminLocale((await params).locale);
  const user = await adminUser(locale);
  if (!user.permissions.includes('audit:read')) return <AdminDenied locale={locale} />;
  const query = adminQuery(await searchParams, [
    'cursor',
    'limit',
    'actorUserId',
    'action',
    'subjectType',
    'subjectId',
    'from',
    'to',
  ]);
  const result = adminPageData(await adminRead(locale, '/v1/admin/audit', query));
  const path = `/${locale}/admin/audit`;
  return (
    <AdminPage locale={locale} title="audit" description="auditDescription">
      <Filters
        locale={locale}
        path={path}
        query={query}
        fields={[
          { key: 'actorUserId', label: 'actorUserId' },
          { key: 'action', label: 'action' },
          { key: 'subjectType', label: 'subjectType' },
          { key: 'subjectId', label: 'subjectId' },
          { key: 'from', label: 'from' },
          { key: 'to', label: 'to' },
        ]}
      />
      <DataTable
        locale={locale}
        caption="audit"
        items={result.items}
        columns={[
          { key: 'createdAt', label: 'createdAt', format: 'date' },
          { key: 'actorUserId', label: 'actorUserId' },
          { key: 'action', label: 'action' },
          { key: 'subjectType', label: 'subjectType' },
          { key: 'subjectId', label: 'subjectId' },
          { key: 'requestId', label: 'requestId' },
        ]}
      />
      <Pagination locale={locale} path={path} query={query} nextCursor={result.nextCursor} />
    </AdminPage>
  );
}
