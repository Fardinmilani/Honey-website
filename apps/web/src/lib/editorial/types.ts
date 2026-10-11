import { isLocale, type Locale } from '@honey/i18n';
import { identifier, optionalText, record, text } from '../admin/validation';
export type ContentKind = 'page' | 'article' | 'faq';
export type Block =
  | Readonly<{ type: 'heading'; level: 2 | 3; text: string }>
  | Readonly<{ type: 'paragraph' | 'quote'; text: string }>
  | Readonly<{ type: 'image'; mediaAssetId: string; alt: string }>;
export type PublicContent = Readonly<{
  id: string;
  kind: ContentKind;
  locale: Locale;
  title: string;
  slug: string;
  blocks: readonly Block[];
  metaTitle: string | null;
  metaDescription: string | null;
  publishedAt: string;
  updatedAt: string;
  slugs: Partial<Record<Locale, string>>;
  media: readonly Readonly<{ id: string; url: string; width: number; height: number }>[];
}>;
export function blocks(input: unknown): readonly Block[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 60)
    throw new Error('CONTENT_RESPONSE_INVALID');
  return input.map((item) => {
    const b = record(item);
    if (b['type'] === 'heading' && (b['level'] === 2 || b['level'] === 3))
      return { type: 'heading', level: b['level'], text: text(b['text']) };
    if (b['type'] === 'paragraph' || b['type'] === 'quote')
      return { type: b['type'], text: text(b['text']) };
    if (b['type'] === 'image')
      return { type: 'image', mediaAssetId: identifier(b['mediaAssetId']), alt: text(b['alt']) };
    throw new Error('CONTENT_RESPONSE_INVALID');
  });
}
function date(input: unknown) {
  const result = text(input);
  if (!Number.isFinite(Date.parse(result))) throw new Error('CONTENT_RESPONSE_INVALID');
  return result;
}
export function content(input: unknown): PublicContent {
  const r = record(input);
  const kind = r['kind'];
  const locale = r['locale'];
  if ((kind !== 'page' && kind !== 'article' && kind !== 'faq') || !isLocale(text(locale)))
    throw new Error('CONTENT_RESPONSE_INVALID');
  if (!isLocale(locale)) throw new Error('CONTENT_RESPONSE_INVALID');
  const slugs: Partial<Record<Locale, string>> = {};
  for (const [l, s] of Object.entries(record(r['slugs']))) if (isLocale(l)) slugs[l] = text(s);
  const media = r['media'];
  if (!Array.isArray(media) || media.length > 60) throw new Error('CONTENT_RESPONSE_INVALID');
  return {
    id: identifier(r['id']),
    kind,
    locale,
    title: text(r['title']),
    slug: text(r['slug']),
    blocks: blocks(r['blocks']),
    metaTitle: optionalText(r['metaTitle']),
    metaDescription: optionalText(r['metaDescription']),
    publishedAt: date(r['publishedAt']),
    updatedAt: date(r['updatedAt']),
    slugs,
    media: media.map((item) => {
      const m = record(item);
      const width = m['width'],
        height = m['height'];
      const url = text(m['url']);
      const parsed = new URL(url);
      if (
        !['https:', 'http:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        typeof width !== 'number' ||
        typeof height !== 'number' ||
        width <= 0 ||
        height <= 0
      )
        throw new Error('CONTENT_MEDIA_INVALID');
      return { id: identifier(m['id']), url, width, height };
    }),
  };
}
export type Review = Readonly<{
  id: string;
  productId: string;
  rating: number;
  title: string;
  body: string;
  locale: Locale;
  createdAt: string;
  verifiedPurchase: true;
}>;
export type ReviewPage = Readonly<{
  items: readonly Review[];
  nextCursor: string | null;
  aggregate: Readonly<{ count: number; average: number }> | null;
}>;
export function reviewPage(input: unknown): ReviewPage {
  const r = record(input);
  const items = r['items'];
  if (!Array.isArray(items) || items.length > 100) throw new Error('REVIEW_RESPONSE_INVALID');
  const aggregate = r['aggregate'];
  let safe: ReviewPage['aggregate'] = null;
  if (aggregate !== null) {
    const a = record(aggregate);
    const count = a['count'],
      average = a['average'];
    if (
      typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count < 1 ||
      typeof average !== 'number' ||
      !Number.isFinite(average) ||
      average < 1 ||
      average > 5
    )
      throw new Error('REVIEW_RESPONSE_INVALID');
    safe = { count, average };
  }
  return {
    items: items.map((item) => {
      const v = record(item);
      const rating = v['rating'],
        locale = v['locale'];
      if (
        typeof rating !== 'number' ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5 ||
        !isLocale(locale) ||
        v['verifiedPurchase'] !== true
      )
        throw new Error('REVIEW_RESPONSE_INVALID');
      return {
        id: identifier(v['id']),
        productId: identifier(v['productId']),
        rating,
        title: text(v['title']),
        body: text(v['body']),
        locale,
        createdAt: date(v['createdAt']),
        verifiedPurchase: true,
      };
    }),
    nextCursor: optionalText(r['nextCursor']),
    aggregate: safe,
  };
}
