import { apiFetch } from '../../../../lib/api-client';

/**
 * Explicit allow-listed BFF probe. Not a generic API proxy.
 * Forwards no cookies; used to verify server-to-server reachability wiring.
 */
export async function GET() {
  try {
    const payload = await apiFetch<unknown>({
      path: '/readyz',
      method: 'GET',
      cache: 'no-store',
    });
    return Response.json({ ok: true, upstream: payload }, { status: 200 });
  } catch {
    return Response.json(
      {
        type: 'about:blank',
        title: 'Upstream unavailable',
        status: 502,
      },
      {
        status: 502,
        headers: { 'content-type': 'application/problem+json' },
      },
    );
  }
}
