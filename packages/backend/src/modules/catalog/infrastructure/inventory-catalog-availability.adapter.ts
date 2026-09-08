import type { InventoryService } from '../../inventory/index.js';
import type {
  CatalogAvailabilityBand,
  CatalogAvailabilityPort,
} from '../domain/catalog-availability.port.js';

export class InventoryCatalogAvailabilityAdapter implements CatalogAvailabilityPort {
  constructor(private readonly inventory: InventoryService) {}

  async bandsForVariants(
    variantIds: readonly string[],
  ): Promise<ReadonlyMap<string, CatalogAvailabilityBand>> {
    return this.inventory.publicBands(variantIds);
  }
}
