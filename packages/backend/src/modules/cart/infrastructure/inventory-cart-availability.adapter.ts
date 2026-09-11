import type { InventoryService } from '../../inventory/index.js';
import type { CartAvailability, CartAvailabilityPort } from '../domain/cart.js';

export class InventoryCartAvailabilityAdapter implements CartAvailabilityPort {
  constructor(private readonly inventory: InventoryService) {}

  async availabilityForVariants(
    variantIds: readonly string[],
  ): Promise<readonly CartAvailability[]> {
    const snapshots = await this.inventory.availabilityForVariants(variantIds);
    return snapshots.map((snapshot) => ({
      variantId: snapshot.variantId,
      availableToSell: snapshot.availableToSell,
      band: snapshot.band,
    }));
  }
}
