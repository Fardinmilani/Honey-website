import 'server-only';
import { NextResponse } from 'next/server';
import { apiRequest, ApiClientError } from './server';
import { getWebEnv } from '../env';
export function publicAction(
  path: '/v1/newsletter/subscribe' | '/v1/newsletter/confirm' | '/v1/newsletter/unsubscribe',
  keys: readonly string[],
) {
  return async (request: Request) => {
    const headers = { 'cache-control': 'private, no-store' };
    if (request.headers.get('origin') !== getWebEnv().publicSiteUrl.origin)
      return NextResponse.json({ accepted: false }, { status: 403, headers });
    try {
      const raw = await request.text();
      if (raw.length > 4096)
        return NextResponse.json({ accepted: false }, { status: 413, headers });
      const body: unknown = JSON.parse(raw);
      if (
        body === null ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).some((key) => !keys.includes(key))
      )
        return NextResponse.json({ accepted: false }, { status: 422, headers });
      await apiRequest({ path, method: 'POST', body, cache: 'no-store' });
      return NextResponse.json({ accepted: true }, { headers });
    } catch (error) {
      return NextResponse.json(
        { accepted: false },
        { status: error instanceof ApiClientError ? error.presentation.status : 400, headers },
      );
    }
  };
}
