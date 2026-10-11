import { ForbiddenAppError, ValidationAppError } from '../../../errors/index.js';
import { adminIdentifier, adminPageInput } from '../../../platform/domain/admin-page.js';
import type { AuthenticatedPrincipal } from '../../identity/index.js';
import type {
  AdminCatalogQuery,
  AdminCatalogRepository,
  AdminTaxonomyQuery,
} from '../domain/admin-catalog.js';
function authorize(principal: AuthenticatedPrincipal) {
  if (principal.kind !== 'STAFF' || !principal.permissions.includes('catalog:read'))
    throw new ForbiddenAppError();
}
export class AdminCatalogService {
  constructor(private readonly repository: AdminCatalogRepository) {}
  products(principal: AuthenticatedPrincipal, query: AdminCatalogQuery) {
    authorize(principal);
    if (query.q !== undefined && (query.q.trim().length < 2 || query.q.length > 120))
      throw new ValidationAppError([{ path: 'q', code: 'CATALOG_SEARCH_INVALID' }]);
    return this.repository.products({ ...query, ...adminPageInput(query) });
  }
  categories(principal: AuthenticatedPrincipal, query: AdminTaxonomyQuery) {
    authorize(principal);
    if (query.id !== undefined) adminIdentifier(query.id);
    return this.repository.categories({ ...query, ...adminPageInput(query) });
  }
  collections(principal: AuthenticatedPrincipal, query: AdminTaxonomyQuery) {
    authorize(principal);
    if (query.id !== undefined) adminIdentifier(query.id);
    return this.repository.collections({ ...query, ...adminPageInput(query) });
  }
}
