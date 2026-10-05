import { ValidationAppError } from '../../../errors/index.js';
import { normalizeCurrency } from '../../pricing/index.js';
import type {
  ShippingSettingsActor,
  ShippingSettingsRepository,
  ShippingSettingsSnapshot,
  UpsertShippingMethodInput,
  UpsertShippingRateInput,
  UpsertShippingZoneInput,
  ValidatedShippingRate,
} from '../domain/shipping-settings.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MINOR = /^(?:0|[1-9][0-9]*)$/u;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function invalid(path: string): ValidationAppError {
  return new ValidationAppError([{ path, code: 'SHIPPING_CONFIGURATION_INVALID' }]);
}

function uuid(value: string, path: string): string {
  if (!UUID.test(value)) throw invalid(path);
  return value;
}

function text(value: string, path: string, max: number): string {
  const result = value.normalize('NFC').trim();
  if (
    result.length === 0 ||
    Array.from(result).length > max ||
    /[\u0000-\u001F\u007F-\u009F]/u.test(result)
  ) {
    throw invalid(path);
  }
  return result;
}

function integer(value: number, path: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw invalid(path);
  return value;
}

function money(value: string, path: string): bigint {
  if (!MINOR.test(value)) throw invalid(path);
  const result = BigInt(value);
  if (result > MAX_POSTGRES_BIGINT) throw invalid(path);
  return result;
}

function date(value: string, path: string): Date {
  const result = new Date(value);
  if (!Number.isFinite(result.getTime()) || result.toISOString() !== value) throw invalid(path);
  return result;
}

function actor(input: ShippingSettingsActor): ShippingSettingsActor {
  return {
    actorUserId: uuid(input.actorUserId, 'actorUserId'),
    requestId: text(input.requestId, 'requestId', 255),
    clientIp: input.clientIp,
  };
}

/** Staff settings API business validation; writes and audit are atomic in the repository. */
export class ShippingSettingsService {
  constructor(private readonly repository: ShippingSettingsRepository) {}

  list(): Promise<ShippingSettingsSnapshot> {
    return this.repository.list();
  }

  async upsertZone(
    input: UpsertShippingZoneInput,
    by: ShippingSettingsActor,
  ): Promise<{ id: string }> {
    const countries = input.countries.map((value, index) => {
      const country = text(value, `countries.${index}`, 2).toUpperCase();
      if (!/^[A-Z]{2}$/u.test(country)) throw invalid(`countries.${index}`);
      return country;
    });
    const provinces = input.provinces.map((value, index) => text(value, `provinces.${index}`, 120));
    if (
      new Set(countries).size !== countries.length ||
      new Set(provinces).size !== provinces.length
    ) {
      throw invalid('zone');
    }
    return this.repository.upsertZone(
      {
        id: uuid(input.id, 'id'),
        name: text(input.name, 'name', 120),
        countries: [...countries].sort(),
        provinces: [...provinces].sort(),
        priority: integer(input.priority, 'priority', -10_000, 10_000),
      },
      actor(by),
    );
  }

  async upsertMethod(
    input: UpsertShippingMethodInput,
    by: ShippingSettingsActor,
  ): Promise<{ id: string }> {
    const code = text(input.code, 'code', 64).toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*$/u.test(code)) throw invalid('code');
    if (typeof input.isActive !== 'boolean') throw invalid('isActive');
    if (
      input.translations.length !== 2 ||
      new Set(input.translations.map((entry) => entry.locale)).size !== 2 ||
      !input.translations.some((entry) => entry.locale === 'en') ||
      !input.translations.some((entry) => entry.locale === 'fa')
    ) {
      throw invalid('translations');
    }
    return this.repository.upsertMethod(
      {
        id: uuid(input.id, 'id'),
        code,
        zoneId: uuid(input.zoneId, 'zoneId'),
        isActive: input.isActive,
        sortOrder: integer(input.sortOrder, 'sortOrder', 0, 10_000),
        translations: input.translations.map((entry) => ({
          locale: entry.locale,
          name: text(entry.name, `translations.${entry.locale}.name`, 160),
          description:
            entry.description === null
              ? null
              : text(entry.description, `translations.${entry.locale}.description`, 500),
        })),
      },
      actor(by),
    );
  }

  async upsertRate(
    input: UpsertShippingRateInput,
    by: ShippingSettingsActor,
  ): Promise<{ id: string }> {
    let currency: string;
    try {
      currency = normalizeCurrency(input.currency);
    } catch {
      throw invalid('currency');
    }
    const validFrom = date(input.validFrom, 'validFrom');
    const validTo = input.validTo === null ? null : date(input.validTo, 'validTo');
    if (validTo !== null && validTo.getTime() <= validFrom.getTime()) throw invalid('validTo');
    const minWeightGrams = integer(input.minWeightGrams, 'minWeightGrams', 0, 2_147_483_647);
    const maxWeightGrams =
      input.maxWeightGrams === null
        ? null
        : integer(input.maxWeightGrams, 'maxWeightGrams', minWeightGrams, 2_147_483_647);
    const validated: ValidatedShippingRate = {
      id: uuid(input.id, 'id'),
      methodId: uuid(input.methodId, 'methodId'),
      currency,
      baseMinor: money(input.baseMinor, 'baseMinor'),
      perKgMinor: money(input.perKgMinor, 'perKgMinor'),
      freeOverSubtotalMinor:
        input.freeOverSubtotalMinor === null
          ? null
          : money(input.freeOverSubtotalMinor, 'freeOverSubtotalMinor'),
      minWeightGrams,
      maxWeightGrams,
      validFrom,
      validTo,
    };
    return this.repository.upsertRate(validated, actor(by));
  }

  close(): Promise<void> {
    return this.repository.close();
  }
}
