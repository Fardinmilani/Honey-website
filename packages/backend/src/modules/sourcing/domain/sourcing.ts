import type { RequestMetadata } from '../../identity/index.js';

export const SOURCING_TYPES = ['OWN_PRODUCTION', 'SELECTED_SUPPLIER'] as const;
export type SourcingType = (typeof SOURCING_TYPES)[number];

export type SourcingActorContext = Readonly<{
  actorUserId: string;
  metadata: RequestMetadata;
}>;

export type ApiaryTranslationRecord = Readonly<{
  locale: string;
  name: string;
  description: string | null;
}>;

export type ApiaryRecord = Readonly<{
  id: string;
  code: string;
  name: string;
  region: string;
  altitudeBand: string | null;
  notes: string | null;
  isOwnOperation: boolean;
  translations: readonly ApiaryTranslationRecord[];
  createdAt: string;
  updatedAt: string;
}>;

export type HarvestBatchRecord = Readonly<{
  id: string;
  batchCode: string;
  sourcingType: SourcingType;
  apiaryId: string | null;
  supplierId: string | null;
  harvestSeason: string;
  harvestYear: number;
  floralSources: readonly string[];
  receivedAt: string | null;
  quantityGrams: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type BatchAllocationRecord = Readonly<{
  id: string;
  harvestBatchId: string;
  variantId: string;
  quantityUnits: number;
  packedAt: string;
  notes: string | null;
  createdAt: string;
}>;

export type ApiaryInput = Readonly<{
  code: string;
  name: string;
  region: string;
  altitudeBand?: string | null;
  notes?: string | null;
  isOwnOperation: boolean;
}>;

export type HarvestBatchInput = Readonly<{
  batchCode: string;
  sourcingType: SourcingType;
  apiaryId?: string | null;
  supplierId?: string | null;
  harvestSeason: string;
  harvestYear: number;
  floralSources: readonly string[];
  receivedAt?: string | null;
  quantityGrams: number;
  notes?: string | null;
}>;

export type AllocationInput = Readonly<{
  harvestBatchId: string;
  variantId: string;
  quantityUnits: number;
  packedAt: string;
  notes?: string | null;
}>;

export function assertSourcingShape(input: HarvestBatchInput): void {
  if (input.sourcingType === 'OWN_PRODUCTION') {
    if (input.apiaryId === null || input.apiaryId === undefined || input.supplierId) {
      throw new Error('INVALID_SOURCING_SHAPE');
    }
    return;
  }
  if (input.supplierId === null || input.supplierId === undefined) {
    throw new Error('INVALID_SOURCING_SHAPE');
  }
}
