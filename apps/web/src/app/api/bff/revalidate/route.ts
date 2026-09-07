import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { isRevalidateScope, resolveRevalidateTags } from '@/lib/cache/tags';
import { getWebEnv } from '@/lib/env';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type RevalidateBody = {
  readonly scope: string;
  readonly id?: string;
  readonly slug?: string;
  readonly locale?: 'fa' | 'en';
};

function parseRevalidateBody(body: unknown): RevalidateBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const scope = record['scope'];
  if (typeof scope !== 'string') {
    return null;
  }

  const id = record['id'];
  if (id !== undefined && (typeof id !== 'string' || !UUID_RE.test(id))) {
    return null;
  }

  const slug = record['slug'];
  if (slug !== undefined) {
    if (typeof slug !== 'string' || slug.length < 1 || slug.length > 200) {
      return null;
    }
  }

  const locale = record['locale'];
  if (locale !== undefined && locale !== 'fa' && locale !== 'en') {
    return null;
  }

  return {
    scope,
    ...(typeof id === 'string' ? { id } : {}),
    ...(typeof slug === 'string' ? { slug } : {}),
    ...(locale === 'fa' || locale === 'en' ? { locale } : {}),
  };
}

function extractBearerToken(authorization: string | null): string | null {
  if (authorization === null) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/iu.exec(authorization.trim());
  if (match === null || match[1] === undefined) {
    return null;
  }
  const token = match[1].trim();
  return token === '' ? null : token;
}

export async function POST(request: Request) {
  const { revalidateSecret } = getWebEnv();
  const token = extractBearerToken(request.headers.get('authorization'));

  if (revalidateSecret === undefined || token === null || token !== revalidateSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseRevalidateBody(body);
  if (parsed === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!isRevalidateScope(parsed.scope)) {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
  }

  const tags = resolveRevalidateTags({
    scope: parsed.scope,
    ...(parsed.id !== undefined ? { id: parsed.id } : {}),
    ...(parsed.slug !== undefined ? { slug: parsed.slug } : {}),
    ...(parsed.locale !== undefined ? { locale: parsed.locale } : {}),
  });

  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 });
  }

  return NextResponse.json({ revalidated: true, tags });
}
