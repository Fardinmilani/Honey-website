import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@honey/db';

import { PrismaTransactionContext } from '../../../platform/infrastructure/prisma-platform.adapter.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import type { SourcingRepository } from '../domain/sourcing-repository.port.js';
import type {
  SourcingActorContext,
  AllocationInput,
  ApiaryInput,
  ApiaryRecord,
  ApiaryTranslationRecord,
  BatchAllocationRecord,
  HarvestBatchInput,
  HarvestBatchRecord,
} from '../domain/sourcing.js';

function mapApiary(row: {
  id: string;
  code: string;
  name: string;
  region: string;
  altitudeBand: string | null;
  notes: string | null;
  isOwnOperation: boolean;
  createdAt: Date;
  updatedAt: Date;
  translations: readonly { locale: string; name: string; description: string | null }[];
}): ApiaryRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    region: row.region,
    altitudeBand: row.altitudeBand,
    notes: row.notes,
    isOwnOperation: row.isOwnOperation,
    translations: row.translations.map((translation) => ({
      locale: translation.locale,
      name: translation.name,
      description: translation.description,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapBatch(row: {
  id: string;
  batchCode: string;
  sourcingType: HarvestBatchRecord['sourcingType'];
  apiaryId: string | null;
  supplierId: string | null;
  harvestSeason: string;
  harvestYear: number;
  floralSources: string[];
  receivedAt: Date | null;
  quantityGrams: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): HarvestBatchRecord {
  return {
    id: row.id,
    batchCode: row.batchCode,
    sourcingType: row.sourcingType,
    apiaryId: row.apiaryId,
    supplierId: row.supplierId,
    harvestSeason: row.harvestSeason,
    harvestYear: row.harvestYear,
    floralSources: row.floralSources,
    receivedAt: row.receivedAt === null ? null : row.receivedAt.toISOString(),
    quantityGrams: row.quantityGrams,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function audit(
  actor: SourcingActorContext,
  action: string,
  subjectType: string,
  subjectId: string,
  after?: Readonly<Record<string, boolean | number | string | null>>,
) {
  return {
    id: randomUUID(),
    actorUserId: actor.actorUserId,
    action,
    subjectType,
    subjectId,
    requestId: actor.metadata.requestId,
    ip: actor.metadata.clientIp ?? null,
    afterJson: after ?? {},
  };
}

const apiaryInclude = { translations: { orderBy: { locale: 'asc' as const } } };

export class PrismaSourcingRepository implements SourcingRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  runInTransaction<Result>(
    work: (transaction: TransactionContext) => Promise<Result>,
  ): Promise<Result> {
    return this.#client.$transaction((client) => work(new PrismaTransactionContext(client)));
  }

  async listApiaries(): Promise<readonly ApiaryRecord[]> {
    const rows = await this.#client.apiary.findMany({
      include: apiaryInclude,
      orderBy: { code: 'asc' },
    });
    return rows.map(mapApiary);
  }

  async getApiary(id: string): Promise<ApiaryRecord | null> {
    const row = await this.#client.apiary.findUnique({ where: { id }, include: apiaryInclude });
    return row === null ? null : mapApiary(row);
  }

  async createApiary(input: ApiaryInput, actor: SourcingActorContext): Promise<ApiaryRecord> {
    return this.#client.$transaction(async (transaction) => {
      const created = await transaction.apiary.create({
        data: {
          id: randomUUID(),
          code: input.code,
          name: input.name,
          region: input.region,
          altitudeBand: input.altitudeBand ?? null,
          notes: input.notes ?? null,
          isOwnOperation: input.isOwnOperation,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
        },
        include: apiaryInclude,
      });
      await transaction.auditLog.create({
        data: audit(actor, 'sourcing.apiary.created', 'apiary', created.id, { code: created.code }),
      });
      return mapApiary(created);
    });
  }

  async updateApiary(
    id: string,
    input: Partial<ApiaryInput>,
    actor: SourcingActorContext,
  ): Promise<ApiaryRecord | null> {
    return this.#client.$transaction(async (transaction) => {
      const existing = await transaction.apiary.findUnique({ where: { id } });
      if (existing === null) return null;
      const updated = await transaction.apiary.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.region === undefined ? {} : { region: input.region }),
          ...(input.altitudeBand === undefined ? {} : { altitudeBand: input.altitudeBand }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
          ...(input.isOwnOperation === undefined ? {} : { isOwnOperation: input.isOwnOperation }),
          updatedBy: actor.actorUserId,
        },
        include: apiaryInclude,
      });
      await transaction.auditLog.create({
        data: audit(actor, 'sourcing.apiary.updated', 'apiary', id, { code: updated.code }),
      });
      return mapApiary(updated);
    });
  }

  async upsertApiaryTranslation(
    apiaryId: string,
    translation: ApiaryTranslationRecord,
    actor: SourcingActorContext,
  ): Promise<ApiaryRecord | null> {
    return this.#client.$transaction(async (transaction) => {
      const existing = await transaction.apiary.findUnique({ where: { id: apiaryId } });
      if (existing === null) return null;
      await transaction.apiaryTranslation.upsert({
        where: { apiaryId_locale: { apiaryId, locale: translation.locale } },
        create: {
          id: randomUUID(),
          apiaryId,
          locale: translation.locale,
          name: translation.name,
          description: translation.description,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
        },
        update: {
          name: translation.name,
          description: translation.description,
          updatedBy: actor.actorUserId,
        },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'sourcing.apiary.translation_updated', 'apiary', apiaryId, {
          locale: translation.locale,
        }),
      });
      const row = await transaction.apiary.findUniqueOrThrow({
        where: { id: apiaryId },
        include: apiaryInclude,
      });
      return mapApiary(row);
    });
  }

  async listHarvestBatches(input: {
    cursor?: { createdAt: string; id: string };
    limit: number;
    sourcingType?: HarvestBatchRecord['sourcingType'];
  }): Promise<
    Readonly<{
      items: readonly HarvestBatchRecord[];
      next: { createdAt: string; id: string } | null;
    }>
  > {
    const cursorDate = input.cursor === undefined ? undefined : new Date(input.cursor.createdAt);
    const rows = await this.#client.harvestBatch.findMany({
      where: {
        ...(input.sourcingType === undefined ? {} : { sourcingType: input.sourcingType }),
        ...(cursorDate === undefined || input.cursor === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: cursorDate } },
                { createdAt: cursorDate, id: { lt: input.cursor.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const page = rows.slice(0, input.limit);
    const extra = rows[input.limit];
    return {
      items: page.map(mapBatch),
      next: extra === undefined ? null : { createdAt: extra.createdAt.toISOString(), id: extra.id },
    };
  }

  async getHarvestBatch(id: string): Promise<HarvestBatchRecord | null> {
    const row = await this.#client.harvestBatch.findUnique({ where: { id } });
    return row === null ? null : mapBatch(row);
  }

  async getHarvestBatchByCode(batchCode: string): Promise<HarvestBatchRecord | null> {
    const row = await this.#client.harvestBatch.findUnique({ where: { batchCode } });
    return row === null ? null : mapBatch(row);
  }

  async createHarvestBatch(
    input: HarvestBatchInput,
    actor: SourcingActorContext,
  ): Promise<HarvestBatchRecord> {
    return this.#client.$transaction(async (transaction) => {
      const created = await transaction.harvestBatch.create({
        data: {
          id: randomUUID(),
          batchCode: input.batchCode,
          sourcingType: input.sourcingType,
          apiaryId: input.apiaryId ?? null,
          supplierId: input.supplierId ?? null,
          harvestSeason: input.harvestSeason,
          harvestYear: input.harvestYear,
          floralSources: [...input.floralSources],
          receivedAt:
            input.receivedAt === undefined || input.receivedAt === null
              ? null
              : new Date(input.receivedAt),
          quantityGrams: input.quantityGrams,
          notes: input.notes ?? null,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
        },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'sourcing.harvest_batch.created', 'harvest_batch', created.id, {
          batchCode: created.batchCode,
          sourcingType: created.sourcingType,
        }),
      });
      return mapBatch(created);
    });
  }

  async updateHarvestBatch(
    id: string,
    input: Partial<HarvestBatchInput>,
    actor: SourcingActorContext,
  ): Promise<HarvestBatchRecord | null> {
    return this.#client.$transaction(async (transaction) => {
      const existing = await transaction.harvestBatch.findUnique({ where: { id } });
      if (existing === null) return null;
      const updated = await transaction.harvestBatch.update({
        where: { id },
        data: {
          ...(input.harvestSeason === undefined ? {} : { harvestSeason: input.harvestSeason }),
          ...(input.harvestYear === undefined ? {} : { harvestYear: input.harvestYear }),
          ...(input.floralSources === undefined ? {} : { floralSources: [...input.floralSources] }),
          ...(input.receivedAt === undefined
            ? {}
            : { receivedAt: input.receivedAt === null ? null : new Date(input.receivedAt) }),
          ...(input.quantityGrams === undefined ? {} : { quantityGrams: input.quantityGrams }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
          updatedBy: actor.actorUserId,
        },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'sourcing.harvest_batch.updated', 'harvest_batch', id, {
          batchCode: updated.batchCode,
        }),
      });
      return mapBatch(updated);
    });
  }

  async listAllocations(harvestBatchId: string): Promise<readonly BatchAllocationRecord[]> {
    const rows = await this.#client.batchAllocation.findMany({
      where: { harvestBatchId },
      orderBy: { packedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      harvestBatchId: row.harvestBatchId,
      variantId: row.variantId,
      quantityUnits: row.quantityUnits,
      packedAt: row.packedAt.toISOString(),
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getAllocation(id: string): Promise<BatchAllocationRecord | null> {
    const row = await this.#client.batchAllocation.findUnique({ where: { id } });
    if (row === null) return null;
    return {
      id: row.id,
      harvestBatchId: row.harvestBatchId,
      variantId: row.variantId,
      quantityUnits: row.quantityUnits,
      packedAt: row.packedAt.toISOString(),
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createAllocation(
    input: AllocationInput,
    actor: SourcingActorContext,
  ): Promise<BatchAllocationRecord> {
    return this.#client.$transaction(async (transaction) => {
      const created = await transaction.batchAllocation.create({
        data: {
          id: randomUUID(),
          harvestBatchId: input.harvestBatchId,
          variantId: input.variantId,
          quantityUnits: input.quantityUnits,
          packedAt: new Date(input.packedAt),
          notes: input.notes ?? null,
          createdBy: actor.actorUserId,
        },
      });
      await transaction.auditLog.create({
        data: audit(actor, 'sourcing.batch_allocation.created', 'batch_allocation', created.id, {
          harvestBatchId: created.harvestBatchId,
          variantId: created.variantId,
          quantityUnits: created.quantityUnits,
        }),
      });
      return {
        id: created.id,
        harvestBatchId: created.harvestBatchId,
        variantId: created.variantId,
        quantityUnits: created.quantityUnits,
        packedAt: created.packedAt.toISOString(),
        notes: created.notes,
        createdAt: created.createdAt.toISOString(),
      };
    });
  }

  async apiaryExists(id: string): Promise<boolean> {
    const row = await this.#client.apiary.findUnique({ where: { id }, select: { id: true } });
    return row !== null;
  }

  async close(): Promise<void> {
    await this.#client.$disconnect();
  }
}
