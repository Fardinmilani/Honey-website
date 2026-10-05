export type ShippingSettingsActor = Readonly<{
  actorUserId: string;
  requestId: string;
  clientIp: string | null;
}>;

export type UpsertShippingZoneInput = Readonly<{
  id: string;
  name: string;
  countries: readonly string[];
  provinces: readonly string[];
  priority: number;
}>;

export type UpsertShippingMethodInput = Readonly<{
  id: string;
  code: string;
  zoneId: string;
  isActive: boolean;
  sortOrder: number;
  translations: readonly Readonly<{
    locale: 'en' | 'fa';
    name: string;
    description: string | null;
  }>[];
}>;

export type UpsertShippingRateInput = Readonly<{
  id: string;
  methodId: string;
  currency: string;
  baseMinor: string;
  perKgMinor: string;
  freeOverSubtotalMinor: string | null;
  minWeightGrams: number;
  maxWeightGrams: number | null;
  validFrom: string;
  validTo: string | null;
}>;

export type ValidatedShippingRate = Omit<
  UpsertShippingRateInput,
  'baseMinor' | 'perKgMinor' | 'freeOverSubtotalMinor' | 'validFrom' | 'validTo'
> &
  Readonly<{
    baseMinor: bigint;
    perKgMinor: bigint;
    freeOverSubtotalMinor: bigint | null;
    validFrom: Date;
    validTo: Date | null;
  }>;

export type ShippingSettingsSnapshot = Readonly<{
  zones: readonly Readonly<{
    id: string;
    name: string;
    countries: readonly string[];
    provinces: readonly string[];
    priority: number;
    methods: readonly Readonly<{
      id: string;
      code: string;
      provider: string;
      isActive: boolean;
      sortOrder: number;
      translations: readonly Readonly<{
        locale: string;
        name: string;
        description: string | null;
      }>[];
      rates: readonly Readonly<{
        id: string;
        currency: string;
        baseMinor: string;
        perKgMinor: string;
        freeOverSubtotalMinor: string | null;
        minWeightGrams: number;
        maxWeightGrams: number | null;
        validFrom: string;
        validTo: string | null;
      }>[];
    }>[];
  }>[];
}>;

export interface ShippingSettingsRepository {
  list(): Promise<ShippingSettingsSnapshot>;
  upsertZone(input: UpsertShippingZoneInput, actor: ShippingSettingsActor): Promise<{ id: string }>;
  upsertMethod(
    input: UpsertShippingMethodInput,
    actor: ShippingSettingsActor,
  ): Promise<{ id: string }>;
  upsertRate(input: ValidatedShippingRate, actor: ShippingSettingsActor): Promise<{ id: string }>;
  close(): Promise<void>;
}
