export type CatalogAvailabilityBand = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface CatalogAvailabilityPort {
  bandsForVariants(
    variantIds: readonly string[],
  ): Promise<ReadonlyMap<string, CatalogAvailabilityBand>>;
}
