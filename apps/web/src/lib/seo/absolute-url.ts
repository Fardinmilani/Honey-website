import { getSiteOrigin } from '../env';

/**
 * Builds an absolute URL from a site-relative pathname using the configured
 * public site origin — never from request Host headers.
 */
export function absoluteUrl(pathname: string): string {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return new URL(normalized, getSiteOrigin()).href;
}
