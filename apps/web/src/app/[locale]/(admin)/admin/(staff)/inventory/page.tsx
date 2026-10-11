import { getNamespace } from '@honey/i18n';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { adminPageData, DataTable, Filters, Pagination } from '@/components/admin/admin-data';
import { LocationForm } from '@/components/admin/inventory-forms';
import {
  adminLocale,
  adminQuery,
  adminRead,
  adminUser,
  csrfConfig,
  type AdminSearchParams,
} from '@/lib/admin/server';
import { identifier, text } from '@/lib/admin/validation';
export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const locale = adminLocale((await params).locale);
  const m = getNamespace(locale, 'admin');
  const user = await adminUser(locale);
  if (!user.permissions.includes('inventory:read')) return <AdminDenied locale={locale} />;
  const search = await searchParams;
  const query = adminQuery(search, ['cursor', 'limit', 'variantId', 'stockLocationId']);
  const locationCursor = adminQuery(search, ['locationsCursor']);
  const [rawItems, rawLocations] = await Promise.all([
    adminRead(locale, '/v1/admin/inventory/items', query),
    adminRead(
      locale,
      '/v1/admin/inventory/locations/page',
      locationCursor['locationsCursor'] === undefined
        ? {}
        : { cursor: locationCursor['locationsCursor'] },
    ),
  ]);
  const items = adminPageData(rawItems);
  const locationsPage = adminPageData(rawLocations);
  const locations = locationsPage.items;
  const path = `/${locale}/admin/inventory`;
  return (
    <AdminPage locale={locale} title="inventory" description="inventoryDescription">
      <Filters
        locale={locale}
        path={path}
        query={query}
        fields={[
          { key: 'variantId', label: 'variantId' },
          { key: 'stockLocationId', label: 'stockLocationId' },
        ]}
      />
      <DataTable
        locale={locale}
        caption="balances"
        items={items.items}
        columns={[
          { key: 'variantId', label: 'variantId' },
          { key: 'stockLocationId', label: 'stockLocationId' },
          { key: 'onHand', label: 'onHand' },
          { key: 'reserved', label: 'reserved' },
          { key: 'allocated', label: 'allocated' },
          { key: 'incoming', label: 'incoming' },
          { key: 'version', label: 'version' },
        ]}
        detailHref={(row) =>
          `${path}/items/${identifier(row['variantId'])}/${identifier(row['stockLocationId'])}`
        }
      />
      <Pagination
        locale={locale}
        path={path}
        query={{ ...query, ...locationCursor }}
        nextCursor={items.nextCursor}
      />
      <section className="admin-panel">
        <h2>{m.locations}</h2>
        <Pagination
          locale={locale}
          path={path}
          query={{ ...query, ...locationCursor }}
          nextCursor={locationsPage.nextCursor}
          cursorKey="locationsCursor"
        />
        <DataTable
          locale={locale}
          caption="locations"
          items={locations}
          columns={[
            { key: 'id', label: 'identifier' },
            { key: 'code', label: 'code' },
            { key: 'name', label: 'name' },
            { key: 'type', label: 'locationType', format: 'state' },
            { key: 'isDefault', label: 'isDefault', format: 'boolean' },
          ]}
        />
        {user.permissions.includes('inventory:adjust') && (
          <>
            <details>
              <summary>{m.create}</summary>
              <LocationForm locale={locale} csrf={csrfConfig()} />
            </details>
            {locations.map((row) => (
              <details key={identifier(row['id'])}>
                <summary>
                  {m.edit}: {text(row['name'])}
                </summary>
                <LocationForm locale={locale} csrf={csrfConfig()} row={row} />
              </details>
            ))}
          </>
        )}
      </section>
    </AdminPage>
  );
}
