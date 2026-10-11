import 'server-only';
import type { Locale } from '@honey/i18n';
import { apiFetch } from '../api-client/server';
import { record, optionalText, identifier } from '../admin/validation';
import { content, reviewPage, type ContentKind, type PublicContent } from './types';
export async function listContent(kind: ContentKind, locale: Locale, cursor?: string) {
  const raw = record(
    await apiFetch<unknown>({
      requestId: 'public-editorial-read',
      path: `/v1/content/${kind}`,
      locale,
      searchParams: { limit: 100, ...(cursor === undefined ? {} : { cursor: identifier(cursor) }) },
      next: { revalidate: 60, tags: ['content', `locale:${locale}`] },
    }),
  );
  const rows = raw['items'];
  if (!Array.isArray(rows) || rows.length > 100) throw new Error('CONTENT_RESPONSE_INVALID');
  return { items: rows.map(content), nextCursor: optionalText(raw['nextCursor']) };
}
export async function getContent(kind: 'page' | 'article', locale: Locale, slug: string) {
  return content(
    await apiFetch<unknown>({
      requestId: 'public-editorial-read',
      path: `/v1/content/${kind}/${encodeURIComponent(slug)}`,
      locale,
      next: { revalidate: 60, tags: ['content', `locale:${locale}`] },
    }),
  );
}
export async function allContent(kind: ContentKind, locale: Locale) {
  const items: PublicContent[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const p = await listContent(kind, locale, cursor);
    items.push(...p.items);
    if (p.nextCursor === null) break;
    if (seen.has(p.nextCursor)) throw new Error('CONTENT_CURSOR_INVALID');
    seen.add(p.nextCursor);
    cursor = p.nextCursor;
  }
  return items;
}
export async function getReviews(productId: string, cursor?: string) {
  return reviewPage(
    await apiFetch<unknown>({
      requestId: 'public-editorial-read',
      path: `/v1/products/${identifier(productId)}/reviews`,
      searchParams: { limit: 20, ...(cursor === undefined ? {} : { cursor: identifier(cursor) }) },
      next: { revalidate: 60, tags: ['catalog', 'catalog:products', `product:${productId}`] },
    }),
  );
}
