'use client';
import { getNamespace } from '@honey/i18n';
import { identifier, optionalText, records, text, type AdminRecord } from '@/lib/admin/validation';
import {
  AdminForm,
  Check,
  Field,
  checked,
  integer,
  list,
  nullable,
  nullableTimestamp,
  timestamp,
  value,
  type FormContext,
} from './admin-form';
export function ApiaryForm({ locale, csrf, row }: FormContext & { row?: AdminRecord }) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={
        row === undefined
          ? '/api/bff/admin/sourcing/apiaries'
          : `/api/bff/admin/sourcing/apiaries/${identifier(row['id'])}`
      }
      method={row === undefined ? 'POST' : 'PATCH'}
      build={(data) => ({
        code: row === undefined ? value(data, 'code') : text(row['code']),
        name: value(data, 'name'),
        region: value(data, 'region'),
        altitudeBand: nullable(data, 'altitudeBand'),
        notes: nullable(data, 'notes'),
        isOwnOperation: checked(data, 'isOwnOperation'),
      })}
      submit={row === undefined ? 'create' : 'save'}
    >
      <div className="admin-grid">
        {(['code', 'name', 'region', 'altitudeBand', 'notes'] as const).map((label) => (
          <Field
            key={label}
            locale={locale}
            label={label}
            initial={optionalText(row?.[label])}
            required={['code', 'name', 'region'].includes(label)}
            multiline={label === 'notes'}
            readOnly={row !== undefined && label === 'code'}
          />
        ))}
        <Check locale={locale} label="isOwnOperation" initial={row?.['isOwnOperation'] === true} />
      </div>
    </AdminForm>
  );
}
export function ApiaryTranslationForms({ locale, csrf, row }: FormContext & { row: AdminRecord }) {
  const translations = records(row['translations']);
  return (
    <div className="admin-grid">
      {(['fa', 'en'] as const).map((language) => {
        const source = translations.find((entry) => entry['locale'] === language);
        return (
          <AdminForm
            key={language}
            locale={locale}
            csrf={csrf}
            path={`/api/bff/admin/sourcing/apiaries/${identifier(row['id'])}/translations`}
            build={(data) => ({
              locale: language,
              name: value(data, 'name'),
              description: nullable(data, 'description'),
            })}
          >
            <h3>
              {getNamespace(locale, 'admin')[language === 'fa' ? 'faTranslation' : 'enTranslation']}
            </h3>
            <Field locale={locale} label="name" initial={optionalText(source?.['name'])} />
            <Field
              locale={locale}
              label="description"
              initial={optionalText(source?.['description'])}
              required={false}
              multiline
            />
          </AdminForm>
        );
      })}
    </div>
  );
}
export function HarvestBatchForm({ locale, csrf }: FormContext) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path="/api/bff/admin/sourcing/harvest-batches"
      submit="create"
      build={(data) => ({
        batchCode: value(data, 'batchCode'),
        sourcingType: value(data, 'sourcingType'),
        apiaryId: nullable(data, 'apiaryId'),
        supplierId: nullable(data, 'supplierId'),
        harvestSeason: value(data, 'harvestSeason'),
        harvestYear: integer(data, 'harvestYear'),
        floralSources: list(data, 'floralSources'),
        receivedAt: nullableTimestamp(data, 'receivedAt'),
        quantityGrams: integer(data, 'quantityGrams'),
        notes: nullable(data, 'notes'),
      })}
    >
      <div className="admin-grid">
        <Field locale={locale} label="batchCode" />
        <Field
          locale={locale}
          label="sourcingType"
          options={['OWN_PRODUCTION', 'SELECTED_SUPPLIER']}
        />
        <Field locale={locale} label="apiaryId" required={false} />
        <Field locale={locale} label="supplierId" required={false} />
        <Field locale={locale} label="harvestSeason" />
        <Field locale={locale} label="harvestYear" type="number" min={1300} max={3000} />
        <Field locale={locale} label="floralSources" multiline hint="listHelp" />
        <Field locale={locale} label="quantityGrams" type="number" min={1} />
        <Field
          locale={locale}
          label="receivedAt"
          type="datetime-local"
          required={false}
          hint="timestampsLocal"
        />
        <Field locale={locale} label="notes" multiline required={false} />
      </div>
    </AdminForm>
  );
}
export function AllocationForm({ locale, csrf, batchId }: FormContext & { batchId: string }) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path="/api/bff/admin/sourcing/allocations"
      submit="create"
      build={(data) => ({
        harvestBatchId: batchId,
        variantId: value(data, 'variantId'),
        quantityUnits: integer(data, 'quantityUnits'),
        packedAt: timestamp(data, 'packedAt'),
        notes: nullable(data, 'notes'),
      })}
    >
      <div className="admin-grid">
        <Field locale={locale} label="variantId" />
        <Field locale={locale} label="quantityUnits" type="number" min={1} />
        <Field locale={locale} label="packedAt" type="datetime-local" hint="timestampsLocal" />
        <Field locale={locale} label="notes" required={false} multiline />
      </div>
    </AdminForm>
  );
}
export function ProductionIntakeForm({ locale, csrf }: FormContext) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path="/api/bff/admin/sourcing/production-intake"
      danger
      submit="productionIntake"
      build={(data) => ({
        allocationId: value(data, 'allocationId'),
        stockLocationId: value(data, 'stockLocationId'),
        ...(value(data, 'quantity') === '' ? {} : { quantity: integer(data, 'quantity') }),
        ...(value(data, 'note') === '' ? {} : { note: value(data, 'note') }),
      })}
    >
      <div className="admin-grid">
        <Field locale={locale} label="allocationId" />
        <Field locale={locale} label="stockLocationId" />
        <Field locale={locale} label="quantity" type="number" min={1} required={false} />
        <Field locale={locale} label="note" required={false} multiline />
      </div>
    </AdminForm>
  );
}
