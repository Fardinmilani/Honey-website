import { getNamespace } from '@honey/i18n';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { adminPageData, DataTable, Pagination } from '@/components/admin/admin-data';
import {
  ApiaryForm,
  ApiaryTranslationForms,
  HarvestBatchForm,
  ProductionIntakeForm,
} from '@/components/admin/sourcing-forms';
import {
  adminLocale,
  adminQuery,
  adminRead,
  adminUser,
  csrfConfig,
  type AdminSearchParams,
} from '@/lib/admin/server';
import { identifier, text } from '@/lib/admin/validation';
export default async function SourcingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const locale = adminLocale((await params).locale);
  const user = await adminUser(locale);
  if (!user.permissions.includes('inventory:read')) return <AdminDenied locale={locale} />;
  const m = getNamespace(locale, 'admin');
  const search = await searchParams;
  const query = adminQuery(search, ['cursor', 'limit']);
  const apiaryCursor = adminQuery(search, ['apiariesCursor']);
  const [rawApiaries, rawBatches] = await Promise.all([
    adminRead(
      locale,
      '/v1/admin/sourcing/apiaries/page',
      apiaryCursor['apiariesCursor'] === undefined
        ? {}
        : { cursor: apiaryCursor['apiariesCursor'] },
    ),
    adminRead(locale, '/v1/admin/sourcing/harvest-batches', query),
  ]);
  const apiariesPage = adminPageData(rawApiaries);
  const apiaries = apiariesPage.items;
  const batches = adminPageData(rawBatches);
  const write = user.permissions.includes('inventory:adjust');
  return (
    <AdminPage locale={locale} title="sourcing" description="sourcingDescription">
      <section className="admin-panel">
        <h2>{m.apiaries}</h2>
        <Pagination
          locale={locale}
          path={`/${locale}/admin/sourcing`}
          query={{ ...query, ...apiaryCursor }}
          nextCursor={apiariesPage.nextCursor}
          cursorKey="apiariesCursor"
        />
        <DataTable
          locale={locale}
          caption="apiaries"
          items={apiaries}
          columns={[
            { key: 'id', label: 'identifier' },
            { key: 'code', label: 'code' },
            { key: 'name', label: 'name' },
            { key: 'region', label: 'region' },
            { key: 'isOwnOperation', label: 'isOwnOperation', format: 'boolean' },
          ]}
        />
        {write && (
          <>
            <details>
              <summary>{m.create}</summary>
              <ApiaryForm locale={locale} csrf={csrfConfig()} />
            </details>
            {apiaries.map((row) => (
              <details key={identifier(row['id'])}>
                <summary>
                  {m.edit}: {text(row['name'])}
                </summary>
                <ApiaryForm locale={locale} csrf={csrfConfig()} row={row} />
                <ApiaryTranslationForms locale={locale} csrf={csrfConfig()} row={row} />
              </details>
            ))}
          </>
        )}
      </section>
      <section className="admin-panel">
        <h2>{m.batches}</h2>
        <DataTable
          locale={locale}
          caption="batches"
          items={batches.items}
          columns={[
            { key: 'batchCode', label: 'batchCode' },
            { key: 'sourcingType', label: 'sourcingType', format: 'state' },
            { key: 'harvestSeason', label: 'harvestSeason' },
            { key: 'quantityGrams', label: 'quantityGrams' },
          ]}
          detailHref={(row) => `/${locale}/admin/sourcing/batches/${identifier(row['id'])}`}
        />
        <Pagination
          locale={locale}
          path={`/${locale}/admin/sourcing`}
          query={query}
          nextCursor={batches.nextCursor}
        />
        {write && (
          <details>
            <summary>{m.create}</summary>
            <HarvestBatchForm locale={locale} csrf={csrfConfig()} />
          </details>
        )}
      </section>
      {write && (
        <section className="admin-panel">
          <h2>{m.productionIntake}</h2>
          <ProductionIntakeForm locale={locale} csrf={csrfConfig()} />
        </section>
      )}
    </AdminPage>
  );
}
