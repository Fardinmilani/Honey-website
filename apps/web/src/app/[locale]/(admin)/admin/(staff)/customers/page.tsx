import { getNamespace } from '@honey/i18n';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { adminPageData, DataTable, Filters, Pagination } from '@/components/admin/admin-data';
import {
  adminLocale,
  adminQuery,
  adminRead,
  adminUser,
  type AdminSearchParams,
} from '@/lib/admin/server';
import { identifier } from '@/lib/admin/validation';
export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const locale = adminLocale((await params).locale);
  const user = await adminUser(locale);
  if (!user.permissions.includes('customer:read')) return <AdminDenied locale={locale} />;
  const query = adminQuery(await searchParams, ['q', 'cursor', 'limit']);
  const result =
    query['q'] === undefined
      ? { items: [], nextCursor: null }
      : adminPageData(await adminRead(locale, '/v1/admin/customers', query));
  const path = `/${locale}/admin/customers`;
  const m = getNamespace(locale, 'admin');
  return (
    <AdminPage locale={locale} title="customers" description="customersDescription">
      <p className="admin-help">{m.customerLookupHelp}</p>
      <Filters locale={locale} path={path} query={query} fields={[{ key: 'q', label: 'search' }]} />
      <DataTable
        locale={locale}
        caption="customers"
        items={result.items}
        columns={[
          { key: 'id', label: 'identifier' },
          { key: 'email', label: 'email' },
          { key: 'displayName', label: 'displayName' },
          { key: 'phoneMasked', label: 'phoneMasked' },
          { key: 'preferredLocale', label: 'preferredLocale' },
          { key: 'status', label: 'status', format: 'state' },
          { key: 'emailVerified', label: 'emailVerified', format: 'boolean' },
        ]}
        {...(user.permissions.includes('order:read')
          ? {
              detailHref: (row: Readonly<Record<string, unknown>>) =>
                `/${locale}/admin/orders?customerId=${identifier(row['id'])}`,
            }
          : {})}
      />
      <Pagination locale={locale} path={path} query={query} nextCursor={result.nextCursor} />
    </AdminPage>
  );
}
