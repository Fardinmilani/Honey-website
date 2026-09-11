import type { PricingService } from '../../pricing/index.js';
import type { CatalogCurrentPrice, CatalogPricingPort } from '../domain/catalog-pricing.port.js';

/** Adapts pricing's bigint domain values to the catalog's JSON-safe read model. */
export class PricingCatalogAdapter implements CatalogPricingPort {
  constructor(private readonly pricing: PricingService) {}

  async resolveCurrentPrices(
    variantIds: readonly string[],
    currency: string,
    now: Date,
  ): Promise<ReadonlyMap<string, CatalogCurrentPrice>> {
    const prices = await this.pricing.resolvePrices(variantIds, currency, now);
    return new Map(
      [...prices].map(([variantId, price]) => [
        variantId,
        { amountMinor: price.amountMinor.toString(), currency: price.currency },
      ]),
    );
  }
}
