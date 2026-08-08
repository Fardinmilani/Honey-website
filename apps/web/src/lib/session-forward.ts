import 'server-only';

import type { NextResponse } from 'next/server';

/**
 * Helpers for forwarding Set-Cookie from the API onto the Next response
 * without exposing cookie values to Client Components.
 *
 * Phase 9 ships the transport foundation only — no sign-in UI.
 */
export function forwardSetCookieHeaders(
  upstream: Response,
  downstream: NextResponse,
): NextResponse {
  const cookies = upstream.headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) {
    downstream.headers.append('set-cookie', cookie);
  }
  // Fallback for runtimes without getSetCookie()
  if (cookies.length === 0) {
    const single = upstream.headers.get('set-cookie');
    if (single) {
      downstream.headers.append('set-cookie', single);
    }
  }
  return downstream;
}
