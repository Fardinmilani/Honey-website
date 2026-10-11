import { createPrismaClient, type Prisma } from '@honey/db';
import { adminPage, adminPageInput } from '../../../platform/domain/admin-page.js';
import type {
  AdminCatalogQuery,
  AdminCatalogRepository,
  AdminTaxonomyQuery,
} from '../domain/admin-catalog.js';
const translations = {
  locale: true,
  name: true,
  slug: true,
  description: true,
  metaTitle: true,
  metaDescription: true,
} satisfies Prisma.CategoryTranslationSelect;
export class PrismaAdminCatalogRepository implements AdminCatalogRepository {
  readonly #client;
  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }
  async products(query: AdminCatalogQuery) {
    const page = adminPageInput(query);
    const rows = await this.#client.product.findMany({
      where: {
        deletedAt: null,
        ...(page.cursor === undefined ? {} : { id: { lt: page.cursor } }),
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.q === undefined
          ? {}
          : {
              OR: [
                { sku: { contains: query.q, mode: 'insensitive' } },
                { translations: { some: { name: { contains: query.q, mode: 'insensitive' } } } },
              ],
            }),
      },
      orderBy: { id: 'desc' },
      take: page.limit + 1,
      select: {
        id: true,
        sku: true,
        status: true,
        updatedAt: true,
        translations: {
          orderBy: { locale: 'asc' },
          select: { locale: true, name: true, slug: true },
        },
      },
    });
    return adminPage(
      rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
      page.limit,
    );
  }
  async categories(query: AdminTaxonomyQuery) {
    const page = adminPageInput(query);
    const rows = await this.#client.category.findMany({
      where: {
        deletedAt: null,
        ...(query.id === undefined ? {} : { id: query.id }),
        ...(page.cursor === undefined ? {} : { id: { lt: page.cursor } }),
      },
      orderBy: { id: 'desc' },
      take: page.limit + 1,
      select: {
        id: true,
        parentId: true,
        path: true,
        sortWeight: true,
        translations: { select: translations, orderBy: { locale: 'asc' } },
      },
    });
    return adminPage(
      rows.map((row) => ({ ...row, status: null })),
      page.limit,
    );
  }
  async collections(query: AdminTaxonomyQuery) {
    const page = adminPageInput(query);
    const rows = await this.#client.collection.findMany({
      where: {
        deletedAt: null,
        ...(query.id === undefined ? {} : { id: query.id }),
        ...(page.cursor === undefined ? {} : { id: { lt: page.cursor } }),
      },
      orderBy: { id: 'desc' },
      take: page.limit + 1,
      select: {
        id: true,
        status: true,
        sortWeight: true,
        translations: { select: translations, orderBy: { locale: 'asc' } },
      },
    });
    return adminPage(
      rows.map((row) => ({ ...row, parentId: null, path: null })),
      page.limit,
    );
  }
  close() {
    return this.#client.$disconnect();
  }
}
