import 'server-only';

import { cookies } from 'next/headers';

import { getWebEnv } from './env';

/**
 * Server-only access to the opaque session cookie value.
 * Never pass this string into Client Components, props serialized to the
 * browser, or NEXT_PUBLIC_* values.
 */
export async function readSessionCookieValue(): Promise<string | undefined> {
  const { sessionCookieName } = getWebEnv();
  const jar = await cookies();
  return jar.get(sessionCookieName)?.value;
}

export async function readCsrfCookieValue(): Promise<string | undefined> {
  const { csrfCookieName } = getWebEnv();
  const jar = await cookies();
  return jar.get(csrfCookieName)?.value;
}
