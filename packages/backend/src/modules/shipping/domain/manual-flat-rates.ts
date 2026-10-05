import { ConflictAppError, DependencyUnavailableAppError } from '../../../errors/index.js';
import { assertNonNegativeMinor, normalizeCurrency } from '../../pricing/index.js';
import type {
  ShippingConfiguration,
  ShippingDestination,
  ShippingMethodQuote,
  ShippingQuoteRequest,
  ShippingRateRecord,
  ShippingZoneRecord,
} from './shipping.js';
import { MANUAL_FLAT_PROVIDER_CODE } from './shipping.js';

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function unavailable(): DependencyUnavailableAppError {
  return new DependencyUnavailableAppError({
    code: 'CHECKOUT_SHIPPING_CONFIGURATION_UNAVAILABLE',
    retryable: false,
  });
}

function normalized(value: string): string {
  return value.normalize('NFC').trim().toLocaleUpperCase('en-US');
}

function zoneSpecificity(zone: ShippingZoneRecord, destination: ShippingDestination): number {
  const country = normalized(destination.country);
  const province = normalized(destination.province);
  const countries = zone.countries.map(normalized);
  const provinces = zone.provinces.map(normalized);
  if (countries.length > 0 && !countries.includes(country)) return -1;
  if (provinces.length > 0 && !provinces.includes(province)) return -1;
  return (countries.length > 0 ? 1 : 0) + (provinces.length > 0 ? 2 : 0);
}

export function resolveShippingZone(
  zones: readonly ShippingZoneRecord[],
  destination: ShippingDestination,
): ShippingZoneRecord {
  const candidates = zones
    .map((zone) => ({ zone, specificity: zoneSpecificity(zone, destination) }))
    .filter((candidate) => candidate.specificity >= 0)
    .sort((left, right) =>
      left.specificity !== right.specificity
        ? right.specificity - left.specificity
        : right.zone.priority - left.zone.priority,
    );
  const first = candidates[0];
  if (first === undefined) throw new ConflictAppError({ code: 'SHIPPING_NOT_AVAILABLE' });
  const second = candidates[1];
  if (
    second !== undefined &&
    second.specificity === first.specificity &&
    second.zone.priority === first.zone.priority
  ) {
    throw unavailable();
  }
  return first.zone;
}

function selectRate(
  rates: readonly ShippingRateRecord[],
  currency: string,
  weightGrams: number,
  now: Date,
): ShippingRateRecord {
  const matches = rates.filter(
    (rate) =>
      normalizeCurrency(rate.currency) === currency &&
      rate.minWeightGrams <= weightGrams &&
      (rate.maxWeightGrams === null || weightGrams <= rate.maxWeightGrams) &&
      rate.validFrom.getTime() <= now.getTime() &&
      (rate.validTo === null || now.getTime() < rate.validTo.getTime()),
  );
  if (matches.length !== 1) throw unavailable();
  const rate = matches[0];
  if (rate === undefined) throw unavailable();
  return rate;
}

function rateAmount(rate: ShippingRateRecord, input: ShippingQuoteRequest): bigint {
  const base = assertNonNegativeMinor(rate.baseMinor, 'shipping base');
  const perKg = assertNonNegativeMinor(rate.perKgMinor, 'shipping per kilogram');
  const threshold =
    rate.freeOverSubtotalMinor === null
      ? null
      : assertNonNegativeMinor(rate.freeOverSubtotalMinor, 'shipping threshold');
  if (threshold !== null && input.merchandiseSubtotalMinor >= threshold) return 0n;
  const kilogramsRoundedUp = (BigInt(input.weightGrams) + 999n) / 1_000n;
  const amount = base + perKg * kilogramsRoundedUp;
  if (amount > MAX_POSTGRES_BIGINT) throw unavailable();
  return amount;
}

/** Returns only active, configured, server-defined methods for one destination. */
export function calculateManualFlatQuotes(
  input: ShippingQuoteRequest,
  configuration: ShippingConfiguration,
): readonly ShippingMethodQuote[] {
  if (
    !Number.isSafeInteger(input.weightGrams) ||
    input.weightGrams < 0 ||
    !Number.isFinite(input.now.getTime())
  ) {
    throw unavailable();
  }
  assertNonNegativeMinor(input.merchandiseSubtotalMinor, 'merchandise subtotal');
  const currency = normalizeCurrency(input.currency);
  const zone = resolveShippingZone(configuration.zones, input.destination);
  const methods = configuration.methods
    .filter(
      (method) =>
        method.zoneId === zone.id &&
        method.isActive &&
        method.providerCode === MANUAL_FLAT_PROVIDER_CODE,
    )
    .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code));
  if (methods.length === 0) throw new ConflictAppError({ code: 'SHIPPING_NOT_AVAILABLE' });
  return methods.map((method) => {
    const rate = selectRate(method.rates, currency, input.weightGrams, input.now);
    const translation = method.translations.find((entry) => entry.locale === input.locale);
    if (translation === undefined || translation.name.trim() === '') throw unavailable();
    return {
      methodCode: method.code,
      methodName: translation.name,
      providerCode: method.providerCode,
      zoneId: zone.id,
      rateId: rate.id,
      amountMinor: rateAmount(rate, input),
      currency,
      estimatedDaysMin: 0,
      estimatedDaysMax: 0,
    };
  });
}
