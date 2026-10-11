import { getNamespace } from '@honey/i18n';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { adminPageData, DataTable, Filters, Pagination } from '@/components/admin/admin-data';
import { PurchaseOrderForm, SupplierForm } from '@/components/admin/procurement-forms';
import {
  adminLocale,
  adminQuery,
  adminRead,
  adminUser,
  csrfConfig,
  type AdminSearchParams,
} from '@/lib/admin/server';
import { identifier } from '@/lib/admin/validation';
export default async function ProcurementPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const locale = adminLocale((await params).locale);
  const user = await adminUser(locale);
  if (!user.permissions.includes('procurement:read')) return <AdminDenied locale={locale} />;
  const m = getNamespace(locale, 'admin');
  const search = await searchParams;
  const view = search['view'] === 'purchase-orders' ? 'purchase-orders' : 'suppliers';
  const query = adminQuery(search, [
    'cursor',
    'limit',
    'status',
    ...(view === 'purchase-orders' ? ['supplierId'] : []),
  ]);
  const result = adminPageData(await adminRead(locale, `/v1/admin/procurement/${view}`, query));
  const path = `/${locale}/admin/procurement`;
  return (
    <AdminPage locale={locale} title="procurement" description="procurementDescription">
      <nav className="admin-tabs">
        <a href={path} aria-current={view === 'suppliers' ? 'page' : undefined}>
          {m.suppliers}
        </a>
        <a
          href={`${path}?view=purchase-orders`}
          aria-current={view === 'purchase-orders' ? 'page' : undefined}
        >
          {m.purchaseOrders}
        </a>
      </nav>
      <Filters
        locale={locale}
        path={path}
        query={query}
        fixed={{ view }}
        fields={[
          {
            key: 'status',
            label: 'status',
            options:
              view === 'suppliers'
                ? ['ACTIVE', 'PAUSED', 'BLOCKED']
                : [
                    'DRAFT',
                    'SUBMITTED',
                    'CONFIRMED',
                    'PARTIALLY_RECEIVED',
                    'RECEIVED',
                    'CANCELLED',
                  ],
          },
          ...(view === 'purchase-orders'
            ? [{ key: 'supplierId', label: 'supplierId' as const }]
            : []),
        ]}
      />
      {view === 'suppliers' ? (
        <DataTable
          locale={locale}
          caption="suppliers"
          items={result.items}
          columns={[
            { key: 'code', label: 'code' },
            { key: 'legalName', label: 'legalName' },
            { key: 'status', label: 'status', format: 'state' },
            { key: 'qualityRating', label: 'qualityRating' },
          ]}
          detailHref={(row) => `${path}/suppliers/${identifier(row['id'])}`}
        />
      ) : (
        <DataTable
          locale={locale}
          caption="purchaseOrders"
          items={result.items}
          columns={[
            { key: 'number', label: 'number' },
            { key: 'supplierId', label: 'supplierId' },
            { key: 'status', label: 'status', format: 'state' },
            { key: 'currency', label: 'currency' },
            { key: 'expectedAt', label: 'expectedAt', format: 'date' },
          ]}
          detailHref={(row) => `${path}/purchase-orders/${identifier(row['id'])}`}
        />
      )}
      <Pagination
        locale={locale}
        path={path}
        query={{ ...query, view }}
        nextCursor={result.nextCursor}
      />
      {user.permissions.includes('procurement:write') && (
        <section className="admin-panel">
          <details>
            <summary>{m.create}</summary>
            {view === 'suppliers' ? (
              <SupplierForm locale={locale} csrf={csrfConfig()} />
            ) : (
              <PurchaseOrderForm locale={locale} csrf={csrfConfig()} />
            )}
          </details>
        </section>
      )}
    </AdminPage>
  );
}
