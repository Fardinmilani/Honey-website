import type { AdminPage, AdminPageInput } from '../../../platform/domain/admin-page.js';
import type { MediaKind, MediaVisibility } from './media.js';
export type AdminMediaQuery = AdminPageInput &
  Readonly<{ kind?: MediaKind; visibility?: MediaVisibility; assetId?: string }>;
export interface AdminMediaRepository {
  list(query: AdminMediaQuery): Promise<AdminPage<Readonly<{ id: string }>>>;
  close(): Promise<void>;
}
