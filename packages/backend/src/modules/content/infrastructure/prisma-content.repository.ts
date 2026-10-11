import { randomUUID } from 'node:crypto';
import { createPrismaClient, type Prisma, type TransactionClient } from '@honey/db';
import { ConflictAppError, NotFoundAppError } from '../../../errors/index.js';
import { adminPage, adminPageInput } from '../../../platform/domain/admin-page.js';
import {
  assertContentComplete,
  contentBlocks,
  type ContentActor,
  type ContentKind,
  type ContentQuery,
  type ContentRecord,
  type ContentRepository,
  type ContentTranslation,
} from '../domain/content.js';

type TranslationRow = Readonly<{
  locale: string;
  title: string;
  slug: string;
  blocks: Prisma.JsonValue;
  metaTitle: string | null;
  metaDescription: string | null;
}>;
type Row = Readonly<{
  id: string;
  status: ContentRecord['status'];
  publishedAt: Date | null;
  updatedAt: Date;
  translations: readonly TranslationRow[];
}>;
function project(row: Row, kind: ContentKind, key: string): ContentRecord {
  return {
    id: row.id,
    kind,
    key,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    translations: row.translations.map((t) => ({ ...t, blocks: contentBlocks(t.blocks) })),
  };
}
function event(id: string, kind: ContentKind, action: string) {
  return {
    id: randomUUID(),
    aggregateType: `content.${kind}`,
    aggregateId: id,
    eventType: `content.${action}`,
    payload: { aggregateId: id, kind, version: 1 },
  };
}
function audit(id: string, kind: ContentKind, action: string, actor: ContentActor) {
  return {
    id: randomUUID(),
    actorUserId: actor.principal.userId,
    action: `content.${action}`,
    subjectType: `content.${kind}`,
    subjectId: id,
    requestId: actor.metadata.requestId,
    ip: actor.metadata.clientIp ?? null,
    beforeJson: { changed: true },
    afterJson: { changed: true },
  };
}
export class PrismaContentRepository implements ContentRepository {
  readonly client;
  constructor(databaseUrl: string) {
    this.client = createPrismaClient({ databaseUrl });
  }
  async list(kind: ContentKind, query: ContentQuery, published: boolean) {
    const page = adminPageInput(query);
    const where = {
      ...(published ? { status: 'PUBLISHED' as const } : {}),
      ...(page.cursor === undefined ? {} : { id: { lt: page.cursor } }),
    };
    const orderBy = { id: 'desc' as const };
    const take = page.limit + 1;
    let rows: ContentRecord[];
    if (kind === 'page')
      rows = (
        await this.client.page.findMany({
          where: {
            ...where,
            deletedAt: null,
            ...(query.q === undefined
              ? {}
              : { translations: { some: { title: { contains: query.q, mode: 'insensitive' } } } }),
          },
          include: { translations: true },
          orderBy,
          take,
        })
      ).map((row) => project(row, kind, row.key));
    else if (kind === 'article')
      rows = (
        await this.client.article.findMany({
          where: {
            ...where,
            deletedAt: null,
            ...(query.q === undefined
              ? {}
              : { translations: { some: { title: { contains: query.q, mode: 'insensitive' } } } }),
          },
          include: { translations: true },
          orderBy,
          take,
        })
      ).map((row) => project(row, kind, row.id));
    else
      rows = (
        await this.client.faqItem.findMany({
          where: {
            ...where,
            ...(query.q === undefined
              ? {}
              : {
                  translations: { some: { question: { contains: query.q, mode: 'insensitive' } } },
                }),
          },
          include: { translations: true },
          orderBy,
          take,
        })
      ).map((row) => this.faq(row));
    return adminPage(rows, page.limit);
  }
  async get(kind: ContentKind, id: string) {
    return this.read(this.client, kind, id);
  }
  async bySlug(kind: 'page' | 'article', locale: string, slug: string) {
    if (kind === 'page') {
      const row = await this.client.page.findFirst({
        where: { status: 'PUBLISHED', deletedAt: null, translations: { some: { locale, slug } } },
        include: { translations: true },
      });
      return row === null ? null : project(row, kind, row.key);
    }
    const row = await this.client.article.findFirst({
      where: { status: 'PUBLISHED', deletedAt: null, translations: { some: { locale, slug } } },
      include: { translations: true },
    });
    return row === null ? null : project(row, kind, row.id);
  }
  async create(kind: ContentKind, key: string, actor: ContentActor) {
    const id = randomUUID();
    return this.mutate(kind, id, actor, 'created', async (tx) => {
      const data = { id, createdBy: actor.principal.userId, updatedBy: actor.principal.userId };
      if (kind === 'page') await tx.page.create({ data: { ...data, key } });
      else if (kind === 'article') await tx.article.create({ data });
      else await tx.faqItem.create({ data: { ...data, groupKey: key } });
    });
  }
  async save(kind: ContentKind, id: string, t: ContentTranslation, actor: ContentActor) {
    return this.mutate(kind, id, actor, 'updated', async (tx) => {
      await this.lock(tx, kind, id);
      const row = await this.read(tx, kind, id);
      if (row === null) throw new NotFoundAppError();
      if (row.status === 'ARCHIVED') throw new ConflictAppError({ code: 'CONTENT_ARCHIVED' });
      const data = {
        title: t.title,
        slug: t.slug,
        blocks: t.blocks.map((block) => ({ ...block })),
        metaTitle: t.metaTitle,
        metaDescription: t.metaDescription,
        updatedBy: actor.principal.userId,
      };
      if (kind === 'page') {
        await tx.pageTranslation.upsert({
          where: { pageId_locale: { pageId: id, locale: t.locale } },
          create: { id: randomUUID(), pageId: id, locale: t.locale, ...data },
          update: data,
        });
        await tx.page.update({
          where: { id },
          data: { updatedAt: new Date(), updatedBy: actor.principal.userId },
        });
      } else if (kind === 'article') {
        await tx.articleTranslation.upsert({
          where: { articleId_locale: { articleId: id, locale: t.locale } },
          create: { id: randomUUID(), articleId: id, locale: t.locale, ...data },
          update: data,
        });
        await tx.article.update({
          where: { id },
          data: { updatedAt: new Date(), updatedBy: actor.principal.userId },
        });
      } else {
        const first = t.blocks[0];
        if (first?.type !== 'paragraph') throw new ConflictAppError();
        const faqData = {
          question: t.title,
          answer: first.text,
          updatedBy: actor.principal.userId,
        };
        await tx.faqItemTranslation.upsert({
          where: { faqItemId_locale: { faqItemId: id, locale: t.locale } },
          create: { id: randomUUID(), faqItemId: id, locale: t.locale, ...faqData },
          update: faqData,
        });
        await tx.faqItem.update({
          where: { id },
          data: { updatedAt: new Date(), updatedBy: actor.principal.userId },
        });
      }
    });
  }
  async transition(
    kind: ContentKind,
    id: string,
    status: 'PUBLISHED' | 'ARCHIVED',
    locales: readonly string[],
    actor: ContentActor,
  ) {
    return this.mutate(
      kind,
      id,
      actor,
      status === 'PUBLISHED' ? 'published' : 'archived',
      async (tx) => {
        await this.lock(tx, kind, id);
        const row = await this.read(tx, kind, id);
        if (row === null) throw new NotFoundAppError();
        if (row.status === 'ARCHIVED') throw new ConflictAppError({ code: 'CONTENT_ARCHIVED' });
        if (status === 'PUBLISHED') assertContentComplete(row.translations, locales);
        const data = {
          status,
          publishedAt:
            status === 'PUBLISHED'
              ? row.publishedAt === null
                ? new Date()
                : new Date(row.publishedAt)
              : null,
          updatedBy: actor.principal.userId,
        };
        if (kind === 'page') await tx.page.update({ where: { id }, data });
        else if (kind === 'article') await tx.article.update({ where: { id }, data });
        else await tx.faqItem.update({ where: { id }, data });
      },
    );
  }
  private async mutate(
    kind: ContentKind,
    id: string,
    actor: ContentActor,
    action: string,
    change: (tx: TransactionClient) => Promise<void>,
  ): Promise<ContentRecord> {
    try {
      return await this.client.$transaction(async (tx) => {
        await change(tx);
        await tx.auditLog.create({ data: audit(id, kind, action, actor) });
        await tx.outboxEvent.create({ data: event(id, kind, action) });
        const row = await this.read(tx, kind, id);
        if (row === null) throw new NotFoundAppError();
        return row;
      });
    } catch (error) {
      if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2002')
        throw new ConflictAppError({ code: 'CONTENT_SLUG_CONFLICT' });
      throw error;
    }
  }
  private async lock(tx: TransactionClient, kind: ContentKind, id: string) {
    if (kind === 'page') await tx.$queryRaw`SELECT id FROM page WHERE id = ${id}::uuid FOR UPDATE`;
    else if (kind === 'article')
      await tx.$queryRaw`SELECT id FROM article WHERE id = ${id}::uuid FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM faq_item WHERE id = ${id}::uuid FOR UPDATE`;
  }
  private async read(
    tx: TransactionClient,
    kind: ContentKind,
    id: string,
  ): Promise<ContentRecord | null> {
    if (kind === 'page') {
      const row = await tx.page.findFirst({
        where: { id, deletedAt: null },
        include: { translations: true },
      });
      return row === null ? null : project(row, kind, row.key);
    }
    if (kind === 'article') {
      const row = await tx.article.findFirst({
        where: { id, deletedAt: null },
        include: { translations: true },
      });
      return row === null ? null : project(row, kind, row.id);
    }
    const row = await tx.faqItem.findUnique({ where: { id }, include: { translations: true } });
    return row === null ? null : this.faq(row);
  }
  private faq(row: Prisma.FaqItemGetPayload<{ include: { translations: true } }>): ContentRecord {
    return {
      id: row.id,
      kind: 'faq',
      key: row.groupKey,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      translations: row.translations.map((t) => ({
        locale: t.locale,
        title: t.question,
        slug: row.id,
        blocks: [{ type: 'paragraph', text: t.answer }],
        metaTitle: null,
        metaDescription: null,
      })),
    };
  }
  close() {
    return this.client.$disconnect();
  }
}
