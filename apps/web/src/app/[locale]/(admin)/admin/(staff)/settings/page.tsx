import { randomUUID } from 'node:crypto';
import { getNamespace } from '@honey/i18n';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { DataTable } from '@/components/admin/admin-data';
import { ShippingMethodForm, ShippingRateForm, ZoneForm } from '@/components/admin/shipping-forms';
import { adminLocale, adminRead, adminUser, csrfConfig } from '@/lib/admin/server';
import { identifier, record, records, text, type AdminRecord } from '@/lib/admin/validation';
export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = adminLocale((await params).locale);
  const user = await adminUser(locale);
  if (!user.permissions.includes('settings:read')) return <AdminDenied locale={locale} />;
  const m = getNamespace(locale, 'admin');
  const config = record(await adminRead(locale, '/v1/admin/shipping/configuration'));
  const zones = records(config['zones']);
  const methods = zones.flatMap((zone) =>
    records(zone['methods']).map((method): AdminRecord => ({
      ...method,
      zoneId: identifier(zone['id']),
    })),
  );
  const rates = methods.flatMap((method) =>
    records(method['rates']).map((rate): AdminRecord => ({
      ...rate,
      methodId: identifier(method['id']),
    })),
  );
  const write = user.permissions.includes('settings:write');
  return (
    <AdminPage locale={locale} title="settings" description="settingsDescription">
      <section className="admin-panel">
        <h2>{m.zones}</h2>
        <DataTable
          locale={locale}
          caption="zones"
          items={zones}
          columns={[
            { key: 'id', label: 'identifier' },
            { key: 'name', label: 'name' },
            { key: 'countries', label: 'countries', format: 'list' },
            { key: 'provinces', label: 'provinces', format: 'list' },
            { key: 'priority', label: 'priority' },
          ]}
        />
        {write && (
          <>
            <details>
              <summary>{m.create}</summary>
              <ZoneForm locale={locale} csrf={csrfConfig()} id={randomUUID()} />
            </details>
            {zones.map((row) => (
              <details key={identifier(row['id'])}>
                <summary>
                  {m.edit}: {text(row['name'])}
                </summary>
                <ZoneForm
                  locale={locale}
                  csrf={csrfConfig()}
                  id={identifier(row['id'])}
                  row={row}
                />
              </details>
            ))}
          </>
        )}
      </section>
      <section className="admin-panel">
        <h2>{m.methods}</h2>
        <DataTable
          locale={locale}
          caption="methods"
          items={methods}
          columns={[
            { key: 'id', label: 'identifier' },
            { key: 'code', label: 'code' },
            { key: 'zoneId', label: 'zoneId' },
            { key: 'isActive', label: 'isActive', format: 'boolean' },
          ]}
        />
        {write && (
          <>
            <details>
              <summary>{m.create}</summary>
              <ShippingMethodForm locale={locale} csrf={csrfConfig()} id={randomUUID()} />
            </details>
            {methods.map((row) => (
              <details key={identifier(row['id'])}>
                <summary>
                  {m.edit}: {text(row['code'])}
                </summary>
                <ShippingMethodForm
                  locale={locale}
                  csrf={csrfConfig()}
                  id={identifier(row['id'])}
                  row={row}
                />
              </details>
            ))}
          </>
        )}
      </section>
      <section className="admin-panel">
        <h2>{m.rates}</h2>
        <p className="admin-help">{m.moneyHelp}</p>
        <DataTable
          locale={locale}
          caption="rates"
          items={rates}
          columns={[
            { key: 'id', label: 'identifier' },
            { key: 'methodId', label: 'methodId' },
            { key: 'baseMinor', label: 'baseMinor' },
            { key: 'perKgMinor', label: 'perKgMinor' },
            { key: 'currency', label: 'currency' },
            { key: 'validFrom', label: 'validFrom', format: 'date' },
          ]}
        />
        {write && (
          <>
            <details>
              <summary>{m.create}</summary>
              <ShippingRateForm locale={locale} csrf={csrfConfig()} id={randomUUID()} />
            </details>
            {rates.map((row) => (
              <details key={identifier(row['id'])}>
                <summary>
                  {m.edit}: <bdi>{identifier(row['id'])}</bdi>
                </summary>
                <ShippingRateForm
                  locale={locale}
                  csrf={csrfConfig()}
                  id={identifier(row['id'])}
                  row={row}
                />
              </details>
            ))}
          </>
        )}
      </section>
      {user.permissions.includes('pricing:read') && (
        <a className="admin-button" href={`/${locale}/admin/pricing?view=tax-rates`}>
          {m.taxRates}
        </a>
      )}
    </AdminPage>
  );
}
