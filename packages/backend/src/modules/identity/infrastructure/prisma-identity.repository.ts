import { createPrismaClient, uuidV7 } from '@honey/db';
import type { Prisma, PrismaClient, TransactionClient } from '@honey/db';

import {
  PERMISSION_CODES,
  ROLE_CODES,
  type AuthenticationUser,
  type EncryptedValue,
  type PermissionCode,
  type PersistedSession,
  type RoleCode,
  type SafeUser,
  type SessionSummary,
} from '../domain/identity.js';
import type {
  AuditInput,
  IdentityRepositoryPort,
  IdentityTransactionPort,
} from '../domain/ports.js';

const userSelection = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  displayName: true,
  preferredLocale: true,
  status: true,
  isStaff: true,
  userRoles: {
    include: {
      role: {
        include: { rolePermissions: { include: { permission: true } } },
      },
    },
  },
} satisfies Prisma.UserSelect;

type SelectedUser = Prisma.UserGetPayload<{ select: typeof userSelection }>;

function isRoleCode(value: string): value is RoleCode {
  return ROLE_CODES.some((code) => code === value);
}

function isPermissionCode(value: string): value is PermissionCode {
  return PERMISSION_CODES.some((code) => code === value);
}

function safeUser(user: SelectedUser): SafeUser {
  const roles = user.userRoles
    .map(({ role }) => role.code)
    .filter(isRoleCode)
    .sort();
  const permissions = [
    ...new Set(
      user.userRoles.flatMap(({ role }) =>
        role.rolePermissions.map(({ permission }) => permission.code).filter(isPermissionCode),
      ),
    ),
  ].sort();
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    displayName: user.displayName,
    preferredLocale: user.preferredLocale,
    status: user.status,
    isStaff: user.isStaff,
    roles,
    permissions,
  };
}

function encryptedValue(
  ciphertext: Uint8Array | null,
  nonce: Uint8Array | null,
  tag: Uint8Array | null,
): EncryptedValue | null {
  return ciphertext === null || nonce === null || tag === null ? null : { ciphertext, nonce, tag };
}

function prismaBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(value);
}

