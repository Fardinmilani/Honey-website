import type { TransactionContext } from '../../../platform/domain/transaction.js';
import type {
  SourcingActorContext,
  AllocationInput,
  ApiaryInput,
  ApiaryRecord,
  ApiaryTranslationRecord,
  BatchAllocationRecord,
  HarvestBatchInput,
  HarvestBatchRecord,
} from './sourcing.js';

export type SourcingRepository = {
  runInTransaction<Result>(
    work: (transaction: TransactionContext) => Promise<Result>,
  ): Promise<Result>;
  listApiaries(): Promise<readonly ApiaryRecord[]>;
  getApiary(id: string): Promise<ApiaryRecord | null>;
  createApiary(input: ApiaryInput, actor: SourcingActorContext): Promise<ApiaryRecord>;
  updateApiary(
    id: string,
    input: Partial<ApiaryInput>,
    actor: SourcingActorContext,
  ): Promise<ApiaryRecord | null>;
  upsertApiaryTranslation(
    apiaryId: string,
    translation: ApiaryTranslationRecord,
    actor: SourcingActorContext,
  ): Promise<ApiaryRecord | null>;
  listHarvestBatches(input: {
    cursor?: { createdAt: string; id: string };
    limit: number;
    sourcingType?: HarvestBatchRecord['sourcingType'];
  }): Promise<
    Readonly<{
      items: readonly HarvestBatchRecord[];
      next: { createdAt: string; id: string } | null;
    }>
  >;
  getHarvestBatch(id: string): Promise<HarvestBatchRecord | null>;
  getHarvestBatchByCode(batchCode: string): Promise<HarvestBatchRecord | null>;
  createHarvestBatch(
    input: HarvestBatchInput,
    actor: SourcingActorContext,
  ): Promise<HarvestBatchRecord>;
  updateHarvestBatch(
    id: string,
    input: Partial<HarvestBatchInput>,
    actor: SourcingActorContext,
  ): Promise<HarvestBatchRecord | null>;
  listAllocations(harvestBatchId: string): Promise<readonly BatchAllocationRecord[]>;
  getAllocation(id: string): Promise<BatchAllocationRecord | null>;
  createAllocation(
    input: AllocationInput,
    actor: SourcingActorContext,
  ): Promise<BatchAllocationRecord>;
  apiaryExists(id: string): Promise<boolean>;
  close(): Promise<void>;
};
