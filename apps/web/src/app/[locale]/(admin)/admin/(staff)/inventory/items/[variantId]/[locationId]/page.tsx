import { getNamespace } from '@honey/i18n';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { adminPageData, DataTable, Facts, Pagination } from '@/components/admin/admin-data';
import { InventoryItemForms } from '@/components/admin/inventory-forms';
import {
  adminLocale,
  adminQuery,
  adminRead,
  adminUser,
  csrfConfig,
  type AdminSearchParams,
} from '@/lib/admin/server';
import { identifier, record } from '@/lib/admin/validation';
export default async function InventoryItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; variantId: string; locationId: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const values = await params;
  const locale = adminLocale(values.locale);
  const variantId = identifier(values.variantId);
  const locationId = identifier(values.locationId);
  const user = await adminUser(locale);
  if (!user.permissions.includes('inventory:read')) return <AdminDenied locale={locale} />;
  const query = adminQuery(await searchParams, ['cursor', 'limit']);
  const [rawItem, rawLedger] = await Promise.all([
    adminRead(locale, `/v1/admin/inventory/items/${variantId}/${locationId}`),
    adminRead(locale, `/v1/admin/inventory/ledger/${variantId}`, query),
  ]);
  const item = record(rawItem);
  const ledger = adminPageData(rawLedger);
  return (
    <AdminPage locale={locale} title="balances">
      <a className="admin-button" href={`/${locale}/admin/inventory`}>
        {getNamespace(locale, 'admin').inventory}
      </a>
      <section className="admin-panel">
        <Facts
          locale={locale}
          row={item}
          fields={[
            { key: 'variantId', label: 'variantId' },
            { key: 'stockLocationId', label: 'stockLocationId' },
            { key: 'onHand', label: 'onHand' },
            { key: 'reserved', label: 'reserved' },
            { key: 'allocated', label: 'allocated' },
            { key: 'availableToSell', label: 'availableToSell' },
            { key: 'incoming', label: 'incoming' },
            { key: 'version', label: 'version' },
          ]}
        />
      </section>
      {user.permissions.includes('inventory:adjust') && (
        <InventoryItemForms locale={locale} csrf={csrfConfig()} item={item} />
      )}
      <DataTable
        locale={locale}
        caption="ledger"
        items={ledger.items}
        columns={[
          { key: 'stockLocationId', label: 'stockLocationId' },
          { key: 'delta', label: 'delta' },
          { key: 'reason', label: 'reason', format: 'state' },
          { key: 'note', label: 'note' },
          { key: 'actorUserId', label: 'actorUserId' },
          { key: 'createdAt', label: 'createdAt', format: 'date' },
        ]}
      />
      <Pagination
        locale={locale}
        path={`/${locale}/admin/inventory/items/${variantId}/${locationId}`}
        query={query}
        nextCursor={ledger.nextCursor}
      />
    </AdminPage>
  );
}
