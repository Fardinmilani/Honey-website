import { ForbiddenAppError, ValidationAppError } from '../../../errors/index.js';
import { adminIdentifier, adminPageInput } from '../../../platform/domain/admin-page.js';
import type {
  AdminIdentityRepository,
  AuditQuery,
  CustomerLookup,
} from '../domain/admin-identity.js';
import type {
  AuthenticatedPrincipal,
  PermissionCode,
  RequestMetadata,
} from '../domain/identity.js';
import type { AuditWriterPort } from '../domain/ports.js';

function authorize(principal: AuthenticatedPrincipal, permission: PermissionCode): void {
  if (principal.kind !== 'STAFF' || !principal.permissions.includes(permission))
    throw new ForbiddenAppError();
}
export class AdminIdentityService {
  constructor(
    private readonly repository: AdminIdentityRepository,
    private readonly writer: AuditWriterPort,
  ) {}
  async customers(
    principal: AuthenticatedPrincipal,
    query: CustomerLookup,
    metadata: RequestMetadata,
  ) {
    authorize(principal, 'customer:read');
    const q = query.q.normalize('NFC').trim().toLowerCase();
    if (
      q.length < 3 ||
      q.length > 200 ||
      !(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(q) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(q)
      )
    ) {
      throw new ValidationAppError([{ path: 'q', code: 'CUSTOMER_LOOKUP_INVALID' }]);
    }
    const result = await this.repository.customers({ ...query, ...adminPageInput(query), q });
    await this.writer.appendAudit({
      actorUserId: principal.userId,
      action: 'customer.lookup',
      subjectType: 'User',
      subjectId: principal.userId,
      after: { count: result.items.length },
      metadata,
    });
    return result;
  }
  async audit(principal: AuthenticatedPrincipal, query: AuditQuery) {
    authorize(principal, 'audit:read');
    if (query.actorUserId !== undefined) adminIdentifier(query.actorUserId, 'actorUserId');
    if (query.subjectId !== undefined) adminIdentifier(query.subjectId, 'subjectId');
    for (const [key, value] of [
      ['action', query.action],
      ['subjectType', query.subjectType],
    ]) {
      if (value !== undefined && (value.length > 120 || !/^[A-Za-z][A-Za-z0-9._:-]*$/u.test(value)))
        throw new ValidationAppError([{ path: key ?? 'filter', code: 'AUDIT_FILTER_INVALID' }]);
    }
    for (const [key, value] of [
      ['from', query.from],
      ['to', query.to],
    ]) {
      if (
        value !== undefined &&
        (!/^\d{4}-\d{2}-\d{2}T/u.test(value) || !Number.isFinite(Date.parse(value)))
      )
        throw new ValidationAppError([{ path: key ?? 'date', code: 'AUDIT_DATE_INVALID' }]);
    }
    if (
      query.from !== undefined &&
      query.to !== undefined &&
      Date.parse(query.from) > Date.parse(query.to)
    )
      throw new ValidationAppError([{ path: 'to', code: 'AUDIT_DATE_RANGE_INVALID' }]);
    return this.repository.audit({ ...query, ...adminPageInput(query) });
  }
}
