import type { TransactionContext } from '../../../platform/domain/transaction.js';

export const MANUAL_FLAT_PROVIDER_CODE = 'manual-flat';

export type ShippingDestination = Readonly<{
  country: string;
  province: string;
}>;

export type ShippingQuoteRequest = Readonly<{
  destination: ShippingDestination;
  currency: string;
  locale: string;
  merchandiseSubtotalMinor: bigint;
  weightGrams: number;
  now: Date;
}>;

export type ShippingMethodQuote = Readonly<{
  methodCode: string;
  methodName: string;
  providerCode: string;
  zoneId: string;
  rateId: string;
  amountMinor: bigint;
  currency: string;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
}>;

export type ShippingZoneRecord = Readonly<{
  id: string;
  countries: readonly string[];
  provinces: readonly string[];
  priority: number;
}>;

export type ShippingRateRecord = Readonly<{
  id: string;
  currency: string;
  baseMinor: bigint;
  perKgMinor: bigint;
  freeOverSubtotalMinor: bigint | null;
  minWeightGrams: number;
  maxWeightGrams: number | null;
  validFrom: Date;
  validTo: Date | null;
}>;

export type ShippingMethodRecord = Readonly<{
  code: string;
  zoneId: string;
  providerCode: string;
  isActive: boolean;
  sortOrder: number;
  translations: readonly Readonly<{ locale: string; name: string }>[];
  rates: readonly ShippingRateRecord[];
}>;

export type ShippingConfiguration = Readonly<{
  zones: readonly ShippingZoneRecord[];
  methods: readonly ShippingMethodRecord[];
}>;

export interface ShippingConfigurationRepository {
  loadConfiguration(transaction: TransactionContext): Promise<ShippingConfiguration>;
  close(): Promise<void>;
}

export type ShipmentCreationInput = Readonly<{
  shipmentId: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
}>;

export type ShipmentCreationResult = Readonly<{
  providerCode: string;
  providerShipmentRef: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
}>;

export type ShippingTrackingEvent = Readonly<{
  status: string;
  occurredAt: Date;
  description: string | null;
}>;

/** No provider SDK or database type crosses this boundary. */
export interface ShippingProvider {
  readonly code: string;
  readonly capabilities: Readonly<{
    quote: boolean;
    createShipment: boolean;
    cancelShipment: boolean;
    tracking: boolean;
    labels: boolean;
    webhooks: boolean;
  }>;
  quote(
    input: ShippingQuoteRequest,
    configuration: ShippingConfiguration,
  ): Promise<readonly ShippingMethodQuote[]>;
  createShipment(input: ShipmentCreationInput): Promise<ShipmentCreationResult>;
  track(events: readonly ShippingTrackingEvent[]): Promise<readonly ShippingTrackingEvent[]>;
}
