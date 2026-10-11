import { ValidationAppError } from '../../../errors/index.js';
import { editorialText, assertEditorialPublication } from '../../../policy/editorial-text.js';
import type { AdminPage, AdminPageInput } from '../../../platform/domain/admin-page.js';
import type { AuthenticatedPrincipal, RequestMetadata } from '../../identity/index.js';

export const CONTENT_KINDS = ['page', 'article', 'faq'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export type ContentBlock =
  | Readonly<{ type: 'heading'; text: string; level: 2 | 3 }>
  | Readonly<{ type: 'paragraph' | 'quote'; text: string }>
  | Readonly<{ type: 'image'; mediaAssetId: string; alt: string }>;
export type ContentTranslation = Readonly<{
  locale: string;
  title: string;
  slug: string;
  blocks: readonly ContentBlock[];
  metaTitle: string | null;
  metaDescription: string | null;
}>;
export type ContentRecord = Readonly<{
  id: string;
  kind: ContentKind;
  key: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  updatedAt: string;
  translations: readonly ContentTranslation[];
}>;
export type ContentActor = Readonly<{
  principal: AuthenticatedPrincipal;
  metadata: RequestMetadata;
}>;
export type ContentQuery = AdminPageInput & Readonly<{ q?: string }>;
export interface ContentRepository {
  list(
    kind: ContentKind,
    query: ContentQuery,
    published: boolean,
  ): Promise<AdminPage<ContentRecord>>;
  get(kind: ContentKind, id: string): Promise<ContentRecord | null>;
  bySlug(kind: 'page' | 'article', locale: string, slug: string): Promise<ContentRecord | null>;
  create(kind: ContentKind, key: string, actor: ContentActor): Promise<ContentRecord>;
  save(
    kind: ContentKind,
    id: string,
    translation: ContentTranslation,
    actor: ContentActor,
  ): Promise<ContentRecord>;
  transition(
    kind: ContentKind,
    id: string,
    state: 'PUBLISHED' | 'ARCHIVED',
    locales: readonly string[],
    actor: ContentActor,
  ): Promise<ContentRecord>;
  close(): Promise<void>;
}
function isObject(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}
function object(input: unknown): Record<string, unknown> {
  if (!isObject(input)) throw new ValidationAppError([{ path: 'blocks', code: 'BLOCK_INVALID' }]);
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null)
    throw new ValidationAppError([{ path: 'blocks', code: 'BLOCK_INVALID' }]);
  return input;
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key)))
    throw new ValidationAppError([{ path: 'blocks', code: 'BLOCK_INVALID' }]);
}
export function contentBlocks(input: unknown): readonly ContentBlock[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 60)
    throw new ValidationAppError([{ path: 'blocks', code: 'BLOCK_INVALID' }]);
  return input.map((entry: unknown, index: number): ContentBlock => {
    const block = object(entry);
    const type = block['type'];
    if (type === 'paragraph' || type === 'quote') {
      exact(block, ['type', 'text']);
      const text = editorialText(block['text'], 5000, `blocks.${index}.text`);
      assertEditorialPublication(text);
      if (/<\/?[a-z]|javascript:|on\w+\s*=/iu.test(text))
        throw new ValidationAppError([{ path: 'blocks', code: 'BLOCK_INVALID' }]);
      return { type, text };
    }
    if (type === 'heading') {
      exact(block, ['type', 'text', 'level']);
      const level = block['level'];
      if (level !== 2 && level !== 3)
        throw new ValidationAppError([{ path: 'blocks', code: 'BLOCK_INVALID' }]);
      const text = editorialText(block['text'], 200, `blocks.${index}.text`);
      assertEditorialPublication(text);
      if (/<|>/u.test(text))
        throw new ValidationAppError([{ path: 'blocks', code: 'BLOCK_INVALID' }]);
      return { type, text, level };
    }
    if (type === 'image') {
      exact(block, ['type', 'mediaAssetId', 'alt']);
      const id = block['mediaAssetId'];
      if (
        typeof id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)
      )
        throw new ValidationAppError([{ path: 'blocks', code: 'BLOCK_INVALID' }]);
      const alt = editorialText(block['alt'], 300, `blocks.${index}.alt`);
      assertEditorialPublication(alt);
      return { type, mediaAssetId: id, alt };
    }
    throw new ValidationAppError([{ path: 'blocks', code: 'BLOCK_INVALID' }]);
  });
}
export function assertContentComplete(
  translations: readonly ContentTranslation[],
  locales: readonly string[],
) {
  for (const locale of locales) {
    const row = translations.find((t) => t.locale === locale);
    if (
      row === undefined ||
      row.title.length === 0 ||
      row.blocks.length === 0 ||
      row.slug.length === 0
    )
      throw new ValidationAppError([
        { path: 'translations', code: 'CONTENT_PUBLICATION_INCOMPLETE' },
      ]);
    contentBlocks(row.blocks);
    assertEditorialPublication([row.title, row.metaTitle, row.metaDescription].join(' '));
  }
}
