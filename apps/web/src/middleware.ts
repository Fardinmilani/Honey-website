import { NextResponse, type NextRequest } from 'next/server';

import {
  isLocale,
  LOCALE_COOKIE_NAME,
  negotiateLocale,
  parseLocalePath,
  toFilesystemLocalePath,
} from '@honey/i18n';

const PUBLIC_FILE = /\.[^/]+$/u;

function cookieSecure(request: NextRequest): boolean {
  if (process.env['NODE_ENV'] !== 'production') {
    return false;
  }
  return (
    request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https'
  );
}

/**
 * Rewrites localized public segments (e.g. /fa/mahsoulat) to App Router
 * filesystem paths (/fa/products) while keeping the browser URL unchanged.
 */
function maybeRewriteLocalizedPath(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const parsed = parseLocalePath(pathname);
  if (parsed.locale === null) {
    return null;
  }

  const filesystemPath = toFilesystemLocalePath(pathname);
  if (filesystemPath === null || filesystemPath === pathname) {
    return null;
  }

  const url = request.nextUrl.clone();
  url.pathname = filesystemPath;
  return NextResponse.rewrite(url);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname.startsWith('/sitemaps/') ||
    pathname === '/unsupported-locale' ||
    pathname.startsWith('/unsupported-locale/') ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];

  if (pathname === '/' || first === undefined) {
    const locale = negotiateLocale({
      cookie: request.cookies.get(LOCALE_COOKIE_NAME)?.value,
      acceptLanguage: request.headers.get('accept-language'),
    });
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}`;
    const response = NextResponse.redirect(url, 307);
    response.cookies.set(LOCALE_COOKIE_NAME, locale, {
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      secure: cookieSecure(request),
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  }

  if (!isLocale(first)) {
    const url = request.nextUrl.clone();
    url.pathname = `/unsupported-locale`;
    return NextResponse.rewrite(url);
  }

  const rewritten = maybeRewriteLocalizedPath(request);
  const response = rewritten ?? NextResponse.next();
  response.cookies.set(LOCALE_COOKIE_NAME, first, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    secure: cookieSecure(request),
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
