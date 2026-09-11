import { localeConfig, type Locale } from './config.js';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const LATIN_DIGITS = '0123456789';

const digitMap: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (let i = 0; i < 10; i += 1) {
    const latin = LATIN_DIGITS[i];
    const persian = PERSIAN_DIGITS[i];
    const arabicIndic = ARABIC_INDIC_DIGITS[i];
    if (latin === undefined || persian === undefined || arabicIndic === undefined) {
      continue;
    }
    map.set(persian, latin);
    map.set(arabicIndic, latin);
  }
  return map;
})();

function numberLocale(locale: Locale): string {
  const config = localeConfig[locale];
  return `${config.bcp47}-u-nu-${config.numberingSystem}`;
}

/**
 * Formats a number with the locale's configured numbering system.
 */
export function formatNumber(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(numberLocale(locale), options).format(value);
}

/**
 * Formats money from minor units using the locale's currency and numbering system.
 * IRR uses 0 fraction digits in ISO 4217, so `amountMinor` is the rial amount.
 */
export function formatCurrency(
  locale: Locale,
  amountMinor: number,
  options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>,
): string {
  const config = localeConfig[locale];
  const currency = config.currency;
  const fractionDigits = currencyFractionDigits(currency);
  const amount = amountMinor / 10 ** fractionDigits;

  return new Intl.NumberFormat(numberLocale(locale), {
    style: 'currency',
    currency,
    ...options,
  }).format(amount);
}

export type MinorMoney = Readonly<{
  amountMinor: string;
  currency: string;
}>;

/**
 * Formats a JSON-safe minor-unit amount without converting it to a JavaScript
 * number. This preserves exact display for values larger than Number.MAX_SAFE_INTEGER.
 */
export function formatMinorMoney(locale: Locale, money: MinorMoney): string {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(money.amountMinor) || !/^[A-Z]{3}$/u.test(money.currency)) {
    return `${money.amountMinor} ${money.currency}`;
  }
  try {
    const raw = BigInt(money.amountMinor);
    const fractionDigits = currencyFractionDigits(money.currency);
    const divisor = 10n ** BigInt(fractionDigits);
    const whole = raw / divisor;
    const fraction = raw % divisor;
    const language = numberLocale(locale);
    const wholeText = new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(whole);
    const numberText =
      fractionDigits === 0
        ? wholeText
        : `${wholeText}${decimalSeparator(language)}${localizedFraction(
            fraction,
            fractionDigits,
            language,
          )}`;
    const parts = new Intl.NumberFormat(language, {
      style: 'currency',
      currency: money.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    let replaced = false;
    return parts
      .map((part) => {
        if (part.type === 'integer' && !replaced) {
          replaced = true;
          return numberText;
        }
        return part.value;
      })
      .join('');
  } catch {
    return `${money.amountMinor} ${money.currency}`;
  }
}

function localizedFraction(value: bigint, digits: number, language: string): string {
  const source = value.toString().padStart(digits, '0');
  const formatter = new Intl.NumberFormat(language, {
    useGrouping: false,
    maximumFractionDigits: 0,
  });
  return source
    .split('')
    .map((digit) => formatter.format(BigInt(digit)))
    .join('');
}

function decimalSeparator(language: string): string {
  return (
    new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      .formatToParts(0.1)
      .find((part) => part.type === 'decimal')?.value ?? '.'
  );
}

/**
 * Formats a date/time. Uses `localeConfig.dateFormat` (Persian calendar for `fa`).
 */
export function formatDate(
  locale: Locale,
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(localeConfig[locale].dateFormat, options).format(date);
}

export function formatRelativeTime(
  locale: Locale,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions,
): string {
  return new Intl.RelativeTimeFormat(localeConfig[locale].bcp47, {
    numeric: 'auto',
    ...options,
  }).format(value, unit);
}

export function formatList(
  locale: Locale,
  items: readonly string[],
  options?: Intl.ListFormatOptions,
): string {
  return new Intl.ListFormat(localeConfig[locale].bcp47, {
    style: 'long',
    type: 'conjunction',
    ...options,
  }).format(items);
}

export function createCollator(locale: Locale, options?: Intl.CollatorOptions): Intl.Collator {
  return new Intl.Collator(localeConfig[locale].bcp47, options);
}

export function compareStrings(locale: Locale, a: string, b: string): number {
  return createCollator(locale).compare(a, b);
}

/**
 * Normalizes Persian and Arabic-Indic digits to Latin digits for validation
 * and storage. Latin digits pass through unchanged.
 */
export function normalizeDigits(input: string): string {
  let output = '';
  for (const char of input) {
    output += digitMap.get(char) ?? char;
  }
  return output;
}

function currencyFractionDigits(currency: string): number {
  try {
    const options = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions();
    return options.maximumFractionDigits ?? 0;
  } catch {
    return 0;
  }
}
