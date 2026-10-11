import { ForbiddenAppError } from '../../../errors/index.js';
import { adminIdentifier, adminPageInput } from '../../../platform/domain/admin-page.js';
import type { AuthenticatedPrincipal } from '../../identity/index.js';
import type { AdminMediaQuery, AdminMediaRepository } from '../domain/admin-media.js';
import type { MediaService } from './media.service.js';
export class AdminMediaService {
  constructor(
    private readonly repository: AdminMediaRepository,
    private readonly media: MediaService,
  ) {}
  async list(principal: AuthenticatedPrincipal, query: AdminMediaQuery) {
    if (principal.kind !== 'STAFF' || !principal.permissions.includes('content:write'))
      throw new ForbiddenAppError();
    if (query.assetId !== undefined) adminIdentifier(query.assetId, 'assetId');
    const page = await this.repository.list({ ...query, ...adminPageInput(query) });
    const items = await Promise.all(
      page.items.map((row) => this.media.getAsset(principal, row.id)),
    );
    return { items, nextCursor: page.nextCursor };
  }
}
