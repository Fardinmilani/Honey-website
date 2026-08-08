import { defaultLocale, localeConfig, type Locale } from './config.js';
import { getMessage, hasMessage } from './messages/index.js';
import type { InterpolationValues, MessageKey } from './messages/types.js';

export type Translator = {
  /**
   * Translate a dotted message key: `t('home.headline')`.
   * Optional `{name}` placeholders are interpolated from `values`.
   */
  (key: MessageKey, values?: InterpolationValues): string;
  readonly locale: Locale;
};

/**
 * Creates a locale-bound translator.
 *
 * API choice: dotted keys — `t('home.headline')` — so keys stay portable across
 * RSC props, tests, and validation without a nested proxy.
 *
 * Missing keys: throw in development; return `errors.generic` in production
 * (never the raw key).
 */
export function createTranslator(locale: Locale): Translator {
  const translate = ((key: MessageKey, values?: InterpolationValues): string => {
    if (!hasMessage(locale, key)) {
      return handleMissingKey(locale, key);
    }

    const template = getMessage(locale, key);
    return interpolate(template, values);
  }) as Translator;

  Object.defineProperty(translate, 'locale', {
    value: locale,
    writable: false,
    enumerable: true,
    configurable: false,
  });

  return translate;
}

export function interpolate(template: string, values?: InterpolationValues): string {
  if (values === undefined) {
    return template;
  }

  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) {
      return match;
    }
    const value = values[name];
    if (value === undefined) {
      return match;
    }
    return String(value);
  });
}

function handleMissingKey(locale: Locale, key: MessageKey): string {
  const detail = `Missing translation "${key}" for locale "${locale}" (${localeConfig[locale].englishLabel}).`;

  if (isDevelopment()) {
    throw new Error(detail);
  }

  if (hasMessage(locale, 'errors.generic')) {
    return getMessage(locale, 'errors.generic');
  }

  if (hasMessage(defaultLocale, 'errors.generic')) {
    return getMessage(defaultLocale, 'errors.generic');
  }

  return '';
}

function isDevelopment(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.['NODE_ENV'] !== 'production';
}
