import type { RequestMetadata } from '../../identity/index.js';

export const SUPPLIER_STATUSES = ['ACTIVE', 'PAUSED', 'BLOCKED'] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export const PURCHASE_ORDER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export type ProcurementActorContext = Readonly<{
  actorUserId: string;
  metadata: RequestMetadata;
}>;

export type SupplierRecord = Readonly<{
  id: string;
  code: string;
  legalName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: SupplierStatus;
  qualityRating: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type PurchaseOrderLineRecord = Readonly<{
  id: string;
  purchaseOrderId: string;
  description: string;
  variantId: string | null;
  harvestBatchId: string | null;
  quantityOrdered: number;
  unitCostMinor: string;
  taxMinor: string;
  lineTotalMinor: string;
  quantityReceivedAccepted: number;
  quantityReceivedRejected: number;
}>;

export type PurchaseOrderRecord = Readonly<{
  id: string;
  number: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  currency: string;
  expectedAt: string | null;
  placedBy: string | null;
  placedAt: string | null;
  notes: string | null;
  destinationStockLocationId: string | null;
  freightCostMinor: string;
  dutyCostMinor: string;
  otherCostMinor: string;
  lines: readonly PurchaseOrderLineRecord[];
  createdAt: string;
  updatedAt: string;
}>;

export type LandedCostLine = Readonly<{
  purchaseOrderLineId: string;
  lineTotalMinor: string;
  allocatedExtraMinor: string;
  landedLineMinor: string;
  landedUnitMinor: string;
}>;

export type LandedCostView = Readonly<{
  purchaseOrderId: string;
  currency: string;
  merchandiseTotalMinor: string;
  extrasMinor: string;
  landedTotalMinor: string;
  lines: readonly LandedCostLine[];
}>;

export type GoodsReceiptLineInput = Readonly<{
  purchaseOrderLineId: string;
  quantityAccepted: number;
  quantityRejected: number;
  rejectionReason?: string | null;
  harvestBatchId: string;
}>;

export type GoodsReceiptRecord = Readonly<{
  id: string;
  purchaseOrderId: string;
  receivedAt: string;
  receivedBy: string | null;
  stockLocationId: string;
  notes: string | null;
  lines: readonly Readonly<{
    id: string;
    purchaseOrderLineId: string;
    quantityAccepted: number;
    quantityRejected: number;
    rejectionReason: string | null;
    harvestBatchId: string;
  }>[];
  createdAt: string;
}>;

export const CLIENT_PO_TRANSITIONS: Readonly<
  Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]>
> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['DRAFT', 'CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
  PARTIALLY_RECEIVED: [],
  RECEIVED: [],
  CANCELLED: [],
};

export function deriveLineTotal(
  unitCostMinor: bigint,
  quantityOrdered: number,
  taxMinor: bigint,
): bigint {
  return unitCostMinor * BigInt(quantityOrdered) + taxMinor;
}

export function allocateLandedCost(
  extrasMinor: bigint,
  lines: readonly Readonly<{ id: string; lineTotalMinor: bigint; quantityOrdered: number }>[],
): readonly LandedCostLine[] {
  const ordered = [...lines].sort((left, right) => left.id.localeCompare(right.id));
  const merchandise = ordered.reduce((sum, line) => sum + line.lineTotalMinor, 0n);
  if (ordered.length === 0) return [];
  if (extrasMinor === 0n || merchandise === 0n) {
    return ordered.map((line, index) => {
      const remainder =
        extrasMinor !== 0n && merchandise === 0n && index === ordered.length - 1 ? extrasMinor : 0n;
      const allocated = remainder;
      const landedLine = line.lineTotalMinor + allocated;
      return {
        purchaseOrderLineId: line.id,
        lineTotalMinor: line.lineTotalMinor.toString(),
        allocatedExtraMinor: allocated.toString(),
        landedLineMinor: landedLine.toString(),
        landedUnitMinor: (landedLine / BigInt(line.quantityOrdered)).toString(),
      };
    });
  }
  let allocatedSum = 0n;
  return ordered.map((line, index) => {
    const isLast = index === ordered.length - 1;
    const share = isLast
      ? extrasMinor - allocatedSum
      : (extrasMinor * line.lineTotalMinor) / merchandise;
    if (!isLast) allocatedSum += share;
    const landedLine = line.lineTotalMinor + share;
    return {
      purchaseOrderLineId: line.id,
      lineTotalMinor: line.lineTotalMinor.toString(),
      allocatedExtraMinor: share.toString(),
      landedLineMinor: landedLine.toString(),
      landedUnitMinor: (landedLine / BigInt(line.quantityOrdered)).toString(),
    };
  });
}

export function receiptCompletesLine(
  quantityOrdered: number,
  accepted: number,
  rejected: number,
): boolean {
  return accepted + rejected >= quantityOrdered;
}