function auditData(
  input: AuditInput,
  subjectIdOverride?: string,
): Prisma.AuditLogUncheckedCreateInput {
  return {
    id: uuidV7(),
    actorUserId: input.actorUserId,
    action: input.action,
    subjectType: input.subjectType,
    subjectId: subjectIdOverride ?? input.subjectId,
    ip: input.metadata.clientIp ?? null,
    requestId: input.metadata.requestId,
    ...(input.before === undefined ? {} : { beforeJson: input.before }),
    ...(input.after === undefined ? {} : { afterJson: input.after }),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}

class PrismaIdentityTransaction implements IdentityTransactionPort {
  constructor(private readonly client: TransactionClient) {}

  async createCustomer(
    input: Parameters<IdentityTransactionPort['createCustomer']>[0],
  ): Promise<boolean> {
    const role = await this.client.role.findUnique({ where: { code: input.customerRoleCode } });
    if (role === null) throw new Error('Deterministic CUSTOMER role is missing.');
    try {
      await this.client.user.create({
        data: {
          id: input.id,
          email: input.email,
          displayName: input.displayName,
          preferredLocale: input.preferredLocale,
          isStaff: false,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
    await this.client.authCredential.create({
      data: {
        id: input.passwordCredentialId,
        userId: input.id,
        type: 'PASSWORD',
        secretHash: input.passwordHash,
      },
    });
    await this.client.userRole.create({
      data: { id: input.userRoleId, userId: input.id, roleId: role.id },
    });
    await this.client.verificationToken.create({
      data: {
        id: input.verificationTokenId,
        userId: input.id,
        purpose: 'EMAIL',
        tokenHash: input.verificationTokenHash,
        expiresAt: input.verificationExpiresAt,
      },
    });
    await this.client.auditLog.create({ data: auditData(input.audit, input.id) });
    return true;
  }

  async confirmEmailVerification(
    tokenHash: string,
    now: Date,
    audit: AuditInput,
  ): Promise<boolean> {
    const token = await this.client.verificationToken.findFirst({
      where: {
        tokenHash,
        purpose: 'EMAIL',
        consumedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true, userId: true },
    });
    if (token === null) return false;
    const consumed = await this.client.verificationToken.updateMany({
      where: { id: token.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return false;
    await this.client.user.update({
      where: { id: token.userId },
      data: { emailVerifiedAt: now },
    });
    await this.client.auditLog.create({ data: auditData(audit, token.userId) });
    return true;
  }

  async completePasswordReset(
    input: Parameters<IdentityTransactionPort['completePasswordReset']>[0],
  ): Promise<boolean> {
    const token = await this.client.verificationToken.findFirst({
      where: {
        tokenHash: input.tokenHash,
        purpose: 'PASSWORD_RESET',
        consumedAt: null,
        expiresAt: { gt: input.now },
      },
      select: { id: true, userId: true },
    });
    if (token === null) return false;
    const consumed = await this.client.verificationToken.updateMany({
      where: { id: token.id, consumedAt: null },
      data: { consumedAt: input.now },
    });
    if (consumed.count !== 1) return false;
    const credential = await this.client.authCredential.findFirst({
      where: { userId: token.userId, type: 'PASSWORD' },
      select: { id: true },
    });
    if (credential === null) return false;
    await this.client.authCredential.update({
      where: { id: credential.id },
      data: { secretHash: input.passwordHash, lastUsedAt: input.now },
    });
    await this.client.verificationToken.updateMany({
      where: {
        userId: token.userId,
        purpose: 'PASSWORD_RESET',
        consumedAt: null,
      },
      data: { consumedAt: input.now },
    });
    await this.client.session.updateMany({
      where: { userId: token.userId, revokedAt: null },
      data: { revokedAt: input.now },
    });
    await this.client.auditLog.create({ data: auditData(input.audit, token.userId) });
    return true;
  }

  async createSession(
    input: Parameters<IdentityTransactionPort['createSession']>[0],
  ): Promise<void> {
    await this.client.session.create({
      data: {
        id: input.id,
        userId: input.userId,
        kind: input.kind,
        tokenHash: input.tokenHash,
        ip: input.ip,
        userAgentHash: input.userAgentHash,
        createdAt: input.now,
        lastSeenAt: input.now,
        expiresAt: input.expiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
      },
    });
    await this.client.user.update({
      where: { id: input.userId },
      data: { lastLoginAt: input.now },
    });
    await this.client.auditLog.create({ data: auditData(input.audit) });
  }

  async saveTotpCredential(
    input: Parameters<IdentityTransactionPort['saveTotpCredential']>[0],
  ): Promise<void> {
    const existing = await this.client.authCredential.findFirst({
      where: { userId: input.userId, type: 'TOTP' },
      select: { id: true },
    });
    const data = {
      secretHash: null,
      encryptedSecret: prismaBytes(input.encryptedSecret.ciphertext),
      secretNonce: prismaBytes(input.encryptedSecret.nonce),
      secretTag: prismaBytes(input.encryptedSecret.tag),
      lastAcceptedStep: input.acceptedStep,
      lastUsedAt: input.now,
    };
    if (existing === null) {
      await this.client.authCredential.create({
        data: { id: input.id, userId: input.userId, type: 'TOTP', ...data },
      });
    } else {
      await this.client.authCredential.update({ where: { id: existing.id }, data });
    }
    await this.client.session.updateMany({
      where: { userId: input.userId, revokedAt: null },
      data: { revokedAt: input.now },
    });
    await this.client.auditLog.create({ data: auditData(input.audit, input.userId) });
  }

  async acceptTotpStep(credentialId: string, step: bigint, now: Date): Promise<boolean> {
    const result = await this.client.authCredential.updateMany({
      where: {
        id: credentialId,
        OR: [{ lastAcceptedStep: null }, { lastAcceptedStep: { lt: step } }],
      },
      data: { lastAcceptedStep: step, lastUsedAt: now },
    });
    return result.count === 1;
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    now: Date,
    audit: AuditInput,
  ): Promise<boolean> {
    const result = await this.client.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: now },
    });
    if (result.count === 1) {
      await this.client.auditLog.create({ data: auditData(audit, sessionId) });
    }
    return result.count === 1;
  }

  async revokeAllSessions(userId: string, now: Date, audit: AuditInput): Promise<number> {
    const result = await this.client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await this.client.auditLog.create({
      data: auditData({ ...audit, after: { revokedSessions: result.count } }, userId),
    });
    return result.count;
  }
}

export class PrismaIdentityRepository implements IdentityRepositoryPort {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  transaction<Result>(
    work: (transaction: IdentityTransactionPort) => Promise<Result>,
  ): Promise<Result> {
    return this.#client.$transaction((client) => work(new PrismaIdentityTransaction(client)));
  }

  async findAuthenticationUser(email: string): Promise<AuthenticationUser | null> {
    const user = await this.#client.user.findUnique({
      where: { email },
      select: {
        ...userSelection,
        credentials: {
          select: {
            id: true,
            type: true,
            secretHash: true,
            encryptedSecret: true,
            secretNonce: true,
            secretTag: true,
            lastAcceptedStep: true,
          },
        },
      },
    });
    return this.#authenticationUser(user);
  }

  async findAuthenticationUserById(userId: string): Promise<AuthenticationUser | null> {
    const user = await this.#client.user.findUnique({
      where: { id: userId },
      select: {
        ...userSelection,
        credentials: {
          select: {
            id: true,
            type: true,
            secretHash: true,
            encryptedSecret: true,
            secretNonce: true,
            secretTag: true,
            lastAcceptedStep: true,
          },
        },
      },
    });
    return this.#authenticationUser(user);
  }

  #authenticationUser(
    user:
      | (SelectedUser &
          Readonly<{
            credentials: readonly Readonly<{
              id: string;
              type: 'PASSWORD' | 'TOTP' | 'RECOVERY_CODE';
              secretHash: string | null;
              encryptedSecret: Uint8Array | null;
              secretNonce: Uint8Array | null;
              secretTag: Uint8Array | null;
              lastAcceptedStep: bigint | null;
            }>[];
          }>)
      | null,
  ): AuthenticationUser | null {
    if (user === null) return null;
    const password = user.credentials.find((credential) => credential.type === 'PASSWORD');
    const totp = user.credentials.find((credential) => credential.type === 'TOTP');
    const encrypted =
      totp === undefined
        ? null
        : encryptedValue(totp.encryptedSecret, totp.secretNonce, totp.secretTag);
    return {
      ...safeUser(user),
      passwordCredential:
        password?.secretHash === null || password?.secretHash === undefined
          ? null
          : { id: password.id, secretHash: password.secretHash },
      totpCredential:
        totp === undefined || encrypted === null
          ? null
          : { id: totp.id, encryptedSecret: encrypted, lastAcceptedStep: totp.lastAcceptedStep },
    };
  }

  async findUserByEmail(email: string): Promise<SafeUser | null> {
    const user = await this.#client.user.findUnique({ where: { email }, select: userSelection });
    return user === null ? null : safeUser(user);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<PersistedSession | null> {
    const session = await this.#client.session.findUnique({
      where: { tokenHash },
      include: { user: { select: userSelection } },
    });
    return session === null
      ? null
      : {
          id: session.id,
          user: safeUser(session.user),
          kind: session.kind,
          createdAt: session.createdAt,
          lastSeenAt: session.lastSeenAt,
          expiresAt: session.expiresAt,
          absoluteExpiresAt: session.absoluteExpiresAt,
          revokedAt: session.revokedAt,
        };
  }

  async touchSession(sessionId: string, lastSeenAt: Date, expiresAt: Date): Promise<void> {
    await this.#client.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { lastSeenAt, expiresAt },
    });
  }

  async listSessions(
    userId: string,
    now: Date,
    currentSessionId: string,
  ): Promise<readonly SessionSummary[]> {
    const sessions = await this.#client.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((session) => ({
      id: session.id,
      kind: session.kind,
      current: session.id === currentSessionId,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      ip: session.ip,
      userAgentHash: session.userAgentHash,
    }));
  }

  requestVerificationToken(
    input: Parameters<IdentityRepositoryPort['requestVerificationToken']>[0],
  ): Promise<SafeUser | null> {
    return this.#requestToken(input, 'EMAIL');
  }

  requestPasswordResetToken(
    input: Parameters<IdentityRepositoryPort['requestPasswordResetToken']>[0],
  ): Promise<SafeUser | null> {
    return this.#requestToken(input, 'PASSWORD_RESET');
  }

  async #requestToken(
    input: Parameters<IdentityRepositoryPort['requestVerificationToken']>[0],
    purpose: 'EMAIL' | 'PASSWORD_RESET',
  ): Promise<SafeUser | null> {
    return this.#client.$transaction(async (client) => {
      const user = await client.user.findUnique({
        where: { email: input.email },
        select: userSelection,
      });
      if (user === null || user.status !== 'ACTIVE') return null;
      if (purpose === 'EMAIL' && user.emailVerifiedAt !== null) return null;
      await client.verificationToken.updateMany({
        where: { userId: user.id, purpose, consumedAt: null },
        data: { consumedAt: input.now },
      });
      await client.verificationToken.create({
        data: {
          id: input.tokenId,
          userId: user.id,
          purpose,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      });
      return safeUser(user);
    });
  }

  async appendAudit(input: AuditInput): Promise<void> {
    await this.#client.auditLog.create({ data: auditData(input) });
  }

  async assignRole(input: Parameters<IdentityRepositoryPort['assignRole']>[0]): Promise<boolean> {
    return this.#client.$transaction(async (client) => {
      const target = await client.user.findUnique({ where: { id: input.targetUserId } });
      if (target === null) return false;
      const role = await client.role.findUnique({ where: { code: input.role } });
      if (role === null) return false;
      const existing = await client.userRole.findUnique({
        where: { userId_roleId: { userId: input.targetUserId, roleId: role.id } },
      });
      if (existing !== null) return true;
      await client.userRole.create({
        data: {
          id: uuidV7(input.now.getTime()),
          userId: input.targetUserId,
          roleId: role.id,
          grantedBy: input.actorUserId,
          grantedAt: input.now,
        },
      });
      if (input.role !== 'CUSTOMER' && !target.isStaff) {
        await client.user.update({
          where: { id: input.targetUserId },
          data: { isStaff: true },
        });
      }
      await client.session.updateMany({
        where: { userId: input.targetUserId, revokedAt: null },
        data: { revokedAt: input.now },
      });
      await client.auditLog.create({ data: auditData(input.audit, input.targetUserId) });
      return true;
    });
  }

  async close(): Promise<void> {
    await this.#client.$disconnect();
  }
}
