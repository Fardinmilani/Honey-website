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

export const RESERVATION_STATUSES = ['ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const RESERVATION_LEDGER_REASONS = [
  'RESERVATION',
  'RESERVATION_RELEASE',
  'ALLOCATION',
] as const;
export type ReservationLedgerReason = (typeof RESERVATION_LEDGER_REASONS)[number];

export type InventoryActorContext = Readonly<{
  /** A guest/system inventory transition has no User row to attribute. */
  actorUserId: string | null;
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
  isDefault: boolean;
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

export type ReservationLine = Readonly<{
  variantId: string;
  quantity: number;
}>;

export type ReservationAllocation = Readonly<{
  reservationId: string;
  variantId: string;
  stockLocationId: string;
  quantity: number;
  expiresAt: Date;
}>;

export type StockReservationRecord = Readonly<{
  id: string;
  variantId: string;
  stockLocationId: string;
  quantity: number;
  cartId: string | null;
  checkoutSessionId: string | null;
  orderId: string | null;
  status: ReservationStatus;
  expiresAt: Date;
  createdAt: Date;
  consumedAt: Date | null;
  releasedAt: Date | null;
  releaseReason: string | null;
}>;

export type ReservationAccountingChange = Readonly<{
  variantId: string;
  stockLocationId: string;
  deltaReserved: number;
  deltaAllocated: number;
  ledgerDelta: number;
  reason: ReservationLedgerReason;
  refType: string;
  refId: string;
  note: string | null;
}>;

export type AllocatedStockMovement = Readonly<{
  variantId: string;
  stockLocationId: string;
  quantity: number;
  reason: 'FULFILMENT' | 'ALLOCATION_RELEASE';
  refType: 'shipment' | 'order';
  refId: string;
}>;

export type InventoryLedgerState = Readonly<{
  onHand: number;
  reserved: number;
  allocated: number;
}>;

export type ReservationAcquireInput = Readonly<{
  checkoutSessionId: string;
  cartId?: string | null;
  lines: readonly ReservationLine[];
  actor: InventoryActorContext;
  now?: Date;
}>;

export type ReservationAcquireResult = Readonly<{
  allocations: readonly ReservationAllocation[];
  expiresAt: Date;
  replayed: boolean;
}>;

export type ReservationReleaseInput = Readonly<{
  checkoutSessionId: string;
  reason: string;
  actor: InventoryActorContext;
  now?: Date;
}>;

export type ReservationReleaseResult = Readonly<{
  released: number;
  alreadyFinal: number;
}>;

export type ReservationExtensionInput = Readonly<{
  checkoutSessionId: string;
  actor: InventoryActorContext;
  now?: Date;
}>;

export type ReservationExtensionResult = Readonly<{
  expiresAt: Date | null;
  extended: boolean;
}>;

export type ReservationAssertionInput = Readonly<{
  checkoutSessionId: string;
  lines: readonly ReservationLine[];
  actor: InventoryActorContext;
  now?: Date;
}>;

export type ReservationAssertionResult = Readonly<{
  allocations: readonly ReservationAllocation[];
  expiresAt: Date;
}>;

export type ReservationConsumptionInput = Readonly<{
  checkoutSessionId: string;
  orderId: string;
  actor: InventoryActorContext;
  now?: Date;
}>;

export type ReservationConsumptionResult = Readonly<{
  allocations: readonly ReservationAllocation[];
  replayed: boolean;
}>;

export type ReservationExpiryInput = Readonly<{
  batchSize?: number;
  actor: InventoryActorContext;
  now?: Date;
}>;

export type ReservationExpiryResult = Readonly<{
  expired: number;
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
  field: 'onHand' | 'incoming' | 'reserved' | 'allocated';
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

/**
 * Stock ledger events use a reason-aware counter reducer. Reservation events
 * are availability workflow events, not physical movements of stock.
 */
export function reduceInventoryLedgerState(
  current: InventoryLedgerState,
  entry: Readonly<{ reason: string; delta: number }>,
): InventoryLedgerState {
  if (entry.reason === 'RESERVATION' || entry.reason === 'RESERVATION_RELEASE') {
    return { ...current, reserved: current.reserved + entry.delta };
  }
  if (entry.reason === 'ALLOCATION') {
    return {
      ...current,
      reserved: current.reserved - entry.delta,
      allocated: current.allocated + entry.delta,
    };
  }
  if (entry.reason === 'FULFILMENT') {
    return {
      ...current,
      onHand: current.onHand + entry.delta,
      allocated: current.allocated + entry.delta,
    };
  }
  if (entry.reason === 'ALLOCATION_RELEASE') {
    return { ...current, allocated: current.allocated + entry.delta };
  }
  return { ...current, onHand: current.onHand + entry.delta };
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
    actorUserId: string | null,
  ): Promise<readonly InventoryItemRecord[]>;
  lockItems(
    transaction: TransactionContext,
    keys: readonly InventoryKey[],
  ): Promise<readonly InventoryItemRecord[]>;
  lockSellableItemsForVariants(
    transaction: TransactionContext,
    variantIds: readonly string[],
  ): Promise<readonly InventoryItemRecord[]>;
  applyMovements(
    transaction: TransactionContext,
    movements: readonly StockMovement[],
    actor: InventoryActorContext,
  ): Promise<readonly InventoryItemRecord[]>;
  applyAllocatedMovements(
    transaction: TransactionContext,
    movements: readonly AllocatedStockMovement[],
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
  ledgerStateByKey(): Promise<readonly (InventoryKey & InventoryLedgerState)[]>;
  repairCurrentState(
    transaction: TransactionContext,
    repairs: readonly (InventoryKey &
      Readonly<{
        onHand?: number;
        incoming?: number;
        reserved?: number;
        allocated?: number;
      }>)[],
    actor: InventoryActorContext,
  ): Promise<void>;
  listReservationsForCheckout(
    transaction: TransactionContext,
    checkoutSessionId: string,
  ): Promise<readonly StockReservationRecord[]>;
  listConsumedReservationsForOrder(
    transaction: TransactionContext,
    orderId: string,
  ): Promise<readonly StockReservationRecord[]>;
  lockReservationsForCheckout(
    transaction: TransactionContext,
    checkoutSessionId: string,
  ): Promise<readonly StockReservationRecord[]>;
  lockReservationCheckout(
    transaction: TransactionContext,
    checkoutSessionId: string,
  ): Promise<void>;
  listExpiredReservationIds(
    now: Date,
    batchSize: number,
    variantIds?: readonly string[],
  ): Promise<readonly string[]>;
  lockReservationsByIds(
    transaction: TransactionContext,
    reservationIds: readonly string[],
  ): Promise<readonly StockReservationRecord[]>;
  listReservationsByIds(
    transaction: TransactionContext,
    reservationIds: readonly string[],
  ): Promise<readonly StockReservationRecord[]>;
  createReservations(
    transaction: TransactionContext,
    reservations: readonly Readonly<{
      id: string;
      variantId: string;
      stockLocationId: string;
      quantity: number;
      cartId: string | null;
      checkoutSessionId: string;
      expiresAt: Date;
      createdAt: Date;
    }>[],
    actor: InventoryActorContext,
  ): Promise<readonly StockReservationRecord[]>;
  markReservationsReleased(
    transaction: TransactionContext,
    reservations: readonly Readonly<{
      id: string;
      status: 'RELEASED' | 'EXPIRED';
      releasedAt: Date;
      releaseReason: string;
    }>[],
    actor: InventoryActorContext,
  ): Promise<void>;
  markReservationsConsumed(
    transaction: TransactionContext,
    reservations: readonly Readonly<{
      id: string;
      orderId: string;
      consumedAt: Date;
    }>[],
    actor: InventoryActorContext,
  ): Promise<void>;
  extendReservations(
    transaction: TransactionContext,
    reservations: readonly Readonly<{ id: string; expiresAt: Date }>[],
    actor: InventoryActorContext,
  ): Promise<void>;
  applyReservationAccounting(
    transaction: TransactionContext,
    changes: readonly ReservationAccountingChange[],
    actor: InventoryActorContext,
  ): Promise<readonly InventoryItemRecord[]>;
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
