import { createPrismaClient, type Prisma } from '@honey/db';
import { adminPage, adminPageInput } from '../../../platform/domain/admin-page.js';
import type {
  AdminIdentityRepository,
  AuditQuery,
  CustomerLookup,
} from '../domain/admin-identity.js';

export class PrismaAdminIdentityRepository implements AdminIdentityRepository {
  readonly #client;
  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }
  async customers(query: CustomerLookup) {
    const page = adminPageInput(query);
    const isId = /^[0-9a-f-]{36}$/u.test(query.q);
    const rows = await this.#client.user.findMany({
      where: {
        isStaff: false,
        ...(isId ? { id: query.q } : { email: query.q }),
        ...(page.cursor === undefined ? {} : { AND: { id: { lt: page.cursor } } }),
      },
      orderBy: { id: 'desc' },
      take: page.limit + 1,
      select: {
        id: true,
        email: true,
        displayName: true,
        preferredLocale: true,
        status: true,
        emailVerifiedAt: true,
        phone: true,
        createdAt: true,
      },
    });
    return adminPage(
      rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        preferredLocale: row.preferredLocale,
        status: row.status,
        emailVerified: row.emailVerifiedAt !== null,
        phoneMasked: row.phone === null ? null : `••••${row.phone.slice(-4)}`,
        createdAt: row.createdAt.toISOString(),
      })),
      page.limit,
    );
  }
  async audit(query: AuditQuery) {
    const page = adminPageInput(query);
    const where: Prisma.AuditLogWhereInput = {
      ...(page.cursor === undefined ? {} : { id: { lt: page.cursor } }),
      ...(query.actorUserId === undefined ? {} : { actorUserId: query.actorUserId }),
      ...(query.action === undefined ? {} : { action: query.action }),
      ...(query.subjectType === undefined ? {} : { subjectType: query.subjectType }),
      ...(query.subjectId === undefined ? {} : { subjectId: query.subjectId }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            createdAt: {
              ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
              ...(query.to === undefined ? {} : { lte: new Date(query.to) }),
            },
          }),
    };
    const rows = await this.#client.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: page.limit + 1,
      select: {
        id: true,
        actorUserId: true,
        action: true,
        subjectType: true,
        subjectId: true,
        requestId: true,
        createdAt: true,
      },
    });
    return adminPage(
      rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      page.limit,
    );
  }
  close() {
    return this.#client.$disconnect();
  }
}
