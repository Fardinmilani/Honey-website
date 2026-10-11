import { getNamespace } from '@honey/i18n';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { adminPageData, DataTable, Facts, Pagination } from '@/components/admin/admin-data';
import {
  OrderCancel,
  OrderNoteForm,
  RefundForm,
  ShipmentForm,
  ShipmentTransition,
} from '@/components/admin/order-forms';
import {
  adminLocale,
  adminQuery,
  adminRead,
  adminUser,
  csrfConfig,
  type AdminSearchParams,
} from '@/lib/admin/server';
import {
  identifier,
  optionalText,
  record,
  records,
  type AdminRecord,
} from '@/lib/admin/validation';
export default async function OrderPage({
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
  if (!user.permissions.includes('order:read')) return <AdminDenied locale={locale} />;
  const search = await searchParams;
  const query = adminQuery(search, ['cursor', 'limit']);
  const paymentQuery = adminQuery({ ...search, cursor: search['paymentCursor'] }, [
    'cursor',
    'limit',
  ]);
  const pageQuery = adminQuery(search, ['cursor', 'paymentCursor', 'limit']);
  const [rawOrder, rawNotes, rawFulfilment, rawPayments] = await Promise.all([
    adminRead(locale, `/v1/admin/orders/${id}`),
    adminRead(locale, `/v1/admin/orders/${id}/notes`, query),
    adminRead(locale, `/v1/admin/fulfilment/orders/${id}`),
    adminRead(locale, `/v1/admin/payments/orders/${id}`, paymentQuery),
  ]);
  const order = record(rawOrder);
  const notes = adminPageData(rawNotes);
  const shipments = records(record(rawFulfilment)['shipments']);
  const payments = adminPageData(rawPayments);
  const m = getNamespace(locale, 'admin');
  const lines = records(order['lines']).map((line): AdminRecord => ({
    ...line,
    productNameText: optionalText(record(line['productName'])[locale]) ?? m.incomplete,
    variantNameText: optionalText(record(line['variantName'])[locale]) ?? m.incomplete,
  }));
  return (
    <AdminPage locale={locale} title="orders">
      <a className="admin-button" href={`/${locale}/admin/orders`}>
        {m.orders}
      </a>
      <section className="admin-panel">
        <Facts
          locale={locale}
          row={order}
          fields={[
            { key: 'number', label: 'number' },
            { key: 'status', label: 'status' },
            { key: 'paymentStatus', label: 'paymentStatus' },
            { key: 'fulfilmentStatus', label: 'fulfilmentStatus' },
            { key: 'email', label: 'email' },
            { key: 'phone', label: 'phone' },
            { key: 'currency', label: 'currency' },
            { key: 'subtotalMinor', label: 'subtotalMinor' },
            { key: 'discountTotalMinor', label: 'discountTotalMinor' },
            { key: 'shippingTotalMinor', label: 'shippingTotalMinor' },
            { key: 'taxTotalMinor', label: 'taxTotalMinor' },
            { key: 'grandTotalMinor', label: 'grandTotalMinor' },
            { key: 'refundedTotalMinor', label: 'refundedTotalMinor' },
          ]}
        />
        <DataTable
          locale={locale}
          caption="lines"
          items={lines}
          columns={[
            { key: 'sku', label: 'sku' },
            { key: 'productNameText', label: 'name' },
            { key: 'variantNameText', label: 'variants' },
            { key: 'quantity', label: 'quantity' },
            { key: 'unitPriceMinor', label: 'unitCostMinor' },
            { key: 'discountMinor', label: 'discountTotalMinor' },
            { key: 'taxMinor', label: 'taxMinor' },
            { key: 'totalMinor', label: 'grandTotalMinor' },
          ]}
        />
      </section>
      <div className="admin-grid">
        {(['shippingAddress', 'billingAddress'] as const).map((key) => (
          <section key={key} className="admin-panel">
            <h2>{m[key]}</h2>
            <Facts
              locale={locale}
              row={record(order[key])}
              fields={[
                { key: 'fullName', label: 'fullName' },
                { key: 'phone', label: 'phone' },
                { key: 'country', label: 'country' },
                { key: 'province', label: 'province' },
                { key: 'city', label: 'city' },
                { key: 'postalCode', label: 'postalCode' },
                { key: 'line1', label: 'line1' },
                { key: 'line2', label: 'line2' },
              ]}
            />
          </section>
        ))}
      </div>
      <section className="admin-panel">
        <h2>{m.notes}</h2>
        <DataTable
          locale={locale}
          caption="notes"
          items={notes.items}
          columns={[
            { key: 'body', label: 'note' },
            { key: 'actorUserId', label: 'actorUserId' },
            { key: 'createdAt', label: 'createdAt', format: 'date' },
          ]}
        />
        <Pagination
          locale={locale}
          path={`/${locale}/admin/orders/${id}`}
          query={pageQuery}
          nextCursor={notes.nextCursor}
        />
        {user.permissions.includes('order:note') && (
          <OrderNoteForm locale={locale} csrf={csrfConfig()} orderId={id} />
        )}
      </section>
      <section className="admin-panel">
        <h2>{m.shipments}</h2>
        <DataTable
          locale={locale}
          caption="shipments"
          items={shipments}
          columns={[
            { key: 'id', label: 'identifier' },
            { key: 'status', label: 'status', format: 'state' },
            { key: 'trackingNumber', label: 'trackingNumber' },
            { key: 'trackingUrl', label: 'trackingUrl' },
            { key: 'shippedAt', label: 'createdAt', format: 'date' },
            { key: 'deliveredAt', label: 'updatedAt', format: 'date' },
          ]}
        />
        {user.permissions.includes('order:write') && (
          <>
            {order['paymentStatus'] === 'PAID' &&
              ['PAID', 'PROCESSING', 'PARTIALLY_FULFILLED'].includes(String(order['status'])) && (
                <ShipmentForm
                  locale={locale}
                  csrf={csrfConfig()}
                  order={order}
                  shipments={shipments}
                />
              )}
            {shipments.map((shipment) => (
              <div key={identifier(shipment['id'])}>
                {['PENDING', 'LABEL_CREATED'].includes(String(shipment['status'])) && (
                  <ShipmentTransition
                    locale={locale}
                    csrf={csrfConfig()}
                    shipmentId={identifier(shipment['id'])}
                    action="dispatch"
                  />
                )}
                {shipment['status'] === 'IN_TRANSIT' && (
                  <ShipmentTransition
                    locale={locale}
                    csrf={csrfConfig()}
                    shipmentId={identifier(shipment['id'])}
                    action="deliver"
                  />
                )}
              </div>
            ))}
          </>
        )}
        {user.permissions.includes('order:cancel') &&
          shipments.length === 0 &&
          order['paymentStatus'] === 'PAID' &&
          order['fulfilmentStatus'] === 'UNFULFILLED' &&
          ['PAID', 'PROCESSING'].includes(String(order['status'])) && (
            <OrderCancel locale={locale} csrf={csrfConfig()} orderId={id} />
          )}
      </section>
      <section className="admin-panel">
        <h2>{m.payments}</h2>
        <Pagination
          locale={locale}
          path={`/${locale}/admin/orders/${id}`}
          query={pageQuery}
          nextCursor={payments.nextCursor}
          cursorKey="paymentCursor"
        />
        <DataTable
          locale={locale}
          caption="payments"
          items={payments.items}
          columns={[
            { key: 'id', label: 'identifier' },
            { key: 'provider', label: 'provider' },
            { key: 'status', label: 'status', format: 'state' },
            { key: 'amountMinor', label: 'amountMinor' },
            { key: 'currency', label: 'currency' },
            { key: 'remainingRefundableMinor', label: 'remainingRefundableMinor' },
          ]}
        />
        {payments.items.map((payment) => (
          <div key={identifier(payment['id'])}>
            <DataTable
              locale={locale}
              caption="refund"
              items={records(payment['refunds'])}
              columns={[
                { key: 'id', label: 'identifier' },
                { key: 'amountMinor', label: 'amountMinor' },
                { key: 'reason', label: 'reason' },
                { key: 'status', label: 'status', format: 'state' },
                { key: 'createdAt', label: 'createdAt', format: 'date' },
              ]}
            />
            {user.permissions.includes('order:refund') && payment['canRefund'] === true && (
              <RefundForm locale={locale} csrf={csrfConfig()} payment={payment} />
            )}
          </div>
        ))}
      </section>
      <section className="admin-panel">
        <h2>{m.history}</h2>
        <DataTable
          locale={locale}
          caption="history"
          items={records(order['history'])}
          columns={[
            { key: 'fromStatus', label: 'status' },
            { key: 'toStatus', label: 'status', format: 'state' },
            { key: 'createdAt', label: 'createdAt', format: 'date' },
          ]}
        />
      </section>
    </AdminPage>
  );
}
