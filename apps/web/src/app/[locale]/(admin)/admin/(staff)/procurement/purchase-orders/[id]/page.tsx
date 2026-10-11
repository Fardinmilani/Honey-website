import { getNamespace } from '@honey/i18n';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { DataTable, Facts } from '@/components/admin/admin-data';
import {
  GoodsReceiptForm,
  PurchaseOrderForm,
  PurchaseOrderTransition,
} from '@/components/admin/procurement-forms';
import { adminLocale, adminRead, adminUser, csrfConfig } from '@/lib/admin/server';
import { identifier, record, records } from '@/lib/admin/validation';
export default async function PurchaseOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const values = await params;
  const locale = adminLocale(values.locale);
  const id = identifier(values.id);
  const user = await adminUser(locale);
  if (!user.permissions.includes('procurement:read')) return <AdminDenied locale={locale} />;
  const [rawOrder, rawLanded] = await Promise.all([
    adminRead(locale, `/v1/admin/procurement/purchase-orders/${id}`),
    adminRead(locale, `/v1/admin/procurement/purchase-orders/${id}/landed-cost`),
  ]);
  const order = record(rawOrder);
  const landed = record(rawLanded);
  const m = getNamespace(locale, 'admin');
  const write = user.permissions.includes('procurement:write');
  return (
    <AdminPage locale={locale} title="purchaseOrders">
      <section className="admin-panel">
        <Facts
          locale={locale}
          row={order}
          fields={[
            { key: 'id', label: 'identifier' },
            { key: 'number', label: 'number' },
            { key: 'supplierId', label: 'supplierId' },
            { key: 'status', label: 'status' },
            { key: 'currency', label: 'currency' },
            { key: 'destinationStockLocationId', label: 'destinationStockLocationId' },
            { key: 'notes', label: 'notes' },
          ]}
        />
        <DataTable
          locale={locale}
          caption="lines"
          items={records(order['lines'])}
          columns={[
            { key: 'description', label: 'description' },
            { key: 'variantId', label: 'variantId' },
            { key: 'quantityOrdered', label: 'quantityOrdered' },
            { key: 'unitCostMinor', label: 'unitCostMinor' },
            { key: 'taxMinor', label: 'taxMinor' },
            { key: 'lineTotalMinor', label: 'grandTotalMinor' },
            { key: 'quantityReceivedAccepted', label: 'quantityAccepted' },
            { key: 'quantityReceivedRejected', label: 'quantityRejected' },
          ]}
        />
        {write && (
          <>
            <PurchaseOrderTransition locale={locale} csrf={csrfConfig()} order={order} />
            {order['status'] === 'DRAFT' && (
              <details>
                <summary>{m.edit}</summary>
                <PurchaseOrderForm locale={locale} csrf={csrfConfig()} row={order} />
              </details>
            )}
          </>
        )}
      </section>
      <section className="admin-panel">
        <h2>{m.landedCost}</h2>
        <DataTable
          locale={locale}
          caption="landedCost"
          items={records(landed['lines'])}
          columns={[
            { key: 'purchaseOrderLineId', label: 'identifier' },
            { key: 'lineTotalMinor', label: 'subtotalMinor' },
            { key: 'allocatedExtraMinor', label: 'otherCostMinor' },
            { key: 'landedLineMinor', label: 'grandTotalMinor' },
            { key: 'landedUnitMinor', label: 'unitCostMinor' },
          ]}
        />
      </section>
      {write && ['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(String(order['status'])) && (
        <section className="admin-panel">
          <h2>{m.goodsReceipt}</h2>
          <GoodsReceiptForm locale={locale} csrf={csrfConfig()} order={order} />
        </section>
      )}
    </AdminPage>
  );
}
