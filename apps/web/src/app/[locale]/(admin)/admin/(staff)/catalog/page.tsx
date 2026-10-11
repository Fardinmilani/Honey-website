import { getNamespace } from '@honey/i18n';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import {
  adminPageData,
  DataTable,
  Filters,
  Pagination,
  translationName,
} from '@/components/admin/admin-data';
import {
  CatalogTransition,
  ProductForm,
  TaxonomyCreate,
  TaxonomyEdit,
} from '@/components/admin/catalog-forms';
import {
  adminLocale,
  adminQuery,
  adminRead,
  adminUser,
  csrfConfig,
  type AdminSearchParams,
} from '@/lib/admin/server';
import { identifier } from '@/lib/admin/validation';
export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const locale = adminLocale((await params).locale);
  const user = await adminUser(locale);
  if (!user.permissions.includes('catalog:read')) return <AdminDenied locale={locale} />;
  const m = getNamespace(locale, 'admin');
  const search = await searchParams;
  const view =
    search['view'] === 'categories'
      ? 'categories'
      : search['view'] === 'collections'
        ? 'collections'
        : 'products';
  const query = adminQuery(
    search,
    view === 'products' ? ['cursor', 'limit', 'q', 'status'] : ['cursor', 'limit', 'id'],
  );
  const result = adminPageData(await adminRead(locale, `/v1/admin/catalog/${view}`, query));
  const path = `/${locale}/admin/catalog`;
  const write = user.permissions.includes('catalog:write');
  return (
    <AdminPage locale={locale} title="catalog" description="catalogDescription">
      <nav className="admin-tabs">
        {(['products', 'categories', 'collections'] as const).map((tab) => (
          <a
            key={tab}
            href={`${path}?view=${tab}`}
            aria-current={view === tab ? 'page' : undefined}
          >
            {m[tab]}
          </a>
        ))}
      </nav>
      {view === 'products' ? (
        <>
          <Filters
            locale={locale}
            path={path}
            query={query}
            fields={[
              { key: 'q', label: 'search' },
              { key: 'status', label: 'status', options: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] },
            ]}
          />
          <DataTable
            locale={locale}
            caption="products"
            items={result.items}
            columns={[
              { key: 'name', label: 'name', format: 'localized' },
              { key: 'sku', label: 'sku' },
              { key: 'status', label: 'status', format: 'state' },
              { key: 'updatedAt', label: 'updatedAt', format: 'date' },
            ]}
            detailHref={(row) => `${path}/products/${identifier(row['id'])}`}
          />
          {write && (
            <section className="admin-panel">
              <details>
                <summary>{m.create}</summary>
                <ProductForm locale={locale} csrf={csrfConfig()} />
              </details>
            </section>
          )}
        </>
      ) : (
        <>
          <DataTable
            locale={locale}
            caption={view}
            items={result.items}
            columns={[
              { key: 'id', label: 'identifier' },
              { key: 'name', label: 'name', format: 'localized' },
              { key: 'parentId', label: 'parentId' },
              { key: 'sortWeight', label: 'sortWeight' },
            ]}
          />
          {write && (
            <section className="admin-panel">
              <details>
                <summary>{m.create}</summary>
                <TaxonomyCreate locale={locale} csrf={csrfConfig()} kind={view} />
              </details>
            </section>
          )}
          {result.items.map((row) => (
            <section key={identifier(row['id'])} className="admin-panel">
              <h2>{translationName(row, locale)}</h2>
              <p className="admin-help">{m.translationHelp}</p>
              {write && <TaxonomyEdit locale={locale} csrf={csrfConfig()} kind={view} row={row} />}
              {view === 'collections' &&
                user.permissions.includes('catalog:publish') &&
                row['status'] !== 'ARCHIVED' && (
                  <div className="admin-grid">
                    <CatalogTransition
                      locale={locale}
                      csrf={csrfConfig()}
                      path={`collections/${identifier(row['id'])}`}
                      action="publish"
                    />
                    <CatalogTransition
                      locale={locale}
                      csrf={csrfConfig()}
                      path={`collections/${identifier(row['id'])}`}
                      action="archive"
                    />
                  </div>
                )}
            </section>
          ))}
        </>
      )}
      <Pagination
        locale={locale}
        path={path}
        query={{ ...query, view }}
        nextCursor={result.nextCursor}
      />
    </AdminPage>
  );
}
