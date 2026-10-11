import Link from 'next/link';
import { formatMinorMoney, getNamespace, type AdminMessages, type Locale } from '@honey/i18n';
import { record, records, optionalText, text, type AdminRecord } from '@/lib/admin/validation';
import type { Label } from './admin-form';
import { stateLabel } from '@/lib/admin/labels';

export function display(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  throw new Error('ADMIN_RESPONSE_INVALID');
}
export function translationName(row: AdminRecord, locale: Locale): string {
  if (!Array.isArray(row['translations'])) return display(row['name'] ?? row['code'] ?? row['id']);
  const translations = records(row['translations']);
  const translation = translations.find((entry) => entry['locale'] === locale);
  return translation === undefined
    ? display(row['sku'] ?? row['code'] ?? row['id'])
    : text(translation['name']);
}
export function adminPageData(raw: unknown): {
  items: readonly AdminRecord[];
  nextCursor: string | null;
} {
  const row = record(raw);
  const pagination = row['page'] === undefined ? row : record(row['page']);
  return {
    items: records(row['items'] ?? row['data']),
    nextCursor: optionalText(pagination['nextCursor']),
  };
}
type Column = Readonly<{
  key: string;
  label: Label;
  format?: 'date' | 'state' | 'localized' | 'boolean' | 'list';
}>;
export function DataTable({
  locale,
  items,
  columns,
  detailHref,
  caption,
}: {
  locale: Locale;
  items: readonly AdminRecord[];
  columns: readonly Column[];
  detailHref?: (row: AdminRecord) => string;
  caption: Label;
}) {
  const m = getNamespace(locale, 'admin');
  if (items.length === 0) return <p className="admin-empty">{m.empty}</p>;
  return (
    <div className="admin-table-wrap" tabIndex={0} role="region" aria-label={m[caption]}>
      <table className="admin-table">
        <caption className="sr-only">{m[caption]}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {m[column.label]}
              </th>
            ))}
            {detailHref !== undefined && <th scope="col">{m.actions}</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((row, index) => (
            <tr key={typeof row['id'] === 'string' ? row['id'] : index}>
              {columns.map((column) => (
                <td key={column.key}>
                  <Cell row={row} column={column} locale={locale} messages={m} />
                </td>
              ))}
              {detailHref !== undefined && (
                <td>
                  <Link href={detailHref(row)} prefetch={false}>
                    {m.view}
                  </Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Cell({
  row,
  column,
  locale,
  messages,
}: {
  row: AdminRecord;
  column: Column;
  locale: Locale;
  messages: AdminMessages;
}) {
  const value = row[column.key];
  if (
    /Minor$/u.test(column.key) &&
    typeof value === 'string' &&
    typeof row['currency'] === 'string'
  )
    return <bdi>{formatMinorMoney(locale, { amountMinor: value, currency: row['currency'] })}</bdi>;
  if (column.format === 'localized') return translationName(row, locale);
  if (column.format === 'boolean') {
    if (typeof value !== 'boolean') throw new Error('ADMIN_RESPONSE_INVALID');
    return <span>{value ? messages.yes : messages.no}</span>;
  }
  if (column.format === 'list') {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string'))
      throw new Error('ADMIN_RESPONSE_INVALID');
    return <bdi>{value.join(', ')}</bdi>;
  }
  if (column.format === 'state')
    return <span className="admin-badge">{stateLabel(messages, text(value))}</span>;
  if (column.format === 'date' && typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('ADMIN_RESPONSE_INVALID');
    return (
      <time dateTime={value}>
        {new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'UTC',
        }).format(date)}{' '}
        UTC
      </time>
    );
  }
  return (
    <bdi dir={/^(?:id|sku|email|number|code)$|Id$/u.test(column.key) ? 'ltr' : 'auto'}>
      {typeof value === 'number' ? new Intl.NumberFormat(locale).format(value) : display(value)}
    </bdi>
  );
}
export function Pagination({
  locale,
  path,
  query,
  nextCursor,
  cursorKey = 'cursor',
}: {
  locale: Locale;
  path: string;
  query: Record<string, string>;
  nextCursor: string | null;
  cursorKey?: string;
}) {
  const m = getNamespace(locale, 'admin');
  return (
    <nav className="admin-pagination" aria-label={m.next}>
      {query[cursorKey] !== undefined && (
        <a
          className="admin-button"
          href={`${path}?${new URLSearchParams(Object.entries(query).filter(([key]) => key !== cursorKey))}`}
        >
          {m.clear}
        </a>
      )}
      {nextCursor !== null && (
        <Link
          className="admin-button"
          prefetch={false}
          href={`${path}?${new URLSearchParams({ ...query, [cursorKey]: nextCursor })}`}
        >
          {m.next}
        </Link>
      )}
    </nav>
  );
}
export function Filters({
  locale,
  path,
  query,
  fields,
  fixed = {},
}: {
  locale: Locale;
  path: string;
  query: Record<string, string>;
  fixed?: Readonly<Record<string, string>>;
  fields: readonly Readonly<{
    key: string;
    label: Label;
    options?: readonly string[];
    type?: 'text' | 'datetime-local';
  }>[];
}) {
  const m = getNamespace(locale, 'admin');
  return (
    <form action={path} className="admin-panel">
      {Object.entries(fixed).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <div className="admin-grid">
        {fields.map((field) => (
          <div className="admin-field" key={field.key}>
            <label htmlFor={`filter-${field.key}`}>{m[field.label]}</label>
            {field.options === undefined ? (
              <input
                id={`filter-${field.key}`}
                name={field.key}
                defaultValue={query[field.key] ?? ''}
                maxLength={256}
                type={field.type ?? 'text'}
              />
            ) : (
              <select
                id={`filter-${field.key}`}
                name={field.key}
                defaultValue={query[field.key] ?? ''}
              >
                <option value="">{m.all}</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {stateLabel(m, option)}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
      <div className="admin-inline">
        <button type="submit">{m.search}</button>
        <a className="admin-button" href={path}>
          {m.clear}
        </a>
      </div>
    </form>
  );
}
export function Facts({
  locale,
  row,
  fields,
}: {
  locale: Locale;
  row: AdminRecord;
  fields: readonly Column[];
}) {
  const m = getNamespace(locale, 'admin');
  return (
    <dl className="admin-facts">
      {fields.map((field) => (
        <div key={field.key}>
          <dt>{m[field.label]}</dt>
          <dd>
            <Cell
              row={row}
              locale={locale}
              messages={m}
              column={
                field.format === undefined &&
                ['status', 'paymentStatus', 'fulfilmentStatus', 'sourcingType'].includes(
                  field.key,
                ) &&
                typeof row[field.key] === 'string'
                  ? { ...field, format: 'state' }
                  : field
              }
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}
