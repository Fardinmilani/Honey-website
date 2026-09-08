import {
  ConflictAppError,
  ForbiddenAppError,
  NotFoundAppError,
  ValidationAppError,
} from '../../../errors/index.js';
import type {
  AuthenticatedPrincipal,
  PermissionCode,
  RequestMetadata,
} from '../../identity/index.js';
import type { InventoryService } from '../../inventory/index.js';
import type { SourcingRepository } from '../domain/sourcing-repository.port.js';
import {
  SOURCING_TYPES,
  assertSourcingShape,
  type SourcingActorContext,
  type AllocationInput,
  type ApiaryInput,
  type ApiaryRecord,
  type ApiaryTranslationRecord,
  type BatchAllocationRecord,
  type HarvestBatchInput,
  type HarvestBatchRecord,
} from '../domain/sourcing.js';

function validation(path: string, code: string): ValidationAppError {
  return new ValidationAppError([{ path, code }]);
}

function assertAdmin(principal: AuthenticatedPrincipal, permission: PermissionCode): void {
  if (principal.kind !== 'STAFF') throw new ForbiddenAppError({ code: 'STAFF_REQUIRED' });
  if (!principal.permissions.includes(permission)) throw new ForbiddenAppError();
}

function boundedString(value: string, maximum: number, path: string): string {
  const normalized = value.normalize('NFC').trim();
  if (
    normalized.length < 1 ||
    Array.from(normalized).length > maximum ||
    /[\u0000-\u001F\u007F-\u009F]/u.test(normalized)
  ) {
    throw validation(path, 'SOURCING_TEXT_INVALID');
  }
  return normalized;
}

function optionalString(
  value: string | null | undefined,
  maximum: number,
  path: string,
): string | null {
  if (value === null || value === undefined) return null;
  return boundedString(value, maximum, path);
}

function uuid(value: string, path: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) {
    throw validation(path, 'SOURCING_ID_INVALID');
  }
  return value;
}

function decodeCursor(value: string | undefined): { createdAt: string; id: string } | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !('t' in parsed) ||
      !('id' in parsed) ||
      typeof parsed.t !== 'string' ||
      typeof parsed.id !== 'string'
    ) {
      throw new Error('invalid');
    }
    return { createdAt: parsed.t, id: parsed.id };
  } catch {
    throw validation('cursor', 'CURSOR_INVALID');
  }
}

function encodeCursor(value: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify({ v: 1, t: value.createdAt, id: value.id }), 'utf8').toString(
    'base64url',
  );
}

export class SourcingService {
  constructor(
    private readonly repository: SourcingRepository,
    private readonly inventory: InventoryService | undefined = undefined,
  ) {}

  async listApiaries(principal: AuthenticatedPrincipal): Promise<readonly ApiaryRecord[]> {
    assertAdmin(principal, 'inventory:read');
    return this.repository.listApiaries();
  }

  async getApiary(principal: AuthenticatedPrincipal, id: string): Promise<ApiaryRecord> {
    assertAdmin(principal, 'inventory:read');
    const apiary = await this.repository.getApiary(uuid(id, 'id'));
    if (apiary === null) throw new NotFoundAppError();
    return apiary;
  }

  async createApiary(
    principal: AuthenticatedPrincipal,
    input: ApiaryInput,
    metadata: RequestMetadata,
  ): Promise<ApiaryRecord> {
    assertAdmin(principal, 'inventory:adjust');
    try {
      return await this.repository.createApiary(
        this.#apiary(input),
        this.#actor(principal, metadata),
      );
    } catch (error) {
      this.#rethrow(error);
    }
  }

  async updateApiary(
    principal: AuthenticatedPrincipal,
    id: string,
    input: Partial<ApiaryInput>,
    metadata: RequestMetadata,
  ): Promise<ApiaryRecord> {
    assertAdmin(principal, 'inventory:adjust');
    const updated = await this.repository.updateApiary(
      uuid(id, 'id'),
      {
        ...(input.name === undefined ? {} : { name: boundedString(input.name, 160, 'name') }),
        ...(input.region === undefined
          ? {}
          : { region: boundedString(input.region, 160, 'region') }),
        ...(input.altitudeBand === undefined
          ? {}
          : { altitudeBand: optionalString(input.altitudeBand, 120, 'altitudeBand') }),
        ...(input.notes === undefined ? {} : { notes: optionalString(input.notes, 2000, 'notes') }),
        ...(input.isOwnOperation === undefined ? {} : { isOwnOperation: input.isOwnOperation }),
      },
      this.#actor(principal, metadata),
    );
    if (updated === null) throw new NotFoundAppError();
    return updated;
  }

