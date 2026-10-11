'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getNamespace } from '@honey/i18n';
import {
  identifier,
  number,
  optionalText,
  record,
  records,
  text,
  type AdminRecord,
} from '@/lib/admin/validation';
import {
  AdminForm,
  Field,
  integer,
  nullable,
  nullableInteger,
  nullableTimestamp,
  value,
  type FormContext,
} from './admin-form';
export function SupplierForm({ locale, csrf, row }: FormContext & { row?: AdminRecord }) {
  const router = useRouter();
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={
        row === undefined
          ? '/api/bff/admin/procurement/suppliers'
          : `/api/bff/admin/procurement/suppliers/${identifier(row['id'])}`
      }
      method={row === undefined ? 'POST' : 'PATCH'}
      submit={row === undefined ? 'create' : 'save'}
      onSuccess={
        row === undefined
          ? (result) =>
              router.push(
                `/${locale}/admin/procurement/suppliers/${identifier(record(result)['id'])}`,
              )
          : () => undefined
      }
      build={(data) => ({
        code: row === undefined ? value(data, 'code') : text(row['code']),
        legalName: value(data, 'legalName'),
        contactName: nullable(data, 'contactName'),
        email: nullable(data, 'email'),
        phone: nullable(data, 'phone'),
        address: nullable(data, 'address'),
        status: value(data, 'status'),
        qualityRating: nullableInteger(data, 'qualityRating'),
        notes: nullable(data, 'notes'),
      })}
    >
      <div className="admin-grid">
        {(['code', 'legalName', 'contactName', 'email', 'phone', 'address', 'notes'] as const).map(
          (label) => (
            <Field
              key={label}
              locale={locale}
              label={label}
              initial={optionalText(row?.[label])}
              required={label === 'code' || label === 'legalName'}
              multiline={label === 'address' || label === 'notes'}
              type={label === 'email' ? 'email' : 'text'}
              readOnly={row !== undefined && label === 'code'}
            />
          ),
        )}
        <Field
          locale={locale}
          label="qualityRating"
          type="number"
          min={1}
          max={5}
          required={false}
          initial={
            row === undefined || row['qualityRating'] === null ? '' : number(row['qualityRating'])
          }
        />
        <Field
          locale={locale}
          label="status"
          options={['ACTIVE', 'PAUSED', 'BLOCKED']}
          initial={row === undefined ? 'ACTIVE' : text(row['status'])}
        />
      </div>
    </AdminForm>
  );
}
export function PurchaseOrderForm({ locale, csrf, row }: FormContext & { row?: AdminRecord }) {
  const m = getNamespace(locale, 'admin');
  const router = useRouter();
  const initial = row === undefined ? [] : records(row['lines']);
  const [keys, setKeys] = useState<number[]>(
    initial.length === 0 ? [0] : initial.map((_, index) => index),
  );
  const counter = useRef(Math.max(initial.length, 1));
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={
        row === undefined
          ? '/api/bff/admin/procurement/purchase-orders'
          : `/api/bff/admin/procurement/purchase-orders/${identifier(row['id'])}/lines`
      }
      submit={row === undefined ? 'create' : 'save'}
      build={(data) => {
        const lines = keys.map((_, index) => ({
          description: value(data, `lines.${index}.description`),
          variantId: nullable(data, `lines.${index}.variantId`),
          harvestBatchId: nullable(data, `lines.${index}.harvestBatchId`),
          quantityOrdered: integer(data, `lines.${index}.quantityOrdered`),
          unitCostMinor: value(data, `lines.${index}.unitCostMinor`),
          taxMinor: value(data, `lines.${index}.taxMinor`),
        }));
        return row === undefined
          ? {
              number: value(data, 'number'),
              supplierId: value(data, 'supplierId'),
              currency: value(data, 'currency'),
              expectedAt: nullableTimestamp(data, 'expectedAt'),
              notes: nullable(data, 'notes'),
              destinationStockLocationId: nullable(data, 'destinationStockLocationId'),
              freightCostMinor: value(data, 'freightCostMinor'),
              dutyCostMinor: value(data, 'dutyCostMinor'),
              otherCostMinor: value(data, 'otherCostMinor'),
              lines,
            }
          : { lines };
      }}
      onSuccess={
        row === undefined
          ? (result) =>
              router.push(
                `/${locale}/admin/procurement/purchase-orders/${identifier(record(result)['id'])}`,
              )
          : () => undefined
      }
    >
      {row === undefined && (
        <div className="admin-grid">
          <Field locale={locale} label="number" />
          <Field locale={locale} label="supplierId" />
          <Field locale={locale} label="currency" initial="IRR" maxLength={3} />
          <Field
            locale={locale}
            label="expectedAt"
            type="datetime-local"
            required={false}
            hint="timestampsLocal"
          />
          <Field locale={locale} label="destinationStockLocationId" required={false} />
          {(['freightCostMinor', 'dutyCostMinor', 'otherCostMinor'] as const).map((label) => (
            <Field key={label} locale={locale} label={label} initial="0" maxLength={19} />
          ))}
          <Field locale={locale} label="notes" multiline required={false} />
        </div>
      )}
      <p className="admin-help">{m.moneyHelp}</p>
      {keys.map((key, index) => {
        const entry = initial[key];
        return (
          <fieldset key={key}>
            <legend>
              {m.lines} {index + 1}
            </legend>
            <div className="admin-grid">
              {(
                ['description', 'variantId', 'harvestBatchId', 'unitCostMinor', 'taxMinor'] as const
              ).map((label) => (
                <Field
                  key={label}
                  locale={locale}
                  label={label}
                  name={`lines.${index}.${label}`}
                  required={label !== 'variantId' && label !== 'harvestBatchId'}
                  initial={optionalText(entry?.[label]) ?? (label === 'taxMinor' ? '0' : '')}
                />
              ))}
              <Field
                locale={locale}
                label="quantityOrdered"
                name={`lines.${index}.quantityOrdered`}
                type="number"
                min={1}
                initial={entry === undefined ? '' : number(entry['quantityOrdered'])}
              />
            </div>
            <button
              type="button"
              onClick={() => setKeys(keys.filter((item) => item !== key))}
              disabled={keys.length === 1}
            >
              {m.removeLine}
            </button>
          </fieldset>
        );
      })}
      <button
        type="button"
        onClick={() => {
          const key = counter.current++;
          setKeys([...keys, key]);
        }}
        disabled={keys.length >= 100}
      >
        {m.addLine}
      </button>
    </AdminForm>
  );
}
export function PurchaseOrderTransition({
  locale,
  csrf,
  order,
}: FormContext & { order: AdminRecord }) {
  const status = text(order['status']);
  const options =
    status === 'DRAFT'
      ? ['SUBMITTED', 'CANCELLED']
      : status === 'SUBMITTED'
        ? ['DRAFT', 'CONFIRMED', 'CANCELLED']
        : status === 'CONFIRMED'
          ? ['CANCELLED']
          : [];
  if (options.length === 0) return null;
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/procurement/purchase-orders/${identifier(order['id'])}/transition`}
      submit="transition"
      danger
      build={(data) => ({ status: value(data, 'status') })}
    >
      <Field locale={locale} label="status" options={options} />
    </AdminForm>
  );
}
export function GoodsReceiptForm({ locale, csrf, order }: FormContext & { order: AdminRecord }) {
  const m = getNamespace(locale, 'admin');
  const lines = records(order['lines']);
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/procurement/purchase-orders/${identifier(order['id'])}/receipts`}
      submit="goodsReceipt"
      idempotent
      danger
      build={(data) => ({
        stockLocationId: value(data, 'stockLocationId'),
        notes: nullable(data, 'notes'),
        lines: lines
          .map((line, index) => ({
            purchaseOrderLineId: identifier(line['id']),
            quantityAccepted: integer(data, `lines.${index}.quantityAccepted`),
            quantityRejected: integer(data, `lines.${index}.quantityRejected`),
            rejectionReason: nullable(data, `lines.${index}.rejectionReason`),
            harvestBatchId: value(data, `lines.${index}.harvestBatchId`),
          }))
          .filter((line) => line.quantityAccepted > 0 || line.quantityRejected > 0),
      })}
    >
      <p className="admin-help">{m.receiptHelp}</p>
      <Field
        locale={locale}
        label="stockLocationId"
        initial={optionalText(order['destinationStockLocationId'])}
      />
      <Field locale={locale} label="notes" multiline required={false} />
      {lines.map((line, index) => (
        <fieldset key={identifier(line['id'])}>
          <legend>{text(line['description'])}</legend>
          <p>
            <bdi>{identifier(line['id'])}</bdi>
          </p>
          <div className="admin-grid">
            <Field
              locale={locale}
              label="quantityAccepted"
              name={`lines.${index}.quantityAccepted`}
              type="number"
              min={0}
              initial={0}
            />
            <Field
              locale={locale}
              label="quantityRejected"
              name={`lines.${index}.quantityRejected`}
              type="number"
              min={0}
              initial={0}
            />
            <Field
              locale={locale}
              label="rejectionReason"
              name={`lines.${index}.rejectionReason`}
              required={false}
            />
            <Field
              locale={locale}
              label="harvestBatchId"
              name={`lines.${index}.harvestBatchId`}
              initial={optionalText(line['harvestBatchId'])}
              required={false}
            />
          </div>
        </fieldset>
      ))}
    </AdminForm>
  );
}
