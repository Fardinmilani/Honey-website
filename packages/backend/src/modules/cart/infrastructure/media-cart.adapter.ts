import type { MediaService } from '../../media/index.js';
import type { CartMediaPort, CartPublicImage } from '../domain/cart-media.port.js';

const MAX_MEDIA_BATCH_SIZE = 100;

/**
 * Keeps cart presentation on the media module's public interface: private
 * assets, storage keys, and derivatives never cross into cart.
 */
export class MediaCartAdapter implements CartMediaPort {
  constructor(private readonly media: MediaService) {}

  async resolvePublicImages(assetIds: readonly string[]): Promise<readonly CartPublicImage[]> {
    const uniqueIds = [...new Set(assetIds)];
    const images: CartPublicImage[] = [];
    for (let start = 0; start < uniqueIds.length; start += MAX_MEDIA_BATCH_SIZE) {
      const batch = uniqueIds.slice(start, start + MAX_MEDIA_BATCH_SIZE);
      if (batch.length === 0) continue;
      const assets = await this.media.resolvePublicCatalogAssets(batch);
      for (const asset of assets) {
        if (asset.kind === 'IMAGE') images.push({ id: asset.id, url: asset.url });
      }
    }
    return images;
  }
}
