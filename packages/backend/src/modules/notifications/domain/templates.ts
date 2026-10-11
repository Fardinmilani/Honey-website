import { ValidationAppError } from '../../../errors/index.js';
import { editorialText, assertEditorialPublication } from '../../../policy/editorial-text.js';
export const TEMPLATE_CODES = [
  'shipment-shipped',
  'shipment-delivered',
  'newsletter-confirm',
  'newsletter-welcome',
] as const;
export type TemplateCode = (typeof TEMPLATE_CODES)[number];
export type Template = Readonly<{
  code: TemplateCode;
  locale: string;
  channel: 'EMAIL' | 'SMS';
  subject: string | null;
  body: string;
}>;
export const TEMPLATE_VARIABLES: Readonly<Record<TemplateCode, readonly string[]>> = {
  'shipment-shipped': ['orderNumber', 'trackingNumber', 'trackingUrl'],
  'shipment-delivered': ['orderNumber', 'trackingNumber', 'trackingUrl'],
  'newsletter-confirm': ['actionUrl'],
  'newsletter-welcome': ['actionUrl'],
};
export function templateCode(input: unknown): TemplateCode {
  if (
    input === 'shipment-shipped' ||
    input === 'shipment-delivered' ||
    input === 'newsletter-confirm' ||
    input === 'newsletter-welcome'
  )
    return input;
  throw new ValidationAppError([{ path: 'code', code: 'TEMPLATE_CODE_INVALID' }]);
}
function placeholders(value: string, allowed: readonly string[]) {
  const stripped = value.replace(
    /\{\{([A-Za-z][A-Za-z0-9]{0,39})\}\}/gu,
    (_match: string, name: string) => {
      if (!allowed.includes(name))
        throw new ValidationAppError([{ path: 'body', code: 'TEMPLATE_VARIABLE_INVALID' }]);
      return '';
    },
  );
  if (/[{}]/u.test(stripped))
    throw new ValidationAppError([{ path: 'body', code: 'TEMPLATE_VARIABLE_INVALID' }]);
}
export function validateTemplate(input: Template, locales: readonly string[]): Template {
  if (typeof input.subject === 'string' && /[\r\n]/u.test(input.subject))
    throw new ValidationAppError([{ path: 'subject', code: 'TEMPLATE_SUBJECT_INVALID' }]);
  const code = templateCode(input.code);
  if (!locales.includes(input.locale) || (input.channel !== 'EMAIL' && input.channel !== 'SMS'))
    throw new ValidationAppError([{ path: 'locale', code: 'TEMPLATE_INVALID' }]);
  const body = editorialText(input.body, input.channel === 'SMS' ? 1000 : 12000, 'body');
  const subject = input.subject === null ? null : editorialText(input.subject, 200, 'subject');
  assertEditorialPublication(`${subject ?? ''} ${body}`);
  if (
    (input.channel === 'EMAIL' && subject === null) ||
    (input.channel === 'SMS' && subject !== null) ||
    (subject !== null && /[\r\n]/u.test(subject))
  )
    throw new ValidationAppError([{ path: 'subject', code: 'TEMPLATE_SUBJECT_INVALID' }]);
  placeholders(body, TEMPLATE_VARIABLES[code]);
  if (subject !== null) placeholders(subject, TEMPLATE_VARIABLES[code]);
  if (!code.startsWith('shipment-') && !body.includes('{{actionUrl}}'))
    throw new ValidationAppError([{ path: 'body', code: 'TEMPLATE_ACTION_REQUIRED' }]);
  return { code, locale: input.locale, channel: input.channel, subject, body };
}
export function escapeMessage(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
export function renderTemplate(
  template: Template,
  variables: Readonly<Record<string, string>>,
  siteOrigin: string,
) {
  validateTemplate(template, ['fa', 'en']);
  const allowed = TEMPLATE_VARIABLES[template.code];
  if (
    Object.keys(variables).some((key) => !allowed.includes(key)) ||
    allowed.some((key) => !Object.hasOwn(variables, key))
  )
    throw new ValidationAppError([{ path: 'variables', code: 'TEMPLATE_VARIABLE_INVALID' }]);
  for (const [key, value] of Object.entries(variables)) {
    if (
      typeof value !== 'string' ||
      value.length > 2000 ||
      /[\r\n\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value)
    )
      throw new ValidationAppError([{ path: 'variables', code: 'TEMPLATE_VALUE_INVALID' }]);
    if ((key === 'actionUrl' || key === 'trackingUrl') && value !== '') {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new ValidationAppError([{ path: 'variables', code: 'TEMPLATE_URL_INVALID' }]);
      }
      if (
        url.username !== '' ||
        url.password !== '' ||
        (key === 'actionUrl'
          ? url.origin !== siteOrigin ||
            !['https:', 'http:'].includes(url.protocol) ||
            !/^\/(?:fa|en)\/newsletter\/(?:confirm|unsubscribe)$/u.test(url.pathname)
          : url.protocol !== 'https:')
      )
        throw new ValidationAppError([{ path: 'variables', code: 'TEMPLATE_URL_INVALID' }]);
    }
  }
  function substitute(value: string, html: boolean) {
    const source = html ? escapeMessage(value) : value;
    return source.replace(
      /\{\{([A-Za-z][A-Za-z0-9]{0,39})\}\}/gu,
      (_match: string, key: string) => {
        const entry = variables[key];
        if (entry === undefined)
          throw new ValidationAppError([{ path: 'variables', code: 'TEMPLATE_VARIABLE_INVALID' }]);
        if (!html) return entry;
        if (key === 'actionUrl' || key === 'trackingUrl')
          return entry === ''
            ? ''
            : `<a href="${escapeMessage(entry)}"><bdi dir="ltr">${escapeMessage(entry)}</bdi></a>`;
        return `<bdi dir="ltr">${escapeMessage(entry)}</bdi>`;
      },
    );
  }
  const subject = substitute(template.subject ?? '', false);
  if (/[\r\n]/u.test(subject))
    throw new ValidationAppError([{ path: 'subject', code: 'TEMPLATE_SUBJECT_INVALID' }]);
  const dir = template.locale === 'fa' ? 'rtl' : 'ltr';
  return {
    locale: template.locale,
    subject,
    text: substitute(template.body, false),
    html: `<!doctype html><html lang="${template.locale}" dir="${dir}"><body><table role="presentation" lang="${template.locale}" dir="${dir}" style="width:100%;font-family:Arial,sans-serif;line-height:1.7"><tr><td>${substitute(template.body, true).replaceAll('\n', '<br>')}</td></tr></table></body></html>`,
  };
}
