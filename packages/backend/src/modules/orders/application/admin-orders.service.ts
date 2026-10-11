import { ForbiddenAppError, NotFoundAppError, ValidationAppError } from '../../../errors/index.js';
import {
  adminIdentifier,
  adminPageInput,
  type AdminPageInput,
} from '../../../platform/domain/admin-page.js';
import type { TransactionRunner } from '../../../platform/domain/transaction.js';
import type {
  AuditWriterPort,
  AuthenticatedPrincipal,
  PermissionCode,
  RequestMetadata,
} from '../../identity/index.js';
import type { AdminOrderQuery, AdminOrdersRepository } from '../domain/admin-orders.js';

function authorize(principal: AuthenticatedPrincipal, permission: PermissionCode): void {
  if (principal.kind !== 'STAFF' || !principal.permissions.includes(permission))
    throw new ForbiddenAppError();
}

export class AdminOrdersService {
  constructor(
    private readonly repository: AdminOrdersRepository,
    private readonly audit: AuditWriterPort,
    private readonly transactions: TransactionRunner,
  ) {}

  list(principal: AuthenticatedPrincipal, query: AdminOrderQuery) {
    authorize(principal, 'order:read');
    const page = adminPageInput(query);
    if (query.customerId !== undefined) adminIdentifier(query.customerId, 'customerId');
    if (query.q !== undefined && (query.q.trim().length < 3 || query.q.length > 200)) {
      throw new ValidationAppError([{ path: 'q', code: 'ORDER_SEARCH_INVALID' }]);
    }
    return this.repository.list({ ...query, ...page });
  }

  async detail(principal: AuthenticatedPrincipal, id: string) {
    authorize(principal, 'order:read');
    const result = await this.repository.detail(adminIdentifier(id));
    if (result === null) throw new NotFoundAppError();
    return result;
  }

  async notes(principal: AuthenticatedPrincipal, id: string, query: AdminPageInput) {
    authorize(principal, 'order:read');
    await this.detail(principal, id);
    return this.repository.notes(adminIdentifier(id), adminPageInput(query));
  }

  async addNote(
    principal: AuthenticatedPrincipal,
    id: string,
    input: string,
    metadata: RequestMetadata,
  ) {
    authorize(principal, 'order:note');
    const orderId = adminIdentifier(id);
    const body = input.normalize('NFC').trim();
    if (
      body.length < 1 ||
      body.length > 2000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(body)
    ) {
      throw new ValidationAppError([{ path: 'body', code: 'ORDER_NOTE_INVALID' }]);
    }
    return this.transactions.run(async (transaction) => {
      const note = await this.repository.addNote(orderId, body, principal.userId, transaction);
      if (note === null) throw new NotFoundAppError();
      await this.audit.appendAudit(
        {
          actorUserId: principal.userId,
          action: 'order.note_added',
          subjectType: 'Order',
          subjectId: orderId,
          after: { noteId: note.id },
          metadata,
        },
        transaction,
      );
      return note;
    });
  }
}
