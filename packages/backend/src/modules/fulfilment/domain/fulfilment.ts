import type { TransactionContext } from '../../../platform/domain/transaction.js';

export type ShipmentStatus =
  'PENDING' | 'LABEL_CREATED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'RETURNED';

export type ShipmentRecord = Readonly<{
  id: string;
  orderId: string;
  provider: string;
  status: ShipmentStatus;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  lines: readonly Readonly<{ orderLineId: string; quantity: number }>[];
}>;

export type ShipmentSourceAllocation = Readonly<{
  orderLineId: string;
  stockReservationId: string;
  variantId: string;
  stockLocationId: string;
  quantity: number;
}>;

export type ShipmentForDispatch = ShipmentRecord &
  Readonly<{ allocations: readonly ShipmentSourceAllocation[] }>;

export type ClaimedShipmentQuantity = Readonly<{
  orderLineId: string;
  stockReservationId: string;
  quantity: number;
}>;

export type DraftShipmentLine = Readonly<{
  id: string;
  orderLineId: string;
  quantity: number;
  allocations: readonly Readonly<{
    id: string;
    stockReservationId: string;
    quantity: number;
  }>[];
}>;

export type CreateDraftShipment = Readonly<{
  id: string;
  orderId: string;
  provider: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  idempotencyKey: string;
  requestHash: string;
  actorUserId: string;
  lines: readonly DraftShipmentLine[];
}>;

export type FulfilmentNotification = Readonly<{
  shipmentId: string;
  orderNumber: string;
  email: string;
  locale: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
}>;

export interface FulfilmentNotificationPort {
  sendShipped(notification: FulfilmentNotification): Promise<void>;
  sendDelivered(notification: FulfilmentNotification): Promise<void>;
  close?(): Promise<void>;
}

export interface FulfilmentRepository {
  findByIdempotency(
    orderId: string,
    key: string,
    transaction: TransactionContext,
  ): Promise<Readonly<{ shipment: ShipmentRecord; requestHash: string }> | null>;
  listClaimedQuantities(
    orderId: string,
    transaction: TransactionContext,
  ): Promise<readonly ClaimedShipmentQuantity[]>;
  createDraft(input: CreateDraftShipment, transaction: TransactionContext): Promise<ShipmentRecord>;
  findById(id: string): Promise<ShipmentRecord | null>;
  findForDispatch(id: string, transaction: TransactionContext): Promise<ShipmentForDispatch | null>;
  listByOrder(
    orderId: string,
    transaction?: TransactionContext,
  ): Promise<readonly ShipmentRecord[]>;
  markShipped(
    shipmentId: string,
    actorUserId: string,
    transaction: TransactionContext,
  ): Promise<ShipmentRecord>;
  markDelivered(
    shipmentId: string,
    actorUserId: string,
    transaction: TransactionContext,
  ): Promise<ShipmentRecord>;
  close(): Promise<void>;
}
