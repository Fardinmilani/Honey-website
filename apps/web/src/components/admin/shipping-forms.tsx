'use client';
import { getNamespace } from '@honey/i18n';
import {
  identifier,
  number,
  optionalText,
  records,
  text,
  type AdminRecord,
} from '@/lib/admin/validation';
import {
  AdminForm,
  Check,
  Field,
  checked,
  integer,
  list,
  localTimestamp,
  nullable,
  nullableInteger,
  nullableTimestamp,
  timestamp,
  value,
  type FormContext,
} from './admin-form';
export function ZoneForm({
  locale,
  csrf,
  row,
  id,
}: FormContext & { row?: AdminRecord; id: string }) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/shipping/zones/${identifier(id)}`}
      method="PUT"
      build={(data) => ({
        name: value(data, 'name'),
        countries: list(data, 'countries'),
        provinces: list(data, 'provinces'),
        priority: integer(data, 'priority'),
      })}
      submit={row === undefined ? 'create' : 'save'}
    >
      <div className="admin-grid">
        <Field locale={locale} label="name" initial={optionalText(row?.['name'])} />
        <Field
          locale={locale}
          label="countries"
          initial={row === undefined ? 'IR' : stringList(row['countries'])}
          multiline
          hint="listHelp"
        />
        <Field
          locale={locale}
          label="provinces"
          initial={row === undefined ? '' : stringList(row['provinces'])}
          multiline
          required={false}
          hint="listHelp"
        />
        <Field
          locale={locale}
          label="priority"
          type="number"
          initial={row === undefined ? 0 : number(row['priority'])}
        />
      </div>
    </AdminForm>
  );
}
function stringList(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length > 100) throw new Error('ADMIN_RESPONSE_INVALID');
  return raw.map(text).join('\n');
}
export function ShippingMethodForm({
  locale,
  csrf,
  row,
  id,
}: FormContext & { row?: AdminRecord; id: string }) {
  const translations = row === undefined ? [] : records(row['translations']);
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/shipping/methods/${identifier(id)}`}
      method="PUT"
      submit={row === undefined ? 'create' : 'save'}
      build={(data) => ({
        code: value(data, 'code'),
        zoneId: value(data, 'zoneId'),
        isActive: checked(data, 'isActive'),
        sortOrder: integer(data, 'sortOrder'),
        translations: ['fa', 'en'].map((language) => ({
          locale: language,
          name: value(data, `${language}.name`),
          description: nullable(data, `${language}.description`),
        })),
      })}
    >
      <div className="admin-grid">
        <Field locale={locale} label="code" initial={optionalText(row?.['code'])} />
        <Field locale={locale} label="zoneId" initial={optionalText(row?.['zoneId'])} />
        <Field
          locale={locale}
          label="sortOrder"
          type="number"
          initial={row === undefined ? 0 : number(row['sortOrder'])}
        />
        <Check locale={locale} label="isActive" initial={row?.['isActive'] === true} />
        {(['fa', 'en'] as const).map((language) => {
          const entry = translations.find((item) => item['locale'] === language);
          return (
            <fieldset key={language}>
              <legend>
                {
                  getNamespace(locale, 'admin')[
                    language === 'fa' ? 'faTranslation' : 'enTranslation'
                  ]
                }
              </legend>
              <Field
                locale={locale}
                label="name"
                name={`${language}.name`}
                initial={optionalText(entry?.['name'])}
              />
              <Field
                locale={locale}
                label="description"
                name={`${language}.description`}
                required={false}
                initial={optionalText(entry?.['description'])}
                multiline
              />
            </fieldset>
          );
        })}
      </div>
    </AdminForm>
  );
}
export function ShippingRateForm({
  locale,
  csrf,
  row,
  id,
}: FormContext & { row?: AdminRecord; id: string }) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/shipping/rates/${identifier(id)}`}
      method="PUT"
      submit={row === undefined ? 'create' : 'save'}
      build={(data) => ({
        methodId: value(data, 'methodId'),
        currency: value(data, 'currency'),
        baseMinor: value(data, 'baseMinor'),
        perKgMinor: value(data, 'perKgMinor'),
        freeOverSubtotalMinor: nullable(data, 'freeOverSubtotalMinor'),
        minWeightGrams: integer(data, 'minWeightGrams'),
        maxWeightGrams: nullableInteger(data, 'maxWeightGrams'),
        validFrom: timestamp(data, 'validFrom'),
        validTo: nullableTimestamp(data, 'validTo'),
      })}
    >
      <div className="admin-grid">
        {(
          ['methodId', 'currency', 'baseMinor', 'perKgMinor', 'freeOverSubtotalMinor'] as const
        ).map((label) => (
          <Field
            key={label}
            locale={locale}
            label={label}
            initial={optionalText(row?.[label]) ?? (label === 'currency' ? 'IRR' : '')}
            required={label !== 'freeOverSubtotalMinor'}
          />
        ))}
        <Field
          locale={locale}
          label="minWeightGrams"
          type="number"
          min={0}
          initial={row === undefined ? 0 : number(row['minWeightGrams'])}
        />
        <Field
          locale={locale}
          label="maxWeightGrams"
          type="number"
          min={0}
          required={false}
          initial={
            row === undefined || row['maxWeightGrams'] === null ? '' : number(row['maxWeightGrams'])
          }
        />
        <Field
          locale={locale}
          label="validFrom"
          type="datetime-local"
          initial={localTimestamp(row?.['validFrom'])}
          hint="timestampsLocal"
        />
        <Field
          locale={locale}
          label="validTo"
          type="datetime-local"
          initial={localTimestamp(row?.['validTo'])}
          required={false}
        />
      </div>
    </AdminForm>
  );
}
