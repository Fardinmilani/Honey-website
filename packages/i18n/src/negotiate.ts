import { defaultLocale, isLocale, LOCALE_COOKIE_NAME, parseLocale, type Locale } from './config.js';

export type NegotiateLocaleInput = {
  /** Raw `NEXT_LOCALE` cookie value (or equivalent). */
  readonly cookie?: string | null | undefined;
  /** Raw `Accept-Language` header value. */
  readonly acceptLanguage?: string | null | undefined;
};

export type AcceptLanguagePreference = {
  readonly tag: string;
  readonly quality: number;
};

/**
 * Resolves a locale in priority order:
 * 1. explicit `NEXT_LOCALE` cookie
 * 2. `Accept-Language` match against enabled locales
 * 3. `defaultLocale`
 */
export function negotiateLocale(input: NegotiateLocaleInput = {}): Locale {
  const fromCookie = readCookieLocale(input.cookie);
  if (fromCookie !== null) {
    return fromCookie;
  }

  const fromHeader = matchAcceptLanguage(input.acceptLanguage);
  if (fromHeader !== null) {
    return fromHeader;
  }

  return defaultLocale;
}

export function readCookieLocale(cookieValue: string | null | undefined): Locale | null {
  if (cookieValue === null || cookieValue === undefined) {
    return null;
  }
  return parseLocale(cookieValue);
}

/**
 * Parses an `Accept-Language` header and returns the best matching launch locale.
 */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (header === null || header === undefined || header.trim() === '') {
    return null;
  }

  const preferences = parseAcceptLanguage(header);
  for (const preference of preferences) {
    const matched = parseLocale(preference.tag);
    if (matched !== null) {
      return matched;
    }
  }

  return null;
}

/**
 * Parses `Accept-Language` into tags sorted by descending quality, then order.
 */
export function parseAcceptLanguage(header: string): AcceptLanguagePreference[] {
  const parts = header.split(',');
  const preferences: AcceptLanguagePreference[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === undefined) {
      continue;
    }

    const [rawTag, ...params] = part.trim().split(';');
    if (rawTag === undefined || rawTag.length === 0 || rawTag === '*') {
      continue;
    }

    let quality = 1;
    for (const param of params) {
      const [key, value] = param.trim().split('=');
      if (key === 'q' && value !== undefined) {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
          quality = parsed;
        }
      }
    }

    if (quality <= 0) {
      continue;
    }

    preferences.push({
      tag: rawTag.trim(),
      quality,
    });
  }

  return preferences.sort((a, b) => {
    if (b.quality !== a.quality) {
      return b.quality - a.quality;
    }
    return 0;
  });
}

/**
 * Extracts `NEXT_LOCALE` from a raw `Cookie` header.
 */
export function readLocaleCookieHeader(cookieHeader: string | null | undefined): Locale | null {
  if (cookieHeader === null || cookieHeader === undefined || cookieHeader.trim() === '') {
    return null;
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [rawName, ...rest] = pair.split('=');
    if (rawName === undefined) {
      continue;
    }
    if (rawName.trim() !== LOCALE_COOKIE_NAME) {
      continue;
    }
    const rawValue = rest.join('=').trim();
    if (rawValue.length === 0) {
      return null;
    }
    try {
      return parseLocale(decodeURIComponent(rawValue));
    } catch {
      return parseLocale(rawValue);
    }
  }

  return null;
}

export function isSupportedLocale(value: string): boolean {
  return isLocale(value);
}
