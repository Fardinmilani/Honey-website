import { createPrismaClient, type PrismaClient } from '@honey/db';

import type { TransactionContext } from '../../../platform/domain/transaction.js';
import { asPrismaTransaction } from '../../../platform/infrastructure/prisma-platform.adapter.js';
import type { ShippingConfiguration, ShippingConfigurationRepository } from '../domain/shipping.js';

/** Reads only shipping-owned tables, within the caller's checkout transaction. */
export class PrismaShippingConfigurationRepository implements ShippingConfigurationRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  async loadConfiguration(transaction: TransactionContext): Promise<ShippingConfiguration> {
    const client = asPrismaTransaction(transaction);
    const [zones, methods] = await Promise.all([
      client.shippingZone.findMany({
        select: { id: true, countries: true, provinces: true, priority: true },
      }),
      client.shippingMethod.findMany({
        select: {
          code: true,
          zoneId: true,
          provider: true,
          isActive: true,
          sortOrder: true,
          translations: { select: { locale: true, name: true } },
          rates: {
            select: {
              id: true,
              currency: true,
              baseMinor: true,
              perKgMinor: true,
              freeOverSubtotalMinor: true,
              minWeightGrams: true,
              maxWeightGrams: true,
              validFrom: true,
              validTo: true,
            },
          },
        },
      }),
    ]);
    return {
      zones: zones.map((zone) => ({
        id: zone.id,
        countries: zone.countries,
        provinces: zone.provinces,
        priority: zone.priority,
      })),
      methods: methods.map((method) => ({
        code: method.code,
        zoneId: method.zoneId,
        providerCode: method.provider,
        isActive: method.isActive,
        sortOrder: method.sortOrder,
        translations: method.translations,
        rates: method.rates,
      })),
    };
  }

  close(): Promise<void> {
    return this.#client.$disconnect();
  }
}