  async upsertApiaryTranslation(
    principal: AuthenticatedPrincipal,
    apiaryId: string,
    translation: ApiaryTranslationRecord,
    metadata: RequestMetadata,
  ): Promise<ApiaryRecord> {
    assertAdmin(principal, 'inventory:adjust');
    const locale = boundedString(translation.locale, 16, 'locale');
    if (locale !== 'fa' && locale !== 'en') throw validation('locale', 'LOCALE_UNSUPPORTED');
    const updated = await this.repository.upsertApiaryTranslation(
      uuid(apiaryId, 'apiaryId'),
      {
        locale,
        name: boundedString(translation.name, 160, 'name'),
        description: optionalString(translation.description, 4000, 'description'),
      },
      this.#actor(principal, metadata),
    );
    if (updated === null) throw new NotFoundAppError();
    return updated;
  }

  async listHarvestBatches(
    principal: AuthenticatedPrincipal,
    input: { cursor?: string; limit?: number; sourcingType?: HarvestBatchRecord['sourcingType'] },
  ): Promise<
    Readonly<{
      data: readonly HarvestBatchRecord[];
      page: { nextCursor: string | null; hasMore: boolean; limit: number };
    }>
  > {
    assertAdmin(principal, 'inventory:read');
    const limit = this.#limit(input.limit);
    const cursor = decodeCursor(input.cursor);
    const result = await this.repository.listHarvestBatches({
      limit,
      ...(cursor === undefined ? {} : { cursor }),
      ...(input.sourcingType === undefined ? {} : { sourcingType: input.sourcingType }),
    });
    return {
      data: result.items,
      page: {
        limit,
        hasMore: result.next !== null,
        nextCursor: result.next === null ? null : encodeCursor(result.next),
      },
    };
  }

  async getHarvestBatch(
    principal: AuthenticatedPrincipal,
    id: string,
  ): Promise<HarvestBatchRecord> {
    assertAdmin(principal, 'inventory:read');
    const batch = await this.repository.getHarvestBatch(uuid(id, 'id'));
    if (batch === null) throw new NotFoundAppError();
    return batch;
  }

  async createHarvestBatch(
    principal: AuthenticatedPrincipal,
    input: HarvestBatchInput,
    metadata: RequestMetadata,
  ): Promise<HarvestBatchRecord> {
    assertAdmin(principal, 'inventory:adjust');
    const normalized = this.#batch(input);
    try {
      return await this.repository.createHarvestBatch(normalized, this.#actor(principal, metadata));
    } catch (error) {
      this.#rethrow(error);
    }
  }

  async updateHarvestBatch(
    principal: AuthenticatedPrincipal,
    id: string,
    input: Partial<HarvestBatchInput>,
    metadata: RequestMetadata,
  ): Promise<HarvestBatchRecord> {
    assertAdmin(principal, 'inventory:adjust');
    const existing = await this.repository.getHarvestBatch(uuid(id, 'id'));
    if (existing === null) throw new NotFoundAppError();
    const merged: HarvestBatchInput = {
      batchCode: existing.batchCode,
      sourcingType: existing.sourcingType,
      apiaryId: existing.apiaryId,
      supplierId: existing.supplierId,
      harvestSeason: input.harvestSeason ?? existing.harvestSeason,
      harvestYear: input.harvestYear ?? existing.harvestYear,
      floralSources: input.floralSources ?? existing.floralSources,
      receivedAt: input.receivedAt === undefined ? existing.receivedAt : input.receivedAt,
      quantityGrams: input.quantityGrams ?? existing.quantityGrams,
      notes: input.notes === undefined ? existing.notes : input.notes,
    };
    this.#batch(merged);
    try {
      const updated = await this.repository.updateHarvestBatch(
        existing.id,
        merged,
        this.#actor(principal, metadata),
      );
      if (updated === null) throw new NotFoundAppError();
      return updated;
    } catch (error) {
      this.#rethrow(error);
    }
  }

  async listAllocations(
    principal: AuthenticatedPrincipal,
    harvestBatchId: string,
  ): Promise<readonly BatchAllocationRecord[]> {
    assertAdmin(principal, 'inventory:read');
    await this.getHarvestBatch(principal, harvestBatchId);
    return this.repository.listAllocations(harvestBatchId);
  }

  async createAllocation(
    principal: AuthenticatedPrincipal,
    input: AllocationInput,
    metadata: RequestMetadata,
  ): Promise<BatchAllocationRecord> {
    assertAdmin(principal, 'inventory:adjust');
    const harvestBatchId = uuid(input.harvestBatchId, 'harvestBatchId');
    const variantId = uuid(input.variantId, 'variantId');
    const quantityUnits = this.#positive(input.quantityUnits, 'quantityUnits');
    const packedAt = boundedString(input.packedAt, 40, 'packedAt');
    if (Number.isNaN(Date.parse(packedAt))) throw validation('packedAt', 'SOURCING_DATE_INVALID');
    const batch = await this.repository.getHarvestBatch(harvestBatchId);
    if (batch === null) throw new NotFoundAppError();
    try {
      return await this.repository.createAllocation(
        {
          harvestBatchId,
          variantId,
          quantityUnits,
          packedAt,
          notes: optionalString(input.notes, 2000, 'notes'),
        },
        this.#actor(principal, metadata),
      );
    } catch (error) {
      this.#rethrow(error);
    }
  }

  async intakeProduction(
    principal: AuthenticatedPrincipal,
    input: Readonly<{
      allocationId: string;
      stockLocationId: string;
      quantity?: number;
      note?: string;
    }>,
    metadata: RequestMetadata,
  ) {
    assertAdmin(principal, 'inventory:adjust');
    if (this.inventory === undefined) {
      throw new ConflictAppError({ code: 'INVENTORY_UNAVAILABLE' });
    }
    const allocation = await this.repository.getAllocation(
      uuid(input.allocationId, 'allocationId'),
    );
    if (allocation === null) throw new NotFoundAppError();
    const batch = await this.repository.getHarvestBatch(allocation.harvestBatchId);
    if (batch === null) throw new NotFoundAppError();
    if (batch.sourcingType !== 'OWN_PRODUCTION') {
      throw new ConflictAppError({ code: 'INVALID_SOURCING_SHAPE' });
    }
    const quantity = input.quantity === undefined ? allocation.quantityUnits : input.quantity;
    return this.inventory.receiveProduction(
      principal,
      {
        harvestBatchId: batch.id,
        allocationId: allocation.id,
        variantId: allocation.variantId,
        stockLocationId: uuid(input.stockLocationId, 'stockLocationId'),
        quantity,
        ...(input.note === undefined ? {} : { note: input.note }),
      },
      metadata,
    );
  }

  #apiary(input: ApiaryInput): ApiaryInput {
    return {
      code: boundedString(input.code, 40, 'code').toUpperCase(),
      name: boundedString(input.name, 160, 'name'),
      region: boundedString(input.region, 160, 'region'),
      altitudeBand: optionalString(input.altitudeBand, 120, 'altitudeBand'),
      notes: optionalString(input.notes, 2000, 'notes'),
      isOwnOperation: input.isOwnOperation,
    };
  }

