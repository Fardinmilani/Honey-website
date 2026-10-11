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
export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const locale = adminLocale((await params).locale);
  const user = await adminUser(locale);
  if (!user.permissions.includes('order:read')) return <AdminDenied locale={locale} />;
  const m = getNamespace(locale, 'admin');
  const query = adminQuery(await searchParams, [
    'cursor',
    'limit',
    'q',
    'status',
    'paymentStatus',
    'fulfilmentStatus',
    'customerId',
  ]);
  const result = adminPageData(await adminRead(locale, '/v1/admin/orders', query));
  const path = `/${locale}/admin/orders`;
  return (
    <AdminPage locale={locale} title="orders" description="ordersDescription">
      <p className="admin-help">{m.orderSearchHelp}</p>
      <Filters
        locale={locale}
        path={path}
        query={query}
        fields={[
          { key: 'q', label: 'search' },
          { key: 'customerId', label: 'identifier' },
          {
            key: 'status',
            label: 'status',
            options: [
              'PENDING_PAYMENT',
              'PAID',
              'PROCESSING',
              'PARTIALLY_FULFILLED',
              'FULFILLED',
              'COMPLETED',
              'CANCELLED',
              'REFUNDED',
              'PARTIALLY_REFUNDED',
              'FAILED',
            ],
          },
          {
            key: 'paymentStatus',
            label: 'paymentStatus',
            options: ['UNPAID', 'AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED'],
          },
          {
            key: 'fulfilmentStatus',
            label: 'fulfilmentStatus',
            options: ['UNFULFILLED', 'PARTIAL', 'FULFILLED'],
          },
        ]}
      />
      <DataTable
        locale={locale}
        caption="orders"
        items={result.items}
        columns={[
          { key: 'number', label: 'number' },
          { key: 'email', label: 'email' },
          { key: 'status', label: 'status', format: 'state' },
          { key: 'paymentStatus', label: 'paymentStatus', format: 'state' },
          { key: 'fulfilmentStatus', label: 'fulfilmentStatus', format: 'state' },
          { key: 'grandTotalMinor', label: 'grandTotalMinor' },
          { key: 'currency', label: 'currency' },
          { key: 'placedAt', label: 'placedAt', format: 'date' },
        ]}
        detailHref={(row) => `${path}/${identifier(row['id'])}`}
      />
      <Pagination locale={locale} path={path} query={query} nextCursor={result.nextCursor} />
    </AdminPage>
  );
}
