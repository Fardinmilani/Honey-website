import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { adminPageData, DataTable, Facts, Pagination } from '@/components/admin/admin-data';
import { AllocationForm } from '@/components/admin/sourcing-forms';
import {
  adminLocale,
  adminQuery,
  adminRead,
  adminUser,
  csrfConfig,
  type AdminSearchParams,
} from '@/lib/admin/server';
import { identifier, record } from '@/lib/admin/validation';
export default async function BatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const values = await params;
  const locale = adminLocale(values.locale);
  const id = identifier(values.id);
  const user = await adminUser(locale);
  if (!user.permissions.includes('inventory:read')) return <AdminDenied locale={locale} />;
  const query = adminQuery(await searchParams, ['cursor', 'limit']);
  const [rawBatch, rawAllocations] = await Promise.all([
    adminRead(locale, `/v1/admin/sourcing/harvest-batches/${id}`),
    adminRead(locale, `/v1/admin/sourcing/harvest-batches/${id}/allocations/page`, query),
  ]);
  const allocations = adminPageData(rawAllocations);
  return (
    <AdminPage locale={locale} title="batches">
      <section className="admin-panel">
        <Facts
          locale={locale}
          row={record(rawBatch)}
          fields={[
            { key: 'id', label: 'identifier' },
            { key: 'batchCode', label: 'batchCode' },
            { key: 'sourcingType', label: 'sourcingType' },
            { key: 'apiaryId', label: 'apiaryId' },
            { key: 'supplierId', label: 'supplierId' },
            { key: 'harvestSeason', label: 'harvestSeason' },
            { key: 'quantityGrams', label: 'quantityGrams' },
          ]}
        />
      </section>
      <DataTable
        locale={locale}
        caption="allocations"
        items={allocations.items}
        columns={[
          { key: 'id', label: 'identifier' },
          { key: 'variantId', label: 'variantId' },
          { key: 'quantityUnits', label: 'quantityUnits' },
          { key: 'packedAt', label: 'packedAt', format: 'date' },
        ]}
      />
      <Pagination
        locale={locale}
        path={`/${locale}/admin/sourcing/batches/${id}`}
        query={query}
        nextCursor={allocations.nextCursor}
      />
      {user.permissions.includes('inventory:adjust') && (
        <section className="admin-panel">
          <AllocationForm locale={locale} csrf={csrfConfig()} batchId={id} />
        </section>
      )}
    </AdminPage>
  );
}