  #batch(input: HarvestBatchInput): HarvestBatchInput {
    if (!SOURCING_TYPES.includes(input.sourcingType)) {
      throw validation('sourcingType', 'INVALID_SOURCING_SHAPE');
    }
    try {
      assertSourcingShape(input);
    } catch {
      throw new ConflictAppError({ code: 'INVALID_SOURCING_SHAPE' });
    }
    const floralSources = input.floralSources.map((value, index) =>
      boundedString(value, 120, `floralSources.${index}`),
    );
    if (floralSources.length < 1 || floralSources.length > 20) {
      throw validation('floralSources', 'SOURCING_ARRAY_INVALID');
    }
    if (input.harvestYear < 1900 || input.harvestYear > 9999) {
      throw validation('harvestYear', 'SOURCING_YEAR_INVALID');
    }
    return {
      batchCode: boundedString(input.batchCode, 80, 'batchCode'),
      sourcingType: input.sourcingType,
      apiaryId:
        input.apiaryId === undefined || input.apiaryId === null
          ? null
          : uuid(input.apiaryId, 'apiaryId'),
      supplierId:
        input.supplierId === undefined || input.supplierId === null
          ? null
          : uuid(input.supplierId, 'supplierId'),
      harvestSeason: boundedString(input.harvestSeason, 80, 'harvestSeason'),
      harvestYear: input.harvestYear,
      floralSources,
      receivedAt: input.receivedAt ?? null,
      quantityGrams: this.#positive(input.quantityGrams, 'quantityGrams'),
      notes: optionalString(input.notes, 2000, 'notes'),
    };
  }

  #positive(value: number, path: string): number {
    if (!Number.isSafeInteger(value) || value < 1)
      throw validation(path, 'SOURCING_NUMBER_INVALID');
    return value;
  }

  #limit(value: number | undefined): number {
    const limit = value ?? 24;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw validation('limit', 'PAGE_LIMIT_INVALID');
    }
    return limit;
  }

  #actor(principal: AuthenticatedPrincipal, metadata: RequestMetadata): SourcingActorContext {
    return { actorUserId: principal.userId, metadata };
  }

  #rethrow(error: unknown): never {
    if (
      error instanceof ValidationAppError ||
      error instanceof ConflictAppError ||
      error instanceof NotFoundAppError ||
      error instanceof ForbiddenAppError
    ) {
      throw error;
    }
    if (typeof error === 'object' && error !== null && 'code' in error) {
      if (error.code === 'P2002') throw new ConflictAppError({ code: 'SOURCING_CONFLICT' });
      if (error.code === 'P2003') throw new NotFoundAppError();
      if (error.code === 'P2014' || error.code === 'P2004') {
        throw new ConflictAppError({ code: 'INVALID_SOURCING_SHAPE' });
      }
    }
    throw error;
  }
}
