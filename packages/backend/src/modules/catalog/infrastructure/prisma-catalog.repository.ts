import { randomUUID } from 'node:crypto';

import { createPrismaClient, Prisma, type PrismaClient, type TransactionClient } from '@honey/db';

import { ConflictAppError } from '../../../errors/index.js';
import {
  assertPublicationCompleteness,
  type CatalogProductRecord,
  type ProductTranslationInput,
  type PublicCategory,
  type PublicCollection,
  type PublicVariant,
} from '../domain/catalog.js';
import type {
  ActorContext,
  AdminProduct,
  CatalogRepository,
  ProductInput,
  ProductMediaInput,
  ProductRows,
  PublicQuery,
  SearchQuery,
  SlugResolution,
  VariantInput,
} from '../domain/catalog-repository.port.js';

const adminProductInclude = {
  translations: { orderBy: { locale: 'asc' } },
  variants: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    include: { translations: { orderBy: { locale: 'asc' } } },
  },
  categories: { include: { category: { select: { id: true, deletedAt: true } } } },
  collections: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
  media: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ProductInclude;

const publicProductInclude = (locale: string) =>
  ({
    translations: { where: { locale }, take: 1 },
    variants: {
      where: { status: 'PUBLISHED', deletedAt: null },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      include: { translations: { where: { locale }, take: 1 } },
    },
    media: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
  }) satisfies Prisma.ProductInclude;

type StoredAdminProduct = Prisma.ProductGetPayload<{ include: typeof adminProductInclude }>;
type StoredPublicProduct = Prisma.ProductGetPayload<{
  include: ReturnType<typeof publicProductInclude>;
}>;

type OrderedId = Readonly<{
  id: string;
  sort_value: string | number | Date;
}>;

function isPrismaCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === code;
}

function conflict(error: unknown, code = 'CATALOG_CONFLICT'): never {
  if (isPrismaCode(error, 'P2002') || isPrismaCode(error, 'P2003')) {
    throw new ConflictAppError({ code, cause: error });
  }
  throw error;
}

function jsonRecord(value: Prisma.JsonValue | null): Readonly<Record<string, string>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') throw new Error('Stored localized catalog text is invalid.');
    result[key] = entry;
  }
  return result;
}

function jsonInput(value: Readonly<Record<string, string>>): Prisma.InputJsonObject {
  return Object.fromEntries(Object.entries(value));
}

function dimensions(value: readonly number[]): readonly [number, number, number] {
  const first = value[0];
  const second = value[1];
  const third = value[2];
  if (
    value.length !== 3 ||
    first === undefined ||
    second === undefined ||
    third === undefined ||
    first < 1 ||
    second < 1 ||
    third < 1
  ) {
    throw new Error('Stored variant dimensions are invalid.');
  }
  return [first, second, third];
}

function audit(
  actor: ActorContext,
  action: string,
  subjectType: string,
  subjectId: string,
  before?: Prisma.InputJsonObject,
  after?: Prisma.InputJsonObject,
) {
  const createsRecord = /\.(?:created|assigned|attached)$/u.test(action);
  const removesRecord = /\.(?:unassigned|detached)$/u.test(action);
  return {
    id: randomUUID(),
    actorUserId: actor.actorUserId,
    action,
    subjectType,
    subjectId,
    requestId: actor.metadata.requestId,
    ip: actor.metadata.clientIp ?? null,
    beforeJson: before ?? { exists: !createsRecord },
    afterJson: after ?? { exists: !removesRecord },
  };
}

function outbox(aggregateType: string, aggregateId: string, eventType: string) {
  return {
    id: randomUUID(),
    aggregateType,
    aggregateId,
    eventType,
    payload: { aggregateId, version: 1 },
  };
}

function translationData(input: ProductTranslationInput) {
  return {
    locale: input.locale,
    name: input.name,
    slug: input.slug,
    shortDescription: input.shortDescription ?? null,
    description: input.description ?? null,
    tastingNotes: input.tastingNotes ?? null,
    pairingSuggestions: input.pairingSuggestions ?? null,
    storyHtml: input.storyHtml ?? null,
    metaTitle: input.metaTitle ?? null,
    metaDescription: input.metaDescription ?? null,
  };
}

function productData(input: ProductInput) {
  return {
    sku: input.sku ?? null,
    brandLine: input.brandLine ?? null,
    honeyVarietal: input.honeyVarietal ?? null,
    floralSources: input.floralSources === undefined ? [] : [...input.floralSources],
    originRegion: input.originRegion ?? null,
    originAltitudeBand: input.originAltitudeBand ?? null,
    harvestSeason: input.harvestSeason ?? null,
    sourcingType: input.sourcingType,
    apiaryId: input.apiaryId ?? null,
    sortWeight: input.sortWeight ?? 0,
  };
}

function sortValue(value: string | number | Date): string | number {
  return value instanceof Date ? value.toISOString() : value;
}

