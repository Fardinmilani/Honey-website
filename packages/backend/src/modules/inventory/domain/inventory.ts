import type { RequestMetadata } from '../../identity/index.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';

export const AVAILABILITY_BANDS = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;
export type AvailabilityBand = (typeof AVAILABILITY_BANDS)[number];

export const STOCK_LOCATION_TYPES = ['WAREHOUSE', 'STUDIO', 'EXTERNAL'] as const;
export type StockLocationType = (typeof STOCK_LOCATION_TYPES)[number];

export const PHASE11_LEDGER_REASONS = ['RECEIPT', 'ADJUSTMENT', 'WRITE_OFF', 'CORRECTION'] as const;
export type Phase11LedgerReason = (typeof PHASE11_LEDGER_REASONS)[number];

export const ADJUSTMENT_REASONS = ['ADJUSTMENT', 'WRITE_OFF', 'CORRECTION'] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export type InventoryActorContext = Readonly<{
  actorUserId: string;
  metadata: RequestMetadata;
}>;

export type StockLocationRecord = Readonly<{
  id: string;
  code: string;
  name: string;
  type: StockLocationType;
  isSellable: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type InventoryItemRecord = Readonly<{
  id: string;
  variantId: string;
  stockLocationId: string;
  onHand: number;
  reserved: number;
  allocated: number;
  incoming: number;
  reorderPoint: number;
  safetyStock: number;
  lowStockAlertActive: boolean;
  version: number;
  isSellable: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type StockLedgerRecord = Readonly<{
  id: string;
  variantId: string;
  stockLocationId: string;
  delta: number;
  reason: string;
  refType: string;
  refId: string;
  note: string | null;
  actorUserId: string | null;
  createdAt: string;
}>;

export type InventoryKey = Readonly<{
  variantId: string;
  stockLocationId: string;
}>;

export type StockMovement = Readonly<{
  variantId: string;
  stockLocationId: string;
  deltaOnHand: number;
  deltaIncoming: number;
  reason: Phase11LedgerReason;
  refType: string;
  refId: string;
  note: string | null;
}>;

export type AvailabilitySnapshot = Readonly<{
  variantId: string;
  availableToSell: number;
  reorderThreshold: number;
  band: AvailabilityBand;
}>;

export type LocationInput = Readonly<{
  code: string;
  name: string;
  type: StockLocationType;
  isSellable: boolean;
  isDefault: boolean;
}>;

export type AdjustmentInput = Readonly<{
  variantId: string;
  stockLocationId: string;
  delta: number;
  reason: AdjustmentReason;
  note: string;
  expectedVersion?: number;
}>;

export type ProductionIntakeInput = Readonly<{
  harvestBatchId: string;
  allocationId: string;
  variantId: string;
  stockLocationId: string;
  quantity: number;
  note?: string;
}>;

export type ReconciliationDrift = Readonly<{
  variantId: string;
  stockLocationId: string;
  field: 'onHand' | 'incoming';
  expected: number;
  actual: number;
}>;

export type ReconciliationReport = Readonly<{
  drifted: boolean;
  drifts: readonly ReconciliationDrift[];
  repaired: boolean;
}>;

export type PlanningInput = Readonly<{
  reorderPoint?: number;
  safetyStock?: number;
}>;

export interface IncomingProjectionPort {
  incomingByKey(): Promise<readonly (InventoryKey & Readonly<{ incoming: number }>)[]>;
}

export class IncomingProjectionBinder implements IncomingProjectionPort {
  #delegate: IncomingProjectionPort | undefined;

  bind(delegate: IncomingProjectionPort): void {
    this.#delegate = delegate;
  }

  incomingByKey(): Promise<readonly (InventoryKey & Readonly<{ incoming: number }>)[]> {
    return this.#delegate?.incomingByKey() ?? Promise.resolve([]);
  }
}

export function availableUnits(
  item: Readonly<{ onHand: number; reserved: number; allocated: number }>,
): number {
  return item.onHand - item.reserved - item.allocated;
}

export function availabilityBand(
  availableToSell: number,
  reorderThreshold: number,
): AvailabilityBand {
  const available = Math.max(0, availableToSell);
  if (available <= 0) return 'OUT_OF_STOCK';
  if (reorderThreshold > 0 && available <= reorderThreshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export function compareInventoryKeys(left: InventoryKey, right: InventoryKey): number {
  const variant = left.variantId.localeCompare(right.variantId);
  return variant === 0 ? left.stockLocationId.localeCompare(right.stockLocationId) : variant;
}

export type InventoryRepository = {
  runInTransaction<Result>(
    work: (transaction: TransactionContext) => Promise<Result>,
  ): Promise<Result>;
  listLocations(): Promise<readonly StockLocationRecord[]>;
  getLocation(id: string): Promise<StockLocationRecord | null>;
  getLocationByCode(code: string): Promise<StockLocationRecord | null>;
  createLocation(input: LocationInput, actor: InventoryActorContext): Promise<StockLocationRecord>;
  updateLocation(
    id: string,
    input: Partial<LocationInput>,
    actor: InventoryActorContext,
  ): Promise<StockLocationRecord | null>;
  listItems(input: {
    cursor?: { updatedAt: string; id: string };
    limit: number;
    variantId?: string;
    stockLocationId?: string;
  }): Promise<
    Readonly<{
      items: readonly InventoryItemRecord[];
      next: { updatedAt: string; id: string } | null;
    }>
  >;
  getItem(variantId: string, stockLocationId: string): Promise<InventoryItemRecord | null>;
  getItemsForVariants(
    variantIds: readonly string[],
    transaction?: TransactionContext,
  ): Promise<readonly InventoryItemRecord[]>;
  listAllItems(): Promise<readonly InventoryItemRecord[]>;
  listLedger(input: {
    variantId: string;
    cursor?: { createdAt: string; id: string };
    limit: number;
  }): Promise<
    Readonly<{
      items: readonly StockLedgerRecord[];
      next: { createdAt: string; id: string } | null;
    }>
  >;
  ensureAndLockItems(
    transaction: TransactionContext,
    keys: readonly InventoryKey[],
    actorUserId: string,
  ): Promise<readonly InventoryItemRecord[]>;
  applyMovements(
    transaction: TransactionContext,
    movements: readonly StockMovement[],
    actor: InventoryActorContext,
  ): Promise<readonly InventoryItemRecord[]>;
  setPlanning(
    variantId: string,
    stockLocationId: string,
    input: PlanningInput,
    actor: InventoryActorContext,
  ): Promise<InventoryItemRecord | null>;
  setLowStockAlert(
    transaction: TransactionContext,
    keys: readonly InventoryKey[],
    active: boolean,
  ): Promise<void>;
  variantExists(variantId: string): Promise<boolean>;
  locationExists(stockLocationId: string): Promise<boolean>;
  ledgerOnHandByKey(): Promise<readonly (InventoryKey & Readonly<{ onHand: number }>)[]>;
  repairCurrentState(
    transaction: TransactionContext,
    repairs: readonly (InventoryKey & Readonly<{ onHand?: number; incoming?: number }>)[],
    actor: InventoryActorContext,
  ): Promise<void>;
  appendAudit(
    transaction: TransactionContext,
    actor: InventoryActorContext,
    action: string,
    subjectType: string,
    subjectId: string,
    before?: Readonly<Record<string, boolean | number | string | null>>,
    after?: Readonly<Record<string, boolean | number | string | null>>,
  ): Promise<void>;
  appendOutbox(
    transaction: TransactionContext,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Readonly<Record<string, string | number | boolean | null>>,
  ): Promise<void>;
  close(): Promise<void>;
};
