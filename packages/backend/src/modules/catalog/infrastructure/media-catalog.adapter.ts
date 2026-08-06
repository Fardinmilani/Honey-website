import type { MediaService } from '../../media/index.js';
import type { CatalogMediaPort } from '../domain/catalog-media.port.js';

export class MediaCatalogAdapter implements CatalogMediaPort {
  constructor(private readonly media: MediaService) {}

  resolvePublicAssets(assetIds: readonly string[]) {
    return this.media.resolvePublicCatalogAssets(assetIds);
  }
}
