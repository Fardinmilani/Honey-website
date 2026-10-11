'use client';
import { getNamespace } from '@honey/i18n';
import { identifier, number, text, type AdminRecord } from '@/lib/admin/validation';
import {
  AdminForm,
  Check,
  Field,
  Panel,
  checked,
  integer,
  value,
  type FormContext,
} from './admin-form';
export function LocationForm({ locale, csrf, row }: FormContext & { row?: AdminRecord }) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={
        row === undefined
          ? '/api/bff/admin/inventory/locations'
          : `/api/bff/admin/inventory/locations/${identifier(row['id'])}`
      }
      method={row === undefined ? 'POST' : 'PATCH'}
      build={(data) => ({
        code: row === undefined ? value(data, 'code') : text(row['code']),
        name: value(data, 'name'),
        type: value(data, 'locationType'),
        isSellable: checked(data, 'isSellable'),
        isDefault: checked(data, 'isDefault'),
      })}
      submit={row === undefined ? 'create' : 'save'}
    >
      <div className="admin-grid">
        <Field
          locale={locale}
          label="code"
          initial={row === undefined ? '' : text(row['code'])}
          readOnly={row !== undefined}
        />
        <Field locale={locale} label="name" initial={row === undefined ? '' : text(row['name'])} />
        <Field
          locale={locale}
          label="locationType"
          initial={row === undefined ? 'WAREHOUSE' : text(row['type'])}
          options={['WAREHOUSE', 'STUDIO', 'EXTERNAL']}
        />
        <Check locale={locale} label="isSellable" initial={row?.['isSellable'] === true} />
        <Check locale={locale} label="isDefault" initial={row?.['isDefault'] === true} />
      </div>
    </AdminForm>
  );
}
export function InventoryItemForms({ locale, csrf, item }: FormContext & { item: AdminRecord }) {
  const variantId = identifier(item['variantId']);
  const locationId = identifier(item['stockLocationId']);
  const m = getNamespace(locale, 'admin');
  return (
    <>
      <Panel locale={locale} title="adjust">
        <p className="admin-help">{m.adjustHelp}</p>
        <AdminForm
          locale={locale}
          csrf={csrf}
          path="/api/bff/admin/inventory/adjustments"
          danger
          build={(data) => ({
            variantId,
            stockLocationId: locationId,
            delta: integer(data, 'delta'),
            reason: value(data, 'reason'),
            note: value(data, 'note'),
            expectedVersion: number(item['version']),
          })}
          submit="adjust"
        >
          <div className="admin-grid">
            <Field locale={locale} label="delta" type="number" min={-1000000} max={1000000} />
            <Field
              locale={locale}
              label="reason"
              options={['ADJUSTMENT', 'WRITE_OFF', 'CORRECTION']}
            />
            <Field locale={locale} label="note" multiline maxLength={1000} />
          </div>
        </AdminForm>
      </Panel>
      <Panel locale={locale} title="planning">
        <AdminForm
          locale={locale}
          csrf={csrf}
          path={`/api/bff/admin/inventory/items/${variantId}/${locationId}/planning`}
          method="PATCH"
          build={(data) => ({
            reorderPoint: integer(data, 'reorderPoint'),
            safetyStock: integer(data, 'safetyStock'),
          })}
        >
          <div className="admin-grid">
            <Field
              locale={locale}
              label="reorderPoint"
              type="number"
              min={0}
              initial={number(item['reorderPoint'])}
            />
            <Field
              locale={locale}
              label="safetyStock"
              type="number"
              min={0}
              initial={number(item['safetyStock'])}
            />
          </div>
        </AdminForm>
      </Panel>
    </>
  );
}
