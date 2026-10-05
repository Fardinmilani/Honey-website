import { describe, expect, it } from 'vitest';

import type {
  ShippingSettingsActor,
  ShippingSettingsRepository,
  ShippingSettingsSnapshot,
  UpsertShippingMethodInput,
  UpsertShippingZoneInput,
  ValidatedShippingRate,
} from '../domain/shipping-settings.js';
import { ShippingSettingsService } from './shipping-settings.service.js';

const ID = '018f0000-0000-7000-8000-000000000001';
const ACTOR: ShippingSettingsActor = {
  actorUserId: ID,
  requestId: 'request-1',
  clientIp: null,
};

class MemorySettings implements ShippingSettingsRepository {
  zone: UpsertShippingZoneInput | null = null;
  method: UpsertShippingMethodInput | null = null;
  rate: ValidatedShippingRate | null = null;
  async list(): Promise<ShippingSettingsSnapshot> {
    return { zones: [] };
  }
  async upsertZone(input: UpsertShippingZoneInput): Promise<{ id: string }> {
    this.zone = input;
    return { id: input.id };
  }
  async upsertMethod(input: UpsertShippingMethodInput): Promise<{ id: string }> {
    this.method = input;
    return { id: input.id };
  }
  async upsertRate(input: ValidatedShippingRate): Promise<{ id: string }> {
    this.rate = input;
    return { id: input.id };
  }
  async close(): Promise<void> {}
}

describe('staff shipping settings validation', () => {
  it('normalizes country and rate money as authoritative integers', async () => {
    const repository = new MemorySettings();
    const service = new ShippingSettingsService(repository);
    await service.upsertZone(
      { id: ID, name: 'Iran', countries: ['ir'], provinces: [], priority: 0 },
      ACTOR,
    );
    expect(repository.zone?.countries).toEqual(['IR']);
    await service.upsertRate(
      {
        id: ID,
        methodId: ID,
        currency: 'IRR',
        baseMinor: '10000',
        perKgMinor: '2000',
        freeOverSubtotalMinor: '100000',
        minWeightGrams: 0,
        maxWeightGrams: null,
        validFrom: '2026-10-04T12:00:00.000Z',
        validTo: null,
      },
      ACTOR,
    );
    expect(repository.rate?.baseMinor).toBe(10_000n);
    expect(repository.rate?.freeOverSubtotalMinor).toBe(100_000n);
  });

  it('requires both store locales for an active method', async () => {
    const repository = new MemorySettings();
    const service = new ShippingSettingsService(repository);
    await expect(
      service.upsertMethod(
        {
          id: ID,
          code: 'STANDARD',
          zoneId: ID,
          isActive: true,
          sortOrder: 0,
          translations: [{ locale: 'en', name: 'Standard', description: null }],
        },
        ACTOR,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'translations', code: 'SHIPPING_CONFIGURATION_INVALID' }],
    });
    expect(repository.method).toBeNull();
  });

  it('rejects malformed or unsafe rate windows before persistence', async () => {
    const repository = new MemorySettings();
    const service = new ShippingSettingsService(repository);
    await expect(
      service.upsertRate(
        {
          id: ID,
          methodId: ID,
          currency: 'IRR',
          baseMinor: '-1',
          perKgMinor: '0',
          freeOverSubtotalMinor: null,
          minWeightGrams: 0,
          maxWeightGrams: null,
          validFrom: '2026-10-04T12:00:00.000Z',
          validTo: null,
        },
        ACTOR,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'baseMinor', code: 'SHIPPING_CONFIGURATION_INVALID' }],
    });
    expect(repository.rate).toBeNull();
  });
});
