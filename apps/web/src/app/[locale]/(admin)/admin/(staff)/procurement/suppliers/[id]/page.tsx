import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { Facts } from '@/components/admin/admin-data';
import { SupplierForm } from '@/components/admin/procurement-forms';
import { adminLocale, adminRead, adminUser, csrfConfig } from '@/lib/admin/server';
import { identifier, record } from '@/lib/admin/validation';
export default async function SupplierPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const values = await params;
  const locale = adminLocale(values.locale);
  const user = await adminUser(locale);
  if (!user.permissions.includes('procurement:read')) return <AdminDenied locale={locale} />;
  const row = record(
    await adminRead(locale, `/v1/admin/procurement/suppliers/${identifier(values.id)}`),
  );
  return (
    <AdminPage locale={locale} title="suppliers">
      <section className="admin-panel">
        <Facts
          locale={locale}
          row={row}
          fields={[
            { key: 'id', label: 'identifier' },
            { key: 'code', label: 'code' },
            { key: 'legalName', label: 'legalName' },
            { key: 'status', label: 'status' },
            { key: 'contactName', label: 'contactName' },
            { key: 'email', label: 'email' },
            { key: 'phone', label: 'phone' },
            { key: 'address', label: 'address' },
          ]}
        />
        {user.permissions.includes('procurement:write') && (
          <SupplierForm locale={locale} csrf={csrfConfig()} row={row} />
        )}
      </section>
    </AdminPage>
  );
}
