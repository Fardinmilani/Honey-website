'use client';
import { getNamespace } from '@honey/i18n';
import { identifier, number, optionalText, text, type AdminRecord } from '@/lib/admin/validation';
import {
  AdminForm,
  Check,
  Field,
  checked,
  integer,
  list,
  nullable,
  nullableInteger,
  nullableTimestamp,
  timestamp,
  value,
  type FormContext,
} from './admin-form';
export function PriceForm({ locale, csrf }: FormContext) {
  const m = getNamespace(locale, 'admin');
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path="/api/bff/admin/pricing/variant-prices"
      submit="create"
      build={(data) => ({
        variantId: value(data, 'variantId'),
        amountMinor: value(data, 'amountMinor'),
        compareAtMinor: nullable(data, 'compareAtMinor'),
        currency: value(data, 'currency'),
        validFrom: timestamp(data, 'validFrom'),
        validTo: nullableTimestamp(data, 'validTo'),
      })}
    >
      <p className="admin-help">{m.moneyHelp}</p>
      <div className="admin-grid">
        <Field locale={locale} label="variantId" />
        <Field locale={locale} label="amountMinor" maxLength={19} />
        <Field locale={locale} label="compareAtMinor" maxLength={19} required={false} />
        <Field locale={locale} label="currency" initial="IRR" maxLength={3} />
        <Field locale={locale} label="validFrom" type="datetime-local" hint="timestampsLocal" />
        <Field locale={locale} label="validTo" type="datetime-local" required={false} />
      </div>
    </AdminForm>
  );
}
export function CouponForm({ locale, csrf }: FormContext) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path="/api/bff/admin/pricing/coupons"
      submit="create"
      build={(data) => ({
        code: value(data, 'code'),
        type: value(data, 'type'),
        value: value(data, 'value'),
        currency: nullable(data, 'currency'),
        minSubtotalMinor: nullable(data, 'minSubtotalMinor'),
        maxDiscountMinor: nullable(data, 'maxDiscountMinor'),
        startsAt: timestamp(data, 'startsAt'),
        endsAt: nullableTimestamp(data, 'endsAt'),
        usageLimitTotal: nullableInteger(data, 'usageLimitTotal'),
        usageLimitPerUser: nullableInteger(data, 'usageLimitPerUser'),
        appliesTo: value(data, 'appliesTo'),
        targetIds: list(data, 'targetIds'),
        status: value(data, 'status'),
      })}
    >
      <div className="admin-grid">
        <Field locale={locale} label="code" />
        <Field locale={locale} label="type" options={['PERCENT', 'FIXED', 'FREE_SHIPPING']} />
        <Field locale={locale} label="value" />
        <Field locale={locale} label="currency" initial="IRR" required={false} maxLength={3} />
        <Field locale={locale} label="minSubtotalMinor" required={false} />
        <Field locale={locale} label="maxDiscountMinor" required={false} />
        <Field locale={locale} label="startsAt" type="datetime-local" hint="timestampsLocal" />
        <Field locale={locale} label="endsAt" type="datetime-local" required={false} />
        <Field locale={locale} label="usageLimitTotal" type="number" min={1} required={false} />
        <Field locale={locale} label="usageLimitPerUser" type="number" min={1} required={false} />
        <Field
          locale={locale}
          label="appliesTo"
          options={['ALL', 'CATEGORY', 'COLLECTION', 'VARIANT']}
        />
        <Field locale={locale} label="targetIds" multiline required={false} hint="listHelp" />
        <Field locale={locale} label="status" options={['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED']} />
      </div>
    </AdminForm>
  );
}
export function CouponStatusForm({ locale, csrf, row }: FormContext & { row: AdminRecord }) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/pricing/coupons/${identifier(row['id'])}/status`}
      method="PATCH"
      build={(data) => ({ expectedStatus: text(row['status']), status: value(data, 'status') })}
    >
      <Field
        locale={locale}
        label="status"
        initial={text(row['status'])}
        options={['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED']}
      />
    </AdminForm>
  );
}
export function TaxForm({ locale, csrf, row }: FormContext & { row?: AdminRecord }) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={
        row === undefined
          ? '/api/bff/admin/pricing/tax-rates'
          : `/api/bff/admin/pricing/tax-rates/${identifier(row['id'])}`
      }
      method={row === undefined ? 'POST' : 'PUT'}
      submit={row === undefined ? 'create' : 'save'}
      build={(data) => ({
        code: value(data, 'code'),
        rateBps: integer(data, 'rateBps'),
        country: value(data, 'country'),
        region: nullable(data, 'region'),
        isInclusive: checked(data, 'isInclusive'),
        isActive: checked(data, 'isActive'),
      })}
    >
      <div className="admin-grid">
        <Field locale={locale} label="code" initial={optionalText(row?.['code'])} />
        <Field
          locale={locale}
          label="rateBps"
          type="number"
          min={0}
          max={10000}
          initial={row === undefined ? '' : number(row['rateBps'])}
        />
        <Field
          locale={locale}
          label="country"
          maxLength={2}
          initial={optionalText(row?.['country'])}
        />
        <Field
          locale={locale}
          label="region"
          required={false}
          initial={optionalText(row?.['region'])}
        />
        <Check locale={locale} label="isInclusive" initial={row?.['isInclusive'] === true} />
        <Check locale={locale} label="isActive" initial={row?.['isActive'] === true} />
      </div>
    </AdminForm>
  );
}
