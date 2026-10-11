import { getNamespace } from '@honey/i18n';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { adminPageData, DataTable, Filters, Pagination } from '@/components/admin/admin-data';
import { CouponForm, CouponStatusForm, PriceForm, TaxForm } from '@/components/admin/pricing-forms';
import {
  adminLocale,
  adminQuery,
  adminRead,
  adminUser,
  csrfConfig,
  type AdminSearchParams,
} from '@/lib/admin/server';
import { identifier, text } from '@/lib/admin/validation';
export default async function PricingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const locale = adminLocale((await params).locale);
  const user = await adminUser(locale);
  if (!user.permissions.includes('pricing:read')) return <AdminDenied locale={locale} />;
  const m = getNamespace(locale, 'admin');
  const search = await searchParams;
  const view =
    search['view'] === 'coupons'
      ? 'coupons'
      : search['view'] === 'tax-rates'
        ? 'tax-rates'
        : 'variant-prices';
  const query = adminQuery(
    search,
    view === 'variant-prices'
      ? ['cursor', 'limit', 'variantId']
      : view === 'coupons'
        ? ['cursor', 'limit', 'status']
        : ['cursor', 'limit'],
  );
  const result = adminPageData(await adminRead(locale, `/v1/admin/pricing/${view}/page`, query));
  const path = `/${locale}/admin/pricing`;
  const write = user.permissions.includes('pricing:write');
  return (
    <AdminPage locale={locale} title="pricing" description="pricingDescription">
      <nav className="admin-tabs">
        {(
          [
            { key: 'variant-prices', label: 'prices' },
            { key: 'coupons', label: 'coupons' },
            { key: 'tax-rates', label: 'taxRates' },
          ] as const
        ).map((tab) => (
          <a
            key={tab.key}
            href={`${path}?view=${tab.key}`}
            aria-current={view === tab.key ? 'page' : undefined}
          >
            {m[tab.label]}
          </a>
        ))}
      </nav>
      <p className="admin-help">{m.moneyHelp}</p>
      {view === 'variant-prices' && (
        <>
          <Filters
            locale={locale}
            path={path}
            query={query}
            fields={[{ key: 'variantId', label: 'variantId' }]}
          />
          <DataTable
            locale={locale}
            caption="prices"
            items={result.items}
            columns={[
              { key: 'variantId', label: 'variantId' },
              { key: 'amountMinor', label: 'amountMinor' },
              { key: 'currency', label: 'currency' },
              { key: 'compareAtMinor', label: 'compareAtMinor' },
              { key: 'validFrom', label: 'validFrom', format: 'date' },
              { key: 'validTo', label: 'validTo', format: 'date' },
            ]}
          />
          {write && (
            <section className="admin-panel">
              <h2>{m.create}</h2>
              <PriceForm locale={locale} csrf={csrfConfig()} />
            </section>
          )}
        </>
      )}
      {view === 'coupons' && (
        <>
          <Filters
            locale={locale}
            path={path}
            query={query}
            fixed={{ view }}
            fields={[
              { key: 'status', label: 'status', options: ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED'] },
            ]}
          />
          <DataTable
            locale={locale}
            caption="coupons"
            items={result.items}
            columns={[
              { key: 'code', label: 'code' },
              { key: 'type', label: 'type', format: 'state' },
              { key: 'value', label: 'value' },
              { key: 'status', label: 'status', format: 'state' },
              { key: 'startsAt', label: 'startsAt', format: 'date' },
              { key: 'endsAt', label: 'endsAt', format: 'date' },
            ]}
          />
          {write && (
            <section className="admin-panel">
              <details>
                <summary>{m.create}</summary>
                <CouponForm locale={locale} csrf={csrfConfig()} />
              </details>
              {result.items.map((row) => (
                <details key={identifier(row['id'])}>
                  <summary>
                    {m.edit}: {text(row['code'])}
                  </summary>
                  <CouponStatusForm locale={locale} csrf={csrfConfig()} row={row} />
                </details>
              ))}
            </section>
          )}
        </>
      )}
      {view === 'tax-rates' && (
        <>
          <DataTable
            locale={locale}
            caption="taxRates"
            items={result.items}
            columns={[
              { key: 'code', label: 'code' },
              { key: 'rateBps', label: 'rateBps' },
              { key: 'country', label: 'country' },
              { key: 'region', label: 'region' },
              { key: 'isInclusive', label: 'isInclusive', format: 'boolean' },
              { key: 'isActive', label: 'isActive', format: 'boolean' },
            ]}
          />
          {write && (
            <section className="admin-panel">
              <details>
                <summary>{m.create}</summary>
                <TaxForm locale={locale} csrf={csrfConfig()} />
              </details>
              {result.items.map((row) => (
                <details key={identifier(row['id'])}>
                  <summary>
                    {m.edit}: {text(row['code'])}
                  </summary>
                  <TaxForm locale={locale} csrf={csrfConfig()} row={row} />
                </details>
              ))}
            </section>
          )}
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
