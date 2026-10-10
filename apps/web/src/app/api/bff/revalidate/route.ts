import { createHash, timingSafeEqual } from 'node:crypto';

import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import {
  catalogTags,
  isRevalidateScope,
  resolveRevalidateTags,
  type RevalidateScope,
} from '@/lib/cache/tags';
import { getWebEnv } from '@/lib/env';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type CatalogRevalidateBody = {
  readonly scope: RevalidateScope;
  readonly id?: string;
  readonly slug?: string;
  readonly locale?: 'fa' | 'en';
};

type RevalidateBody = CatalogRevalidateBody | Readonly<{ scope: 'sitemap'; locale: 'fa' | 'en' }>;

const SITEMAP_TYPES = ['static', 'products', 'categories', 'collections'] as const;

function parseRevalidateBody(body: unknown): RevalidateBody | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }

  const scope = 'scope' in body ? body.scope : undefined;
  if (typeof scope !== 'string') {
    return null;
  }

  if (scope === 'sitemap') {
    const locale = 'locale' in body ? body.locale : undefined;
    if (
      (locale !== 'fa' && locale !== 'en') ||
      Object.keys(body).some((key) => key !== 'scope' && key !== 'locale')
    ) {
      return null;
    }
    return { scope, locale };
  }
  if (!isRevalidateScope(scope)) {
    return null;
  }
  if (Object.keys(body).some((key) => !['scope', 'id', 'slug', 'locale'].includes(key))) {
    return null;
  }

  const id = 'id' in body ? body.id : undefined;
  if (id !== undefined && (typeof id !== 'string' || !UUID_RE.test(id))) {
    return null;
  }

  const slug = 'slug' in body ? body.slug : undefined;
  if (slug !== undefined) {
    if (typeof slug !== 'string' || slug.length < 1 || slug.length > 200) {
      return null;
    }
  }

  const locale = 'locale' in body ? body.locale : undefined;
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

function matchesSecret(token: string | null, secret: string | undefined): boolean {
  if (token === null || secret === undefined) return false;
  const actual = createHash('sha256').update(token, 'utf8').digest();
  const expected = createHash('sha256').update(secret, 'utf8').digest();
  return timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  const { revalidateSecret } = getWebEnv();
  const token = extractBearerToken(request.headers.get('authorization'));

  if (!matchesSecret(token, revalidateSecret)) {
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

  if (parsed.scope === 'sitemap') {
    // The paths and catalog tags are server-owned; requests cannot supply a URL.
    for (const type of SITEMAP_TYPES) {
      revalidatePath(`/sitemaps/${parsed.locale}/${type}`);
    }
    revalidatePath('/sitemap.xml');
    revalidateTag(catalogTags.locale(parsed.locale), { expire: 0 });
    return NextResponse.json({ revalidated: true, locale: parsed.locale });
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
