'use client';
import { getNamespace } from '@honey/i18n';
import {
  identifier,
  number,
  optionalText,
  records,
  type AdminRecord,
} from '@/lib/admin/validation';
import { AdminForm, Field, integer, value, type FormContext } from './admin-form';
export function OrderNoteForm({ locale, csrf, orderId }: FormContext & { orderId: string }) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/orders/${orderId}/notes`}
      submit="addNote"
      build={(data) => ({ body: value(data, 'body') })}
    >
      <Field locale={locale} label="note" name="body" multiline maxLength={2000} hint="noteHelp" />
    </AdminForm>
  );
}
export function ShipmentForm({
  locale,
  csrf,
  order,
  shipments,
}: FormContext & { order: AdminRecord; shipments: readonly AdminRecord[] }) {
  const m = getNamespace(locale, 'admin');
  const lines = records(order['lines']);
  function remaining(line: AdminRecord) {
    const claimed = shipments
      .flatMap((shipment) => records(shipment['lines']))
      .filter((entry) => entry['orderLineId'] === line['id'])
      .reduce((sum, entry) => sum + number(entry['quantity']), 0);
    return Math.max(0, number(line['quantity']) - claimed);
  }
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/fulfilment/orders/${identifier(order['id'])}/shipments`}
      submit="prepareShipment"
      idempotent
      danger
      build={(data) => ({
        lines: lines
          .map((line, index) => ({
            orderLineId: identifier(line['id']),
            quantity: integer(data, `lines.${index}.quantity`),
          }))
          .filter((line) => line.quantity > 0),
        ...(value(data, 'trackingNumber') === ''
          ? {}
          : { trackingNumber: value(data, 'trackingNumber') }),
      })}
    >
      <Field locale={locale} label="trackingNumber" required={false} />
      {lines.map((line, index) => (
        <fieldset key={identifier(line['id'])}>
          <legend>{optionalText(line['sku']) ?? identifier(line['id'])}</legend>
          <p>
            {m.quantity}: <bdi>{number(line['quantity'])}</bdi>
          </p>
          <Field
            locale={locale}
            label="quantity"
            name={`lines.${index}.quantity`}
            type="number"
            min={0}
            max={remaining(line)}
            initial={0}
          />
        </fieldset>
      ))}
    </AdminForm>
  );
}
export function ShipmentTransition({
  locale,
  csrf,
  shipmentId,
  action,
}: FormContext & { shipmentId: string; action: 'dispatch' | 'deliver' }) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/fulfilment/shipments/${shipmentId}/${action}`}
      danger
      build={() => ({})}
      submit={action}
    />
  );
}
export function OrderCancel({ locale, csrf, orderId }: FormContext & { orderId: string }) {
  const m = getNamespace(locale, 'admin');
  return (
    <>
      <p className="admin-help">{m.cancelOrderHelp}</p>
      <AdminForm
        locale={locale}
        csrf={csrf}
        path={`/api/bff/admin/fulfilment/orders/${orderId}/cancel`}
        build={() => ({})}
        danger
        submit="cancelOrder"
      />
    </>
  );
}
export function RefundForm({ locale, csrf, payment }: FormContext & { payment: AdminRecord }) {
  const m = getNamespace(locale, 'admin');
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/payments/${identifier(payment['id'])}/refunds`}
      idempotent
      danger
      submit="refund"
      build={(data) => ({
        amountMinor: payment['partialRefund'] === true ? value(data, 'amountMinor') : null,
        reason: value(data, 'reason'),
      })}
    >
      <p className="admin-help">{m.refundHelp}</p>
      <p>
        {m.remainingRefundableMinor}: <bdi>{optionalText(payment['remainingRefundableMinor'])}</bdi>{' '}
        <bdi>{optionalText(payment['currency'])}</bdi>
      </p>
      {payment['partialRefund'] === true && (
        <Field
          locale={locale}
          label="amountMinor"
          initial={optionalText(payment['remainingRefundableMinor'])}
          maxLength={19}
        />
      )}
      <Field locale={locale} label="reason" multiline maxLength={500} />
    </AdminForm>
  );
}
