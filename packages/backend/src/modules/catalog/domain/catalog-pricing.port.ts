/**
 * Catalog's read-only view of pricing. The catalog never stores a price
 * snapshot: a current price is resolved immediately before a public response
 * is returned.
 */
export type CatalogCurrentPrice = Readonly<{
  amountMinor: string;
  currency: string;
}>;

export interface CatalogPricingPort {
  resolveCurrentPrices(
    variantIds: readonly string[],
    currency: string,
    now: Date,
  ): Promise<ReadonlyMap<string, CatalogCurrentPrice>>;
}
