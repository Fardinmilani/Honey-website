import { ForbiddenAppError, NotFoundAppError, ValidationAppError } from '../../../errors/index.js';
import { adminIdentifier } from '../../../platform/domain/admin-page.js';
import { editorialText, assertEditorialPublication } from '../../../policy/editorial-text.js';
import type {
  AuthenticatedPrincipal,
  PermissionCode,
  RequestMetadata,
} from '../../identity/index.js';
import type { PublicCatalogMediaAsset } from '../../media/index.js';
import type { ContentResolutionCache } from '../domain/content-cache.js';
import {
  contentBlocks,
  type ContentKind,
  type ContentRepository,
  type ContentQuery,
  type ContentRecord,
  type ContentTranslation,
} from '../domain/content.js';

export interface ContentMediaPort {
  resolvePublicCatalogAssets(ids: readonly string[]): Promise<readonly PublicCatalogMediaAsset[]>;
}
export type PublicContent = Readonly<{
  id: string;
  kind: ContentKind;
  title: string;
  slug: string;
  blocks: ContentTranslation['blocks'];
  metaTitle: string | null;
  metaDescription: string | null;
  publishedAt: string;
  updatedAt: string;
  locale: string;
  slugs: Readonly<Record<string, string>>;
  media: readonly PublicCatalogMediaAsset[];
}>;
function authorize(principal: AuthenticatedPrincipal, permission: PermissionCode) {
  if (principal.kind !== 'STAFF' || !principal.permissions.includes(permission))
    throw new ForbiddenAppError();
}
export class ContentService {
  constructor(
    private readonly repository: ContentRepository,
    private readonly media: ContentMediaPort,
    private readonly locales: readonly string[],
    private readonly cache?: ContentResolutionCache,
  ) {}
  listAdmin(principal: AuthenticatedPrincipal, kind: ContentKind, query: ContentQuery) {
    authorize(principal, 'content:read');
    return this.repository.list(kind, this.query(query), false);
  }
  async getAdmin(principal: AuthenticatedPrincipal, kind: ContentKind, id: string) {
    authorize(principal, 'content:read');
    const result = await this.repository.get(kind, adminIdentifier(id));
    if (result === null) throw new NotFoundAppError();
    return result;
  }
  create(
    principal: AuthenticatedPrincipal,
    kind: ContentKind,
    key: string,
    metadata: RequestMetadata,
  ) {
    authorize(principal, 'content:write');
    if (!/^[a-z][a-z0-9-]{0,79}$/u.test(key))
      throw new ValidationAppError([{ path: 'key', code: 'CONTENT_KEY_INVALID' }]);
    return this.repository.create(kind, key, { principal, metadata });
  }
  async save(
    principal: AuthenticatedPrincipal,
    kind: ContentKind,
    id: string,
    input: ContentTranslation,
    metadata: RequestMetadata,
  ) {
    authorize(principal, 'content:write');
    this.locale(input.locale);
    const title = editorialText(input.title, 200, 'title');
    const slug = editorialText(input.slug, 160, 'slug');
    if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug))
      throw new ValidationAppError([{ path: 'slug', code: 'CONTENT_SLUG_INVALID' }]);
    const blocks = contentBlocks(input.blocks);
    if (kind === 'faq' && (blocks.length !== 1 || blocks[0]?.type !== 'paragraph'))
      throw new ValidationAppError([{ path: 'blocks', code: 'FAQ_ANSWER_INVALID' }]);
    const metaTitle =
      input.metaTitle === null ? null : editorialText(input.metaTitle, 200, 'metaTitle');
    const metaDescription =
      input.metaDescription === null
        ? null
        : editorialText(input.metaDescription, 320, 'metaDescription');
    assertEditorialPublication([title, metaTitle, metaDescription].join(' '));
    await this.validateMedia(blocks);
    const saved = await this.repository.save(
      kind,
      adminIdentifier(id),
      { locale: input.locale, title, slug, blocks, metaTitle, metaDescription },
      { principal, metadata },
    );
    await this.cache?.invalidate().catch(() => undefined);
    return saved;
  }
  async transition(
    principal: AuthenticatedPrincipal,
    kind: ContentKind,
    id: string,
    state: 'PUBLISHED' | 'ARCHIVED',
    metadata: RequestMetadata,
  ) {
    authorize(principal, 'content:publish');
    const record = await this.getAdminForPublish(kind, id);
    if (state === 'PUBLISHED')
      for (const t of record.translations) await this.validateMedia(t.blocks);
    const saved = await this.repository.transition(kind, id, state, this.locales, {
      principal,
      metadata,
    });
    await this.cache?.invalidate().catch(() => undefined);
    return saved;
  }
  async listPublic(kind: ContentKind, locale: string, query: ContentQuery = {}) {
    this.locale(locale);
    const rows = await this.repository.list(kind, this.query(query), true);
    const items: PublicContent[] = [];
    for (const row of rows.items) {
      const item = await this.project(row, locale);
      if (item !== null) items.push(item);
    }
    return { items, nextCursor: rows.nextCursor, meta: { locale } };
  }
  async publicDetail(
    kind: 'page' | 'article',
    locale: string,
    slug: string,
  ): Promise<PublicContent> {
    this.locale(locale);
    if (slug.length > 160) throw new NotFoundAppError();
    const key = `${kind}:${locale}:${encodeURIComponent(slug)}`;
    const cachedId = await this.cache?.get(key);
    const cached =
      cachedId === null || cachedId === undefined
        ? null
        : await this.repository.get(kind, cachedId);
    const row =
      cached?.status === 'PUBLISHED' &&
      cached.translations.some((t) => t.locale === locale && t.slug === slug)
        ? cached
        : await this.repository.bySlug(kind, locale, slug);
    if (row !== null) await this.cache?.set(key, row.id);
    const result = row === null ? null : await this.project(row, locale);
    if (result === null) throw new NotFoundAppError();
    return result;
  }
  private async getAdminForPublish(kind: ContentKind, id: string) {
    const row = await this.repository.get(kind, adminIdentifier(id));
    if (row === null) throw new NotFoundAppError();
    return row;
  }
  private locale(locale: string) {
    if (!this.locales.includes(locale))
      throw new ValidationAppError([{ path: 'locale', code: 'LOCALE_UNSUPPORTED' }]);
  }
  private query(query: ContentQuery): ContentQuery {
    if (query.q !== undefined) editorialText(query.q, 120, 'q');
    return query;
  }
  private async validateMedia(blocks: ContentTranslation['blocks']) {
    const ids = [...new Set(blocks.flatMap((b) => (b.type === 'image' ? [b.mediaAssetId] : [])))];
    const assets = ids.length === 0 ? [] : await this.media.resolvePublicCatalogAssets(ids);
    if (ids.some((id) => !assets.some((a) => a.id === id && a.kind === 'IMAGE')))
      throw new ValidationAppError([{ path: 'blocks', code: 'CONTENT_MEDIA_UNAVAILABLE' }]);
    return assets;
  }
  private async project(row: ContentRecord, locale: string): Promise<PublicContent | null> {
    const t = row.translations.find((entry) => entry.locale === locale);
    if (row.status !== 'PUBLISHED' || row.publishedAt === null || t === undefined) return null;
    const blocks = contentBlocks(t.blocks);
    const media = await this.validateMedia(blocks);
    // Do not copy private asset metadata from a module seam into a public DTO.
    return {
      id: row.id,
      kind: row.kind,
      title: t.title,
      slug: t.slug,
      blocks,
      metaTitle: t.metaTitle,
      metaDescription: t.metaDescription,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      locale,
      slugs: Object.fromEntries(
        row.translations
          .filter((entry) => this.locales.includes(entry.locale))
          .map((entry) => [entry.locale, entry.slug]),
      ),
      media: media.map((a) => ({
        id: a.id,
        kind: a.kind,
        width: a.width,
        height: a.height,
        url: a.url,
        altTextByLocale: { [locale]: a.altTextByLocale[locale] ?? '' },
      })),
    };
  }
}
