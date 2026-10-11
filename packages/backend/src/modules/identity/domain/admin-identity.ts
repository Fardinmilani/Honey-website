import type { AdminPage, AdminPageInput } from '../../../platform/domain/admin-page.js';

export type CustomerLookup = AdminPageInput & Readonly<{ q: string }>;
export type AdminCustomer = Readonly<{
  id: string;
  email: string;
  displayName: string | null;
  preferredLocale: string;
  status: string;
  emailVerified: boolean;
  phoneMasked: string | null;
  createdAt: string;
}>;
export type AuditQuery = AdminPageInput &
  Readonly<{
    actorUserId?: string;
    action?: string;
    subjectType?: string;
    subjectId?: string;
    from?: string;
    to?: string;
  }>;
export type AdminAuditEntry = Readonly<{
  id: string;
  actorUserId: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  requestId: string | null;
  createdAt: string;
}>;
export interface AdminIdentityRepository {
  customers(query: CustomerLookup): Promise<AdminPage<AdminCustomer>>;
  audit(query: AuditQuery): Promise<AdminPage<AdminAuditEntry>>;
  close(): Promise<void>;
}
