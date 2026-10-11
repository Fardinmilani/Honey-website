import { createPrismaClient } from '@honey/db';
import { adminPage, adminPageInput } from '../../../platform/domain/admin-page.js';
import type { AdminMediaQuery, AdminMediaRepository } from '../domain/admin-media.js';
export class PrismaAdminMediaRepository implements AdminMediaRepository {
  readonly #client;
  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }
  async list(query: AdminMediaQuery) {
    const page = adminPageInput(query);
    const rows = await this.#client.mediaAsset.findMany({
      where: {
        ...(page.cursor === undefined ? {} : { id: { lt: page.cursor } }),
        ...(query.assetId === undefined ? {} : { AND: { id: query.assetId } }),
        ...(query.kind === undefined ? {} : { kind: query.kind }),
        ...(query.visibility === undefined ? {} : { visibility: query.visibility }),
      },
      orderBy: { id: 'desc' },
      take: page.limit + 1,
      select: { id: true },
    });
    return adminPage(rows, page.limit);
  }
  close() {
    return this.#client.$disconnect();
  }
}
