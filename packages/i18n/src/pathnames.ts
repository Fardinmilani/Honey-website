import { defaultLocale, isLocale, type Locale } from './config.js';

/**
 * Internal pathname keys → per-locale URL segments (after the locale prefix).
 *
 * Internal keys match the App Router filesystem under `[locale]/(storefront)/`.
 * Persian segments use Latin transliteration (see docs/i18n-strategy.md).
 *
 * Dynamic segments use `[param]` placeholders shared across locales.
 */
export const pathnames = {
  '/': {
    fa: '/',
    en: '/',
  },
  '/products': {
    fa: '/mahsoulat',
    en: '/products',
  },
  '/products/[slug]': {
    fa: '/mahsoulat/[slug]',
    en: '/products/[slug]',
  },
  '/categories': {
    fa: '/dasteha',
    en: '/categories',
  },
  '/categories/[slug]': {
    fa: '/dasteha/[slug]',
    en: '/categories/[slug]',
  },
  '/collections': {
    fa: '/majmooeha',
    en: '/collections',
  },
  '/collections/[slug]': {
    fa: '/majmooeha/[slug]',
    en: '/collections/[slug]',
  },
  '/search': {
    fa: '/jostoju',
    en: '/search',
  },
} as const satisfies Record<string, Record<Locale, string>>;

export type InternalPathname = keyof typeof pathnames;

export type LocalizedPathSegment = (typeof pathnames)[InternalPathname][Locale];

export type PathParams = Readonly<Record<string, string>>;

/**
 * Builds the locale-prefixed href for an internal pathname.
 * Example: `localizedHref('/products/[slug]', 'fa', { slug: 'asal-konar' })`
 * → `/fa/mahsoulat/asal-konar`
 */
export function localizedHref(
  internalPath: InternalPathname,
  locale: Locale,
  params?: PathParams,
): `/${Locale}${string}` {
  const segment = fillParams(pathnames[internalPath][locale], params);
  if (segment === '/') {
    return `/${locale}`;
  }
  return `/${locale}${segment.startsWith('/') ? segment : `/${segment}`}`;
}

/**
 * Returns the localized path segment for an internal pathname (no locale prefix).
 */
export function localizePathname(
  internalPath: InternalPathname,
  locale: Locale,
  params?: PathParams,
): string {
  return fillParams(pathnames[internalPath][locale], params);
}

/**
 * Filesystem path under `[locale]/` for App Router (English/internal segments).
 * Example: `filesystemPath('/products/[slug]', { slug: 'x' })` → `/products/x`
 */
export function filesystemPath(internalPath: InternalPathname, params?: PathParams): string {
  return fillParams(internalPath, params);
}

/**
 * Resolves a localized segment (no locale prefix) back to the internal key and params.
 */
export function resolveInternalPathname(
  localizedSegment: string,
  locale: Locale,
): { internal: InternalPathname; params: PathParams } | null {
  const normalized = normalizeSegment(localizedSegment);
  for (const key of Object.keys(pathnames) as InternalPathname[]) {
    const matched = matchPattern(pathnames[key][locale], normalized);
    if (matched !== null) {
      return { internal: key, params: matched };
    }
  }
  return null;
}

/**
 * Maps a public locale-prefixed path to the App Router filesystem path
 * (locale prefix + English/internal segments). Returns null when unmatched.
 */
export function toFilesystemLocalePath(publicPath: string): string | null {
  const parsed = parseLocalePath(publicPath);
  if (parsed.locale === null) {
    return null;
  }
  const resolved = resolveInternalPathname(parsed.pathname, parsed.locale);
  if (resolved === null) {
    return null;
  }
  const fs = filesystemPath(resolved.internal, resolved.params);
  if (fs === '/') {
    return `/${parsed.locale}`;
  }
  return `/${parsed.locale}${fs.startsWith('/') ? fs : `/${fs}`}`;
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

export type SwitchLocalePathOptions = {
  /**
   * Override dynamic params when switching locales (e.g. translated entity slug).
   * Keys match `[param]` names in the pathname map.
   */
  readonly params?: PathParams;
};

/**
 * Switches an absolute locale-prefixed path to the counterpart in `targetLocale`.
 * Unknown segments fall back to the target locale home.
 * Pass `params` to substitute translated entity slugs.
 */
export function switchLocalePath(
  currentPath: string,
  targetLocale: Locale,
  options?: SwitchLocalePathOptions,
): string {
  const parsed = parseLocalePath(currentPath);
  const sourceLocale = parsed.locale ?? defaultLocale;
  const resolved =
    resolveInternalPathname(parsed.pathname, sourceLocale) ??
    (parsed.pathname === '/' ? { internal: '/' as const, params: {} } : null);

  if (resolved === null) {
    return localizedHref('/', targetLocale);
  }

  const params = options?.params ?? resolved.params;
  return localizedHref(resolved.internal, targetLocale, params);
}

function fillParams(pattern: string, params?: PathParams): string {
  if (!params) {
    if (pattern.includes('[')) {
      throw new Error(`Missing path params for pattern ${pattern}`);
    }
    return pattern;
  }
  return pattern.replace(/\[([^\]]+)\]/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === '') {
      throw new Error(`Missing path param "${name}" for pattern ${pattern}`);
    }
    return value;
  });
}

function matchPattern(pattern: string, pathname: string): PathParams | null {
  const normalizedPattern = normalizeSegment(pattern);
  const normalizedPath = normalizeSegment(pathname);
  if (normalizedPattern === '/' && normalizedPath === '/') {
    return {};
  }
  const patternParts = normalizedPattern.split('/').filter((part) => part.length > 0);
  const pathParts = normalizedPath.split('/').filter((part) => part.length > 0);
  if (patternParts.length !== pathParts.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const expected = patternParts[index];
    const actual = pathParts[index];
    if (expected === undefined || actual === undefined) {
      return null;
    }
    if (expected.startsWith('[') && expected.endsWith(']')) {
      params[expected.slice(1, -1)] = actual;
      continue;
    }
    if (expected !== actual) {
      return null;
    }
  }
  return params;
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