export class PrismaCatalogRepository implements CatalogRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  async createProduct(id: string, input: ProductInput, actor: ActorContext): Promise<AdminProduct> {
    try {
      const product = await this.#client.$transaction(async (transaction) => {
        const created = await transaction.product.create({
          data: {
            id,
            ...productData(input),
            status: 'DRAFT',
            createdBy: actor.actorUserId,
            updatedBy: actor.actorUserId,
          },
          include: adminProductInclude,
        });
        await transaction.auditLog.create({
          data: audit(actor, 'catalog.product.created', 'product', id),
        });
        await transaction.outboxEvent.create({
          data: outbox('product', id, 'catalog.product.created'),
        });
        return created;
      });
      return this.#adminProduct(product);
    } catch (error) {
      conflict(error);
    }
  }

  async updateProduct(
    id: string,
    input: ProductInput,
    actor: ActorContext,
  ): Promise<AdminProduct | null> {
    const exists = await this.#client.product.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (exists === null) return null;
    try {
      const product = await this.#client.$transaction(async (transaction) => {
        const updated = await transaction.product.update({
          where: { id },
          data: { ...productData(input), updatedBy: actor.actorUserId },
          include: adminProductInclude,
        });
        await transaction.auditLog.create({
          data: audit(actor, 'catalog.product.updated', 'product', id),
        });
        await transaction.outboxEvent.create({
          data: outbox('product', id, 'catalog.product.updated'),
        });
        return updated;
      });
      return this.#adminProduct(product);
    } catch (error) {
      conflict(error);
    }
  }

  async getAdminProduct(id: string): Promise<AdminProduct | null> {
    const product = await this.#client.product.findFirst({
      where: { id, deletedAt: null },
      include: adminProductInclude,
    });
    return product === null ? null : this.#adminProduct(product);
  }

  async upsertProductTranslation(
    id: string,
    translationId: string,
    input: ProductTranslationInput,
    actor: ActorContext,
  ): Promise<Readonly<{ product: AdminProduct; oldSlug: string | null }> | null> {
    const product = await this.#client.product.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (product === null) return null;
    try {
      const result = await this.#client.$transaction(async (transaction) => {
        await this.#assertSlugAvailable(transaction, 'PRODUCT', id, input.locale, input.slug);
        const existing = await transaction.productTranslation.findUnique({
          where: { productId_locale: { productId: id, locale: input.locale } },
        });
        const oldSlug = existing?.slug !== input.slug ? (existing?.slug ?? null) : null;
        if (oldSlug !== null && product.status === 'PUBLISHED') {
          await transaction.slugHistory.upsert({
            where: {
              entityType_locale_oldSlug: { entityType: 'PRODUCT', locale: input.locale, oldSlug },
            },
            create: {
              id: randomUUID(),
              entityType: 'PRODUCT',
              entityId: id,
              locale: input.locale,
              oldSlug,
              createdBy: actor.actorUserId,
              updatedBy: actor.actorUserId,
            },
            update: {},
          });
        }
        await transaction.productTranslation.upsert({
          where: { productId_locale: { productId: id, locale: input.locale } },
          create: {
            id: translationId,
            productId: id,
            ...translationData(input),
            createdBy: actor.actorUserId,
            updatedBy: actor.actorUserId,
          },
          update: { ...translationData(input), updatedBy: actor.actorUserId },
        });
        await transaction.auditLog.create({
          data: audit(actor, 'catalog.product.translation_updated', 'product', id),
        });
        await transaction.outboxEvent.create({
          data: outbox(
            'product',
            id,
            oldSlug === null ? 'catalog.product.updated' : 'catalog.product.slug_changed',
          ),
        });
        const updated = await transaction.product.findUniqueOrThrow({
          where: { id },
          include: adminProductInclude,
        });
        return { product: this.#adminProduct(updated), oldSlug };
      });
      return result;
    } catch (error) {
      conflict(error, 'CATALOG_SLUG_CONFLICT');
    }
  }

  async createVariant(
    productId: string,
    variantId: string,
    input: VariantInput,
    actor: ActorContext,
  ): Promise<AdminProduct | null> {
    const product = await this.#client.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (product === null) return null;
    try {
      const updated = await this.#client.$transaction(async (transaction) => {
        await transaction.productVariant.create({
          data: {
            id: variantId,
            productId,
            ...input,
            dimensionsMm: [...input.dimensionsMm],
            status: 'DRAFT',
            createdBy: actor.actorUserId,
            updatedBy: actor.actorUserId,
          },
        });
        await transaction.auditLog.create({
          data: audit(actor, 'catalog.variant.created', 'product_variant', variantId),
        });
        await transaction.outboxEvent.create({
          data: outbox('product', productId, 'catalog.product.updated'),
        });
        return transaction.product.findUniqueOrThrow({
          where: { id: productId },
          include: adminProductInclude,
        });
      });
      return this.#adminProduct(updated);
    } catch (error) {
      conflict(error, 'VARIANT_CONFLICT');
    }
  }

  async updateVariant(
    productId: string,
    variantId: string,
    input: VariantInput,
    actor: ActorContext,
  ): Promise<AdminProduct | null> {
    const variant = await this.#client.productVariant.findFirst({
      where: { id: variantId, productId, deletedAt: null },
      select: { id: true },
    });
    if (variant === null) return null;
    try {
      const updated = await this.#client.$transaction(async (transaction) => {
        await transaction.productVariant.update({
          where: { id: variantId },
          data: { ...input, dimensionsMm: [...input.dimensionsMm], updatedBy: actor.actorUserId },
        });
        await transaction.auditLog.create({
          data: audit(actor, 'catalog.variant.updated', 'product_variant', variantId),
        });
        await transaction.outboxEvent.create({
          data: outbox('product', productId, 'catalog.product.updated'),
        });
        return transaction.product.findUniqueOrThrow({
          where: { id: productId },
          include: adminProductInclude,
        });
      });
      return this.#adminProduct(updated);
    } catch (error) {
      conflict(error, 'VARIANT_CONFLICT');
    }
  }

  async updateVariantStatus(
    productId: string,
    variantId: string,
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
    actor: ActorContext,
  ): Promise<AdminProduct | null> {
    const variant = await this.#client.productVariant.findFirst({
      where: { id: variantId, productId, deletedAt: null },
      select: { id: true, isDefault: true, status: true },
    });
    if (variant === null) return null;
    if (variant.status === status || variant.status === 'ARCHIVED') {
      throw new ConflictAppError({ code: 'VARIANT_TRANSITION_INVALID' });
    }
    if (status === 'ARCHIVED' && variant.isDefault)
      throw new ConflictAppError({ code: 'DEFAULT_VARIANT_ARCHIVE_FORBIDDEN' });
    const updated = await this.#client.$transaction(async (transaction) => {
      await transaction.productVariant.update({
        where: { id: variantId },
        data: { status, updatedBy: actor.actorUserId },
      });
      await transaction.auditLog.create({
        data: audit(
          actor,
          `catalog.variant.${status.toLowerCase()}`,
          'product_variant',
          variantId,
          { status: variant.status },
          { status },
        ),
      });
      await transaction.outboxEvent.create({
        data: outbox('product', productId, 'catalog.product.updated'),
      });
      return transaction.product.findUniqueOrThrow({
        where: { id: productId },
        include: adminProductInclude,
      });
    });
    return this.#adminProduct(updated);
  }

  async upsertVariantTranslation(
    productId: string,
    variantId: string,
    translationId: string,
    input: Readonly<{ locale: string; name: string }>,
    actor: ActorContext,
  ): Promise<AdminProduct | null> {
    const exists = await this.#client.productVariant.findFirst({
      where: { id: variantId, productId, deletedAt: null },
      select: { id: true },
    });
    if (exists === null) return null;
    try {
      const product = await this.#client.$transaction(async (transaction) => {
        await transaction.variantTranslation.upsert({
          where: { variantId_locale: { variantId, locale: input.locale } },
          create: {
            id: translationId,
            variantId,
            locale: input.locale,
            name: input.name,
            createdBy: actor.actorUserId,
            updatedBy: actor.actorUserId,
          },
          update: { name: input.name, updatedBy: actor.actorUserId },
        });
        await transaction.auditLog.create({
          data: audit(actor, 'catalog.variant.translation_updated', 'product_variant', variantId),
        });
        await transaction.outboxEvent.create({
          data: outbox('product', productId, 'catalog.product.updated'),
        });
        return transaction.product.findUniqueOrThrow({
          where: { id: productId },
          include: adminProductInclude,
        });
      });
      return this.#adminProduct(product);
    } catch (error) {
      conflict(error, 'VARIANT_TRANSLATION_CONFLICT');
    }
  }

  async setDefaultVariant(
    productId: string,
    variantId: string,
    actor: ActorContext,
  ): Promise<AdminProduct | null> {
    const variant = await this.#client.productVariant.findFirst({
      where: { id: variantId, productId, deletedAt: null, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });
    if (variant === null) return null;
    const product = await this.#client.$transaction(async (transaction) => {
      await transaction.productVariant.updateMany({
        where: { productId, isDefault: true },
        data: { isDefault: false, updatedBy: actor.actorUserId },
      });
      await transaction.productVariant.update({
        where: { id: variantId },
        data: { isDefault: true, updatedBy: actor.actorUserId },
      });
      await transaction.product.update({
        where: { id: productId },
        data: { defaultVariantId: variantId, updatedBy: actor.actorUserId },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'catalog.product.default_variant_set', 'product', productId),
      });
      await transaction.outboxEvent.create({
        data: outbox('product', productId, 'catalog.product.updated'),
      });
      return transaction.product.findUniqueOrThrow({
        where: { id: productId },
        include: adminProductInclude,
      });
    });
    return this.#adminProduct(product);
  }

  async transitionProduct(
    productId: string,
    target: 'PUBLISHED' | 'ARCHIVED',
    enabledLocales: readonly string[],
    validMediaAssetIds: ReadonlySet<string>,
    actor: ActorContext,
  ): Promise<AdminProduct | null> {
    const exists = await this.#client.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (exists === null) return null;
    if (exists.status === 'ARCHIVED') {
      throw new ConflictAppError({ code: 'PRODUCT_TRANSITION_INVALID' });
    }
    try {
      const product = await this.#client.$transaction(async (transaction) => {
        const current = await transaction.product.findUniqueOrThrow({
          where: { id: productId },
          include: adminProductInclude,
        });
        if (target === 'PUBLISHED') {
          assertPublicationCompleteness(
            {
              translations: current.translations,
              variants: current.variants,
              categories: current.categories.map((entry) => entry.category),
              primaryCategoryId: current.primaryCategoryId,
              mediaAssetIds: current.media.map((entry) => entry.mediaAssetId),
              validMediaAssetIds,
            },
            enabledLocales,
          );
        }
        const now = new Date();
        await transaction.product.update({
          where: { id: productId },
          data: {
            status: target,
            publishedAt: target === 'PUBLISHED' ? now : current.publishedAt,
            updatedBy: actor.actorUserId,
          },
        });
        const action =
          target === 'PUBLISHED' ? 'catalog.product.published' : 'catalog.product.archived';
        await transaction.auditLog.create({
          data: audit(
            actor,
            action,
            'product',
            productId,
            { status: current.status },
            { status: target },
          ),
        });
        await transaction.outboxEvent.create({ data: outbox('product', productId, action) });
        return transaction.product.findUniqueOrThrow({
          where: { id: productId },
          include: adminProductInclude,
        });
      });
      return this.#adminProduct(product);
    } catch (error) {
      if (error instanceof TypeError)
        throw new ConflictAppError({
          code: 'PRODUCT_PUBLICATION_INCOMPLETE',
          safeDetail: error.message,
        });
      conflict(error);
    }
  }

  async createCategory(
    id: string,
    parentId: string | null,
    sortWeight: number,
    maximumDepth: number,
    actor: ActorContext,
  ): Promise<string> {
    try {
      return await this.#client.$transaction(async (transaction) => {
        const parent =
          parentId === null
            ? null
            : await transaction.category.findFirst({ where: { id: parentId, deletedAt: null } });
        if (parentId !== null && parent === null)
          throw new ConflictAppError({ code: 'CATEGORY_PARENT_INVALID' });
        const path = parent === null ? `/${id}` : `${parent.path}/${id}`;
        if (this.#pathDepth(path) > maximumDepth)
          throw new ConflictAppError({ code: 'CATEGORY_DEPTH_EXCEEDED' });
        await transaction.category.create({
          data: {
            id,
            parentId,
            path,
            sortWeight,
            createdBy: actor.actorUserId,
            updatedBy: actor.actorUserId,
          },
        });
        await transaction.auditLog.create({
          data: audit(actor, 'catalog.category.created', 'category', id),
        });
        await transaction.outboxEvent.create({
          data: outbox('category', id, 'catalog.category.updated'),
        });
        return id;
      });
    } catch (error) {
      if (error instanceof ConflictAppError) throw error;
      conflict(error, 'CATEGORY_CONFLICT');
    }
  }

  async moveCategory(
    id: string,
    parentId: string | null,
    maximumDepth: number,
    actor: ActorContext,
  ): Promise<boolean> {
    if (id === parentId) throw new ConflictAppError({ code: 'CATEGORY_CYCLE' });
    return this.#client.$transaction(async (transaction) => {
      const category = await transaction.category.findFirst({ where: { id, deletedAt: null } });
      if (category === null) return false;
      const parent =
        parentId === null
          ? null
          : await transaction.category.findFirst({ where: { id: parentId, deletedAt: null } });
      if (parentId !== null && parent === null)
        throw new ConflictAppError({ code: 'CATEGORY_PARENT_INVALID' });
      if (
        parent !== null &&
        (parent.path === category.path || parent.path.startsWith(`${category.path}/`))
      ) {
        throw new ConflictAppError({ code: 'CATEGORY_CYCLE' });
      }
      const descendantPaths = await transaction.category.findMany({
        where: { path: { startsWith: `${category.path}/` }, deletedAt: null },
        select: { id: true, path: true },
      });
      const subtreeHeight = descendantPaths.reduce(
        (height, entry) =>
          Math.max(height, this.#pathDepth(entry.path) - this.#pathDepth(category.path)),
        0,
      );
      const newPath = parent === null ? `/${id}` : `${parent.path}/${id}`;
      if (this.#pathDepth(newPath) + subtreeHeight > maximumDepth)
        throw new ConflictAppError({ code: 'CATEGORY_DEPTH_EXCEEDED' });
      const oldPath = category.path;
      for (const descendant of descendantPaths.sort(
        (left, right) => right.path.length - left.path.length,
      )) {
        await transaction.category.update({
          where: { id: descendant.id },
          data: {
            path: `${newPath}${descendant.path.slice(oldPath.length)}`,
            updatedBy: actor.actorUserId,
          },
        });
      }
      await transaction.category.update({
        where: { id },
        data: { parentId, path: newPath, updatedBy: actor.actorUserId },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'catalog.category.moved', 'category', id),
      });
      await transaction.outboxEvent.create({
        data: outbox('category', id, 'catalog.category.updated'),
      });
      return true;
    });
  }

  async updateCategory(id: string, sortWeight: number, actor: ActorContext): Promise<boolean> {
    const category = await this.#client.category.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (category === null) return false;
    await this.#client.$transaction(async (transaction) => {
      await transaction.category.update({
        where: { id },
        data: { sortWeight, updatedBy: actor.actorUserId },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'catalog.category.updated', 'category', id),
      });
      await transaction.outboxEvent.create({
        data: outbox('category', id, 'catalog.category.updated'),
      });
    });
    return true;
  }

  async upsertCategoryTranslation(
    categoryId: string,
    translationId: string,
    input: Readonly<{
      locale: string;
      name: string;
      slug: string;
      description?: string | null;
      metaTitle?: string | null;
      metaDescription?: string | null;
    }>,
    actor: ActorContext,
  ): Promise<Readonly<{ oldSlug: string | null }> | null> {
    const category = await this.#client.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true },
    });
    if (category === null) return null;
    try {
      return await this.#client.$transaction(async (transaction) => {
        await this.#assertSlugAvailable(
          transaction,
          'CATEGORY',
          categoryId,
          input.locale,
          input.slug,
        );
        const existing = await transaction.categoryTranslation.findUnique({
          where: { categoryId_locale: { categoryId, locale: input.locale } },
        });
        const oldSlug = existing?.slug !== input.slug ? (existing?.slug ?? null) : null;
        if (oldSlug !== null)
          await this.#writeSlugHistory(
            transaction,
            'CATEGORY',
            categoryId,
            input.locale,
            oldSlug,
            actor.actorUserId,
          );
        await transaction.categoryTranslation.upsert({
          where: { categoryId_locale: { categoryId, locale: input.locale } },
          create: {
            id: translationId,
            categoryId,
            locale: input.locale,
            name: input.name,
            slug: input.slug,
            description: input.description ?? null,
            metaTitle: input.metaTitle ?? null,
            metaDescription: input.metaDescription ?? null,
            createdBy: actor.actorUserId,
            updatedBy: actor.actorUserId,
          },
          update: {
            name: input.name,
            slug: input.slug,
            description: input.description ?? null,
            metaTitle: input.metaTitle ?? null,
            metaDescription: input.metaDescription ?? null,
            updatedBy: actor.actorUserId,
          },
        });
        await transaction.auditLog.create({
          data: audit(actor, 'catalog.category.translation_updated', 'category', categoryId),
        });
        await transaction.outboxEvent.create({
          data: outbox('category', categoryId, 'catalog.category.updated'),
        });
        return { oldSlug };
      });
    } catch (error) {
      conflict(error, 'CATALOG_SLUG_CONFLICT');
    }
  }

  async createCollection(id: string, sortWeight: number, actor: ActorContext): Promise<string> {
    try {
      await this.#client.$transaction(async (transaction) => {
        await transaction.collection.create({
          data: {
            id,
            status: 'DRAFT',
            sortWeight,
            createdBy: actor.actorUserId,
            updatedBy: actor.actorUserId,
          },
        });
        await transaction.auditLog.create({
          data: audit(actor, 'catalog.collection.created', 'collection', id),
        });
        await transaction.outboxEvent.create({
          data: outbox('collection', id, 'catalog.collection.updated'),
        });
      });
      return id;
    } catch (error) {
      conflict(error, 'COLLECTION_CONFLICT');
    }
  }

  async updateCollection(id: string, sortWeight: number, actor: ActorContext): Promise<boolean> {
    const collection = await this.#client.collection.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (collection === null) return false;
    await this.#client.$transaction(async (transaction) => {
      await transaction.collection.update({
        where: { id },
        data: { sortWeight, updatedBy: actor.actorUserId },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'catalog.collection.updated', 'collection', id),
      });
      await transaction.outboxEvent.create({
        data: outbox('collection', id, 'catalog.collection.updated'),
      });
    });
    return true;
  }

  async upsertCollectionTranslation(
    collectionId: string,
    translationId: string,
    input: Readonly<{
      locale: string;
      name: string;
      slug: string;
      description?: string | null;
      metaTitle?: string | null;
      metaDescription?: string | null;
    }>,
    actor: ActorContext,
  ): Promise<Readonly<{ oldSlug: string | null }> | null> {
    const collection = await this.#client.collection.findFirst({
      where: { id: collectionId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (collection === null) return null;
    try {
      return await this.#client.$transaction(async (transaction) => {
        await this.#assertSlugAvailable(
          transaction,
          'COLLECTION',
          collectionId,
          input.locale,
          input.slug,
        );
        const existing = await transaction.collectionTranslation.findUnique({
          where: { collectionId_locale: { collectionId, locale: input.locale } },
        });
        const oldSlug = existing?.slug !== input.slug ? (existing?.slug ?? null) : null;
        if (oldSlug !== null && collection.status === 'PUBLISHED')
          await this.#writeSlugHistory(
            transaction,
            'COLLECTION',
            collectionId,
            input.locale,
            oldSlug,
            actor.actorUserId,
          );
        await transaction.collectionTranslation.upsert({
          where: { collectionId_locale: { collectionId, locale: input.locale } },
          create: {
            id: translationId,
            collectionId,
            locale: input.locale,
            name: input.name,
            slug: input.slug,
            description: input.description ?? null,
            metaTitle: input.metaTitle ?? null,
            metaDescription: input.metaDescription ?? null,
            createdBy: actor.actorUserId,
            updatedBy: actor.actorUserId,
          },
          update: {
            name: input.name,
            slug: input.slug,
            description: input.description ?? null,
            metaTitle: input.metaTitle ?? null,
            metaDescription: input.metaDescription ?? null,
            updatedBy: actor.actorUserId,
          },
        });
        await transaction.auditLog.create({
          data: audit(actor, 'catalog.collection.translation_updated', 'collection', collectionId),
        });
        await transaction.outboxEvent.create({
          data: outbox(
            'collection',
            collectionId,
            oldSlug === null ? 'catalog.collection.updated' : 'catalog.collection.slug_changed',
          ),
        });
        return { oldSlug };
      });
    } catch (error) {
      conflict(error, 'CATALOG_SLUG_CONFLICT');
    }
  }

  async transitionCollection(
    collectionId: string,
    target: 'PUBLISHED' | 'ARCHIVED',
    enabledLocales: readonly string[],
    actor: ActorContext,
  ): Promise<boolean> {
    return this.#client.$transaction(async (transaction) => {
      const collection = await transaction.collection.findFirst({
        where: { id: collectionId, deletedAt: null },
        include: { translations: true },
      });
      if (collection === null) return false;
      if (collection.status === 'ARCHIVED') {
        throw new ConflictAppError({ code: 'COLLECTION_TRANSITION_INVALID' });
      }
      if (target === 'PUBLISHED') {
        const locales = new Set(collection.translations.map((entry) => entry.locale));
        if (!enabledLocales.every((locale) => locales.has(locale)))
          throw new ConflictAppError({ code: 'COLLECTION_PUBLICATION_INCOMPLETE' });
      }
      await transaction.collection.update({
        where: { id: collectionId },
        data: {
          status: target,
          publishedAt: target === 'PUBLISHED' ? new Date() : collection.publishedAt,
          updatedBy: actor.actorUserId,
        },
      });
      const action =
        target === 'PUBLISHED' ? 'catalog.collection.published' : 'catalog.collection.archived';
      await transaction.auditLog.create({
        data: audit(
          actor,
          action,
          'collection',
          collectionId,
          { status: collection.status },
          { status: target },
        ),
      });
      await transaction.outboxEvent.create({ data: outbox('collection', collectionId, action) });
      return true;
    });
  }

  async assignProductCategory(
    productId: string,
    categoryId: string,
    primary: boolean,
    actor: ActorContext,
  ): Promise<boolean> {
    const [product, category] = await Promise.all([
      this.#client.product.findFirst({
        where: { id: productId, deletedAt: null },
        select: { id: true },
      }),
      this.#client.category.findFirst({
        where: { id: categoryId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (product === null || category === null) return false;
    await this.#client.$transaction(async (transaction) => {
      await transaction.productCategory.upsert({
        where: { productId_categoryId: { productId, categoryId } },
        create: {
          id: randomUUID(),
          productId,
          categoryId,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
        },
        update: { updatedBy: actor.actorUserId },
      });
      if (primary)
        await transaction.product.update({
          where: { id: productId },
          data: { primaryCategoryId: categoryId, updatedBy: actor.actorUserId },
        });
      await transaction.auditLog.create({
        data: audit(actor, 'catalog.product.category_assigned', 'product', productId),
      });
      await transaction.outboxEvent.create({
        data: outbox('product', productId, 'catalog.product.updated'),
      });
    });
    return true;
  }

  async unassignProductCategory(
    productId: string,
    categoryId: string,
    actor: ActorContext,
  ): Promise<boolean> {
    const product = await this.#client.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { primaryCategoryId: true },
    });
    if (product === null) return false;
    if (product.primaryCategoryId === categoryId)
      throw new ConflictAppError({ code: 'PRIMARY_CATEGORY_UNASSIGN_FORBIDDEN' });
    const membership = await this.#client.productCategory.findUnique({
      where: { productId_categoryId: { productId, categoryId } },
      select: { id: true },
    });
    if (membership === null) return false;
    await this.#client.$transaction(async (transaction) => {
      await transaction.productCategory.delete({
        where: { productId_categoryId: { productId, categoryId } },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'catalog.product.category_unassigned', 'product', productId),
      });
      await transaction.outboxEvent.create({
        data: outbox('product', productId, 'catalog.product.updated'),
      });
    });
    return true;
  }

  async assignProductCollection(
    productId: string,
    collectionId: string,
    position: number,
    actor: ActorContext,
  ): Promise<boolean> {
    const [product, collection] = await Promise.all([
      this.#client.product.findFirst({
        where: { id: productId, deletedAt: null },
        select: { id: true },
      }),
      this.#client.collection.findFirst({
        where: { id: collectionId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (product === null || collection === null) return false;
    try {
      await this.#client.$transaction(async (transaction) => {
        await transaction.productCollection.create({
          data: {
            id: randomUUID(),
            productId,
            collectionId,
            position,
            createdBy: actor.actorUserId,
            updatedBy: actor.actorUserId,
          },
        });
        await transaction.auditLog.create({
          data: audit(actor, 'catalog.product.collection_assigned', 'product', productId),
        });
        await transaction.outboxEvent.create({
          data: outbox('product', productId, 'catalog.product.updated'),
        });
      });
      return true;
    } catch (error) {
      conflict(error, 'COLLECTION_MEMBERSHIP_CONFLICT');
    }
  }

  async unassignProductCollection(
    productId: string,
    collectionId: string,
    actor: ActorContext,
  ): Promise<boolean> {
    const membership = await this.#client.productCollection.findUnique({
      where: { productId_collectionId: { productId, collectionId } },
      select: { id: true },
    });
    if (membership === null) return false;
    await this.#client.$transaction(async (transaction) => {
      await transaction.productCollection.delete({
        where: { productId_collectionId: { productId, collectionId } },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'catalog.product.collection_unassigned', 'product', productId),
      });
      await transaction.outboxEvent.create({
        data: outbox('product', productId, 'catalog.product.updated'),
      });
    });
    return true;
  }

  async attachProductMedia(
    productId: string,
    attachmentId: string,
    input: ProductMediaInput,
    actor: ActorContext,
  ): Promise<AdminProduct | null> {
    const product = await this.#client.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (product === null) return null;
    if (input.variantId !== null && input.variantId !== undefined) {
      const variant = await this.#client.productVariant.findFirst({
        where: { id: input.variantId, productId, deletedAt: null },
        select: { id: true },
      });
      if (variant === null) throw new ConflictAppError({ code: 'MEDIA_VARIANT_MISMATCH' });
    }
    try {
      const updated = await this.#client.$transaction(async (transaction) => {
        await transaction.productMedia.create({
          data: {
            id: attachmentId,
            productId,
            variantId: input.variantId ?? null,
            mediaAssetId: input.mediaAssetId,
            role: input.role,
            position: input.position,
            altTextByLocale: jsonInput(input.altTextByLocale),
            createdBy: actor.actorUserId,
            updatedBy: actor.actorUserId,
          },
        });
        await transaction.auditLog.create({
          data: audit(actor, 'catalog.product.media_attached', 'product', productId),
        });
        await transaction.outboxEvent.create({
          data: outbox('product', productId, 'catalog.product.updated'),
        });
        return transaction.product.findUniqueOrThrow({
          where: { id: productId },
          include: adminProductInclude,
        });
      });
      return this.#adminProduct(updated);
    } catch (error) {
      conflict(error, 'PRODUCT_MEDIA_CONFLICT');
    }
  }

  async updateProductMedia(
    productId: string,
    attachmentId: string,
    input: Pick<ProductMediaInput, 'position' | 'role' | 'altTextByLocale'>,
    actor: ActorContext,
  ): Promise<AdminProduct | null> {
    const attachment = await this.#client.productMedia.findFirst({
      where: { id: attachmentId, productId },
      select: { id: true },
    });
    if (attachment === null) return null;
    const updated = await this.#client.$transaction(async (transaction) => {
      await transaction.productMedia.update({
        where: { id: attachmentId },
        data: {
          role: input.role,
          position: input.position,
          altTextByLocale: jsonInput(input.altTextByLocale),
          updatedBy: actor.actorUserId,
        },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'catalog.product.media_updated', 'product', productId),
      });
      await transaction.outboxEvent.create({
        data: outbox('product', productId, 'catalog.product.updated'),
      });
      return transaction.product.findUniqueOrThrow({
        where: { id: productId },
        include: adminProductInclude,
      });
    });
    return this.#adminProduct(updated);
  }

  async detachProductMedia(
    productId: string,
    attachmentId: string,
    actor: ActorContext,
  ): Promise<boolean> {
    const attachment = await this.#client.productMedia.findFirst({
      where: { id: attachmentId, productId },
      select: { id: true },
    });
    if (attachment === null) return false;
    await this.#client.$transaction(async (transaction) => {
      await transaction.productMedia.delete({ where: { id: attachmentId } });
      await transaction.auditLog.create({
        data: audit(actor, 'catalog.product.media_detached', 'product', productId),
      });
      await transaction.outboxEvent.create({
        data: outbox('product', productId, 'catalog.product.updated'),
      });
    });
    return true;
  }

  async listProducts(query: PublicQuery): Promise<ProductRows> {
    const filterSql = this.#filterSql(query.filters);
    const orderSql = this.#orderSql(query.sort);
    const cursorSql = this.#cursorSql(query.sort, query.cursor);
    const rows = await this.#client.$queryRaw<OrderedId[]>(Prisma.sql`
      SELECT p."id", ${orderSql.value} AS "sort_value"
      FROM "product" p
      JOIN "product_translation" pt ON pt."product_id" = p."id" AND pt."locale" = ${query.locale}
      WHERE p."status" = 'PUBLISHED' AND p."deleted_at" IS NULL
      ${filterSql}
      ${cursorSql}
      ORDER BY ${orderSql.order}
      LIMIT ${query.limit + 1}
    `);
    return this.#productRows(rows, query.locale, query.limit);
  }

  async searchProducts(query: SearchQuery): Promise<ProductRows> {
    const rank = Prisma.sql`similarity(honey_catalog_search_document(pt."name", pt."short_description", pt."description", pt."tasting_notes"), ${query.normalizedQuery})`;
    const order =
      query.sort === 'relevance'
        ? Prisma.sql`"sort_value" DESC, p."id" DESC`
        : query.sort === 'newest'
          ? Prisma.sql`p."published_at" DESC, p."id" DESC`
          : Prisma.sql`pt."name" ASC, p."id" ASC`;
    const value =
      query.sort === 'relevance'
        ? rank
        : query.sort === 'newest'
          ? Prisma.sql`p."published_at"`
          : Prisma.sql`pt."name"`;
    const cursor = this.#searchCursorSql(query, rank);
    const rows = await this.#client.$queryRaw<OrderedId[]>(Prisma.sql`
      SELECT p."id", ${value} AS "sort_value"
      FROM "product" p
      JOIN "product_translation" pt ON pt."product_id" = p."id" AND pt."locale" = ${query.locale}
      WHERE p."status" = 'PUBLISHED' AND p."deleted_at" IS NULL
        AND honey_catalog_search_document(pt."name", pt."short_description", pt."description", pt."tasting_notes") % ${query.normalizedQuery}
      ${cursor}
      ORDER BY ${order}
      LIMIT ${query.limit + 1}
    `);
    return this.#productRows(rows, query.locale, query.limit);
  }

  async resolveProductSlug(
    locale: string,
    slug: string,
  ): Promise<SlugResolution<CatalogProductRecord>> {
    const translation = await this.#client.productTranslation.findFirst({
      where: { locale, slug, product: { status: 'PUBLISHED', deletedAt: null } },
      select: { productId: true },
    });
    if (translation !== null) {
      const products = await this.#hydrateProducts([translation.productId], locale);
      const product = products[0];
      return product === undefined ? { kind: 'NOT_FOUND' } : { kind: 'FOUND', entity: product };
    }
    const history = await this.#client.slugHistory.findUnique({
      where: { entityType_locale_oldSlug: { entityType: 'PRODUCT', locale, oldSlug: slug } },
    });
    if (history === null) return { kind: 'NOT_FOUND' };
    const current = await this.#client.productTranslation.findFirst({
      where: {
        productId: history.entityId,
        locale,
        product: { status: 'PUBLISHED', deletedAt: null },
      },
      select: { slug: true },
    });
    return current === null
      ? { kind: 'NOT_FOUND' }
      : { kind: 'REDIRECT', currentSlug: current.slug };
  }

  async listCategories(locale: string): Promise<readonly PublicCategory[]> {
    const rows = await this.#client.category.findMany({
      where: { deletedAt: null, translations: { some: { locale } } },
      include: { translations: { where: { locale }, take: 1 } },
      orderBy: [{ path: 'asc' }, { sortWeight: 'asc' }, { id: 'asc' }],
    });
    return rows.flatMap((category) => {
      const translation = category.translations[0];
      return translation === undefined
        ? []
        : [
            {
              id: category.id,
              parentId: category.parentId,
              path: category.path,
              name: translation.name,
              slug: translation.slug,
              description: translation.description,
              metaTitle: translation.metaTitle,
              metaDescription: translation.metaDescription,
              sortWeight: category.sortWeight,
            },
          ];
    });
  }

  async resolveCategorySlug(locale: string, slug: string): Promise<SlugResolution<PublicCategory>> {
    const translation = await this.#client.categoryTranslation.findFirst({
      where: { locale, slug, category: { deletedAt: null } },
      include: { category: true },
    });
    if (translation !== null)
      return {
        kind: 'FOUND',
        entity: {
          id: translation.category.id,
          parentId: translation.category.parentId,
          path: translation.category.path,
          name: translation.name,
          slug: translation.slug,
          description: translation.description,
          metaTitle: translation.metaTitle,
          metaDescription: translation.metaDescription,
          sortWeight: translation.category.sortWeight,
        },
      };
    const history = await this.#client.slugHistory.findUnique({
      where: { entityType_locale_oldSlug: { entityType: 'CATEGORY', locale, oldSlug: slug } },
    });
    if (history === null) return { kind: 'NOT_FOUND' };
    const current = await this.#client.categoryTranslation.findFirst({
      where: { categoryId: history.entityId, locale, category: { deletedAt: null } },
      select: { slug: true },
    });
    return current === null
      ? { kind: 'NOT_FOUND' }
      : { kind: 'REDIRECT', currentSlug: current.slug };
  }

  async listCollections(locale: string): Promise<readonly PublicCollection[]> {
    const rows = await this.#client.collection.findMany({
      where: { status: 'PUBLISHED', deletedAt: null, translations: { some: { locale } } },
      include: { translations: { where: { locale }, take: 1 } },
      orderBy: [{ sortWeight: 'asc' }, { id: 'asc' }],
    });
    return rows.flatMap((collection) => {
      const translation = collection.translations[0];
      return translation === undefined || collection.publishedAt === null
        ? []
        : [
            {
              id: collection.id,
              name: translation.name,
              slug: translation.slug,
              description: translation.description,
              metaTitle: translation.metaTitle,
              metaDescription: translation.metaDescription,
              sortWeight: collection.sortWeight,
              publishedAt: collection.publishedAt.toISOString(),
            },
          ];
    });
  }

  async resolveCollectionSlug(
    locale: string,
    slug: string,
  ): Promise<SlugResolution<PublicCollection>> {
    const translation = await this.#client.collectionTranslation.findFirst({
      where: { locale, slug, collection: { status: 'PUBLISHED', deletedAt: null } },
      include: { collection: true },
    });
    if (translation !== null && translation.collection.publishedAt !== null)
      return {
        kind: 'FOUND',
        entity: {
          id: translation.collection.id,
          name: translation.name,
          slug: translation.slug,
          description: translation.description,
          metaTitle: translation.metaTitle,
          metaDescription: translation.metaDescription,
          sortWeight: translation.collection.sortWeight,
          publishedAt: translation.collection.publishedAt.toISOString(),
        },
      };
    const history = await this.#client.slugHistory.findUnique({
      where: { entityType_locale_oldSlug: { entityType: 'COLLECTION', locale, oldSlug: slug } },
    });
    if (history === null) return { kind: 'NOT_FOUND' };
    const current = await this.#client.collectionTranslation.findFirst({
      where: {
        collectionId: history.entityId,
        locale,
        collection: { status: 'PUBLISHED', deletedAt: null },
      },
      select: { slug: true },
    });
    return current === null
      ? { kind: 'NOT_FOUND' }
      : { kind: 'REDIRECT', currentSlug: current.slug };
  }

  async close(): Promise<void> {
    await this.#client.$disconnect();
  }

  async #productRows(
    rows: readonly OrderedId[],
    locale: string,
    limit: number,
  ): Promise<ProductRows> {
    const selected = rows.slice(0, limit);
    const products = await this.#hydrateProducts(
      selected.map((row) => row.id),
      locale,
    );
    const byId = new Map(products.map((product) => [product.id, product]));
    const items = selected.flatMap((row) => {
      const product = byId.get(row.id);
      return product === undefined ? [] : [product];
    });
    const last = selected.at(-1);
    return {
      items,
      hasMore: rows.length > limit,
      nextSortValue: last === undefined ? null : sortValue(last.sort_value),
      nextId: last?.id ?? null,
    };
  }

  async #hydrateProducts(
    ids: readonly string[],
    locale: string,
  ): Promise<readonly CatalogProductRecord[]> {
    if (ids.length === 0) return [];
    const products = await this.#client.product.findMany({
      where: { id: { in: [...ids] }, status: 'PUBLISHED', deletedAt: null },
      include: publicProductInclude(locale),
    });
    return products.flatMap((product) => {
      const mapped = this.#publicProduct(product);
      return mapped === null ? [] : [mapped];
    });
  }

  #publicProduct(product: StoredPublicProduct): CatalogProductRecord | null {
    const translation = product.translations[0];
    if (translation === undefined || product.publishedAt === null) return null;
    const variants: PublicVariant[] = product.variants.flatMap((variant) => {
      const variantTranslation = variant.translations[0];
      return variantTranslation === undefined
        ? []
        : [
            {
              id: variant.id,
              sku: variant.sku,
              name: variantTranslation.name,
              netWeightGrams: variant.netWeightGrams,
              jarSizeLabelKey: variant.jarSizeLabelKey,
              packagingTypeKey: variant.packagingTypeKey,
              weightGramsShipping: variant.weightGramsShipping,
              dimensionsMm: dimensions(variant.dimensionsMm),
              position: variant.position,
              isDefault: variant.isDefault,
            },
          ];
    });
    return {
      id: product.id,
      name: translation.name,
      slug: translation.slug,
      brandLine: product.brandLine,
      shortDescription: translation.shortDescription,
      description: translation.description,
      tastingNotes: translation.tastingNotes,
      pairingSuggestions: translation.pairingSuggestions,
      storyHtml: translation.storyHtml,
      metaTitle: translation.metaTitle,
      metaDescription: translation.metaDescription,
      honeyVarietal: product.honeyVarietal,
      floralSources: product.floralSources,
      originRegion: product.originRegion,
      originAltitudeBand: product.originAltitudeBand,
      harvestSeason: product.harvestSeason,
      publishedAt: product.publishedAt.toISOString(),
      variants,
      media: product.media.map((entry) => ({
        id: entry.id,
        mediaAssetId: entry.mediaAssetId,
        role: entry.role,
        position: entry.position,
        altTextByLocale: jsonRecord(entry.altTextByLocale),
      })),
    };
  }

  #adminProduct(product: StoredAdminProduct): AdminProduct {
    return {
      id: product.id,
      status: product.status,
      publishedAt: product.publishedAt?.toISOString() ?? null,
      sku: product.sku,
      brandLine: product.brandLine,
      honeyVarietal: product.honeyVarietal,
      floralSources: product.floralSources,
      originRegion: product.originRegion,
      originAltitudeBand: product.originAltitudeBand,
      harvestSeason: product.harvestSeason,
      sourcingType: product.sourcingType,
      apiaryId: product.apiaryId,
      sortWeight: product.sortWeight,
      primaryCategoryId: product.primaryCategoryId,
      defaultVariantId: product.defaultVariantId,
      translations: product.translations.map((entry) => ({
        id: entry.id,
        ...translationData(entry),
      })),
      variants: product.variants.map((variant) => ({
        id: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        status: variant.status,
        netWeightGrams: variant.netWeightGrams,
        jarSizeLabelKey: variant.jarSizeLabelKey,
        packagingTypeKey: variant.packagingTypeKey,
        barcode: variant.barcode,
        weightGramsShipping: variant.weightGramsShipping,
        dimensionsMm: variant.dimensionsMm,
        position: variant.position,
        isDefault: variant.isDefault,
        deletedAt: variant.deletedAt?.toISOString() ?? null,
        translations: variant.translations.map((entry) => ({
          id: entry.id,
          locale: entry.locale,
          name: entry.name,
        })),
      })),
      categories: product.categories.map((entry) => ({
        id: entry.category.id,
        deletedAt: entry.category.deletedAt?.toISOString() ?? null,
      })),
      collections: product.collections.map((entry) => ({
        id: entry.collectionId,
        position: entry.position,
      })),
      media: product.media.map((entry) => ({
        id: entry.id,
        variantId: entry.variantId,
        mediaAssetId: entry.mediaAssetId,
        role: entry.role,
        position: entry.position,
        altTextByLocale: jsonRecord(entry.altTextByLocale),
      })),
    };
  }

  #filterSql(filters: PublicQuery['filters']): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    if (filters.categoryId !== undefined)
      parts.push(
        Prisma.sql`AND EXISTS (SELECT 1 FROM "product_category" pc WHERE pc."product_id" = p."id" AND pc."category_id" = ${filters.categoryId}::uuid)`,
      );
    if (filters.collectionId !== undefined)
      parts.push(
        Prisma.sql`AND EXISTS (SELECT 1 FROM "product_collection" pcl JOIN "collection" c ON c."id" = pcl."collection_id" WHERE pcl."product_id" = p."id" AND pcl."collection_id" = ${filters.collectionId}::uuid AND c."status" = 'PUBLISHED' AND c."deleted_at" IS NULL)`,
      );
    if (filters.honeyVarietal !== undefined)
      parts.push(Prisma.sql`AND p."honey_varietal" = ${filters.honeyVarietal}`);
    if (filters.originRegion !== undefined)
      parts.push(Prisma.sql`AND p."origin_region" = ${filters.originRegion}`);
    if (filters.floralSource !== undefined)
      parts.push(Prisma.sql`AND ${filters.floralSource} = ANY(p."floral_sources")`);
    if (filters.minimumNetWeightGrams !== undefined)
      parts.push(
        Prisma.sql`AND EXISTS (SELECT 1 FROM "product_variant" pv WHERE pv."product_id" = p."id" AND pv."status" = 'PUBLISHED' AND pv."deleted_at" IS NULL AND pv."net_weight_grams" >= ${filters.minimumNetWeightGrams})`,
      );
    if (filters.maximumNetWeightGrams !== undefined)
      parts.push(
        Prisma.sql`AND EXISTS (SELECT 1 FROM "product_variant" pv WHERE pv."product_id" = p."id" AND pv."status" = 'PUBLISHED' AND pv."deleted_at" IS NULL AND pv."net_weight_grams" <= ${filters.maximumNetWeightGrams})`,
      );
    return parts.length === 0 ? Prisma.empty : Prisma.join(parts, ' ');
  }

  #orderSql(sort: PublicQuery['sort']): Readonly<{ value: Prisma.Sql; order: Prisma.Sql }> {
    if (sort === 'oldest')
      return {
        value: Prisma.sql`p."published_at"`,
        order: Prisma.sql`p."published_at" ASC, p."id" ASC`,
      };
    if (sort === 'name')
      return { value: Prisma.sql`pt."name"`, order: Prisma.sql`pt."name" ASC, p."id" ASC` };
    if (sort === 'sort-weight')
      return {
        value: Prisma.sql`p."sort_weight"`,
        order: Prisma.sql`p."sort_weight" ASC, p."id" ASC`,
      };
    return {
      value: Prisma.sql`p."published_at"`,
      order: Prisma.sql`p."published_at" DESC, p."id" DESC`,
    };
  }

  #cursorSql(sort: PublicQuery['sort'], cursor: PublicQuery['cursor']): Prisma.Sql {
    if (cursor === null) return Prisma.empty;
    if (sort === 'name') {
      if (typeof cursor.sortValue !== 'string')
        throw new TypeError('Cursor sort value is invalid.');
      return Prisma.sql`AND (pt."name", p."id") > (${cursor.sortValue}, ${cursor.id}::uuid)`;
    }
    if (sort === 'sort-weight') {
      if (typeof cursor.sortValue !== 'number')
        throw new TypeError('Cursor sort value is invalid.');
      return Prisma.sql`AND (p."sort_weight", p."id") > (${cursor.sortValue}, ${cursor.id}::uuid)`;
    }
    if (typeof cursor.sortValue !== 'string') throw new TypeError('Cursor sort value is invalid.');
    return sort === 'oldest'
      ? Prisma.sql`AND (p."published_at", p."id") > (${new Date(cursor.sortValue)}, ${cursor.id}::uuid)`
      : Prisma.sql`AND (p."published_at", p."id") < (${new Date(cursor.sortValue)}, ${cursor.id}::uuid)`;
  }

  #searchCursorSql(query: SearchQuery, rank: Prisma.Sql): Prisma.Sql {
    if (query.cursor === null) return Prisma.empty;
    if (query.sort === 'relevance') {
      if (typeof query.cursor.sortValue !== 'number')
        throw new TypeError('Cursor sort value is invalid.');
      return Prisma.sql`AND (${rank}, p."id") < (${query.cursor.sortValue}, ${query.cursor.id}::uuid)`;
    }
    if (query.sort === 'name') {
      if (typeof query.cursor.sortValue !== 'string')
        throw new TypeError('Cursor sort value is invalid.');
      return Prisma.sql`AND (pt."name", p."id") > (${query.cursor.sortValue}, ${query.cursor.id}::uuid)`;
    }
    if (typeof query.cursor.sortValue !== 'string')
      throw new TypeError('Cursor sort value is invalid.');
    return Prisma.sql`AND (p."published_at", p."id") < (${new Date(query.cursor.sortValue)}, ${query.cursor.id}::uuid)`;
  }

  async #assertSlugAvailable(
    transaction: TransactionClient,
    entityType: 'PRODUCT' | 'CATEGORY' | 'COLLECTION',
    entityId: string,
    locale: string,
    slug: string,
  ): Promise<void> {
    const history = await transaction.slugHistory.findUnique({
      where: { entityType_locale_oldSlug: { entityType, locale, oldSlug: slug } },
    });
    if (history !== null && history.entityId !== entityId)
      throw new ConflictAppError({ code: 'CATALOG_SLUG_CONFLICT' });
  }

  async #writeSlugHistory(
    transaction: TransactionClient,
    entityType: 'PRODUCT' | 'CATEGORY' | 'COLLECTION',
    entityId: string,
    locale: string,
    oldSlug: string,
    actorUserId: string,
  ): Promise<void> {
    await transaction.slugHistory.upsert({
      where: { entityType_locale_oldSlug: { entityType, locale, oldSlug } },
      create: {
        id: randomUUID(),
        entityType,
        entityId,
        locale,
        oldSlug,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      update: {},
    });
  }

  #pathDepth(path: string): number {
    return path.split('/').filter(Boolean).length;
  }
}
