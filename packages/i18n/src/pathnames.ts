import { defaultLocale, isLocale, type Locale } from './config.js';

/**
 * Internal pathname keys → per-locale URL segments (after the locale prefix).
 *
 * Phase 9 maps home only. Later phases add entries here without changing helpers.
 * Persian segments use Latin transliteration (see docs/i18n-strategy.md).
 */
export const pathnames = {
  '/': {
    fa: '/',
    en: '/',
  },
} as const satisfies Record<string, Record<Locale, string>>;

export type InternalPathname = keyof typeof pathnames;

export type LocalizedPathSegment = (typeof pathnames)[InternalPathname][Locale];

/**
 * Builds the locale-prefixed href for an internal pathname.
 * Example: `localizedHref('/', 'fa')` → `/fa`
 */
export function localizedHref(
  internalPath: InternalPathname,
  locale: Locale,
): `/${Locale}${string}` {
  const segment: string = pathnames[internalPath][locale];
  if (segment === '/') {
    return `/${locale}`;
  }
  return `/${locale}${segment.startsWith('/') ? segment : `/${segment}`}`;
}

/**
 * Returns the localized path segment for an internal pathname (no locale prefix).
 */
export function localizePathname(internalPath: InternalPathname, locale: Locale): string {
  return pathnames[internalPath][locale];
}

/**
 * Resolves a localized segment (no locale prefix) back to the internal key.
 */
export function resolveInternalPathname(
  localizedSegment: string,
  locale: Locale,
): InternalPathname | null {
  const normalized = normalizeSegment(localizedSegment);
  for (const key of Object.keys(pathnames) as InternalPathname[]) {
    if (normalizeSegment(pathnames[key][locale]) === normalized) {
      return key;
    }
  }
  return null;
}

export type ParsedLocalePath = {
  readonly locale: Locale | null;
  /** Path after the locale prefix, always starting with `/` (or `/` when empty). */
  readonly pathname: string;
  /** Full path with leading slash, query/hash stripped. */
  readonly path: string;
};

/**
 * Splits a URL path into `{ locale, pathname }` where `pathname` is the
 * localized segment map key space (after the locale prefix).
 */
export function parseLocalePath(input: string): ParsedLocalePath {
  const path = stripQueryAndHash(input);
  const parts = path.split('/').filter((part) => part.length > 0);
  const maybeLocale = parts[0];

  if (maybeLocale !== undefined && isLocale(maybeLocale)) {
    const rest = parts.slice(1);
    const pathname = rest.length === 0 ? '/' : `/${rest.join('/')}`;
    return {
      locale: maybeLocale,
      pathname,
      path,
    };
  }

  return {
    locale: null,
    pathname: path === '' ? '/' : path.startsWith('/') ? path : `/${path}`,
    path,
  };
}

/**
 * Switches an absolute locale-prefixed path to the counterpart in `targetLocale`.
 * Unknown segments fall back to the target locale home.
 */
export function switchLocalePath(currentPath: string, targetLocale: Locale): string {
  const parsed = parseLocalePath(currentPath);
  const sourceLocale = parsed.locale ?? defaultLocale;
  const internal =
    resolveInternalPathname(parsed.pathname, sourceLocale) ??
    (parsed.pathname === '/' ? '/' : null);

  if (internal === null) {
    return localizedHref('/', targetLocale);
  }

  return localizedHref(internal, targetLocale);
}

function normalizeSegment(segment: string): string {
  if (segment === '' || segment === '/') {
    return '/';
  }
  const withSlash = segment.startsWith('/') ? segment : `/${segment}`;
  return withSlash.length > 1 && withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
}

function stripQueryAndHash(input: string): string {
  const withoutHash = input.split('#')[0] ?? input;
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash;
  if (withoutQuery === '') {
    return '/';
  }
  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
}
