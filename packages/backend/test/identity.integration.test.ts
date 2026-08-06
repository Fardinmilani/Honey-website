import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { generate } from 'otplib';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient, type PrismaClient, uuidV7 } from '@honey/db';
import {
  IdentityService,
  PERMISSION_CODES,
  ROLE_CODES,
  type IdentityConfig,
  type IdentityEmailMessage,
} from '../src/index.js';
import { SystemClock } from '../src/modules/identity/application/identity.service.js';
import {
  Aes256GcmSecretCipher,
  Argon2PasswordHasher,
  Rfc6238Totp,
  sha256,
} from '../src/modules/identity/infrastructure/identity-crypto.js';
import { PrismaIdentityRepository } from '../src/modules/identity/infrastructure/prisma-identity.repository.js';
import { RedisAuthStateAdapter } from '../src/modules/identity/infrastructure/redis-auth-state.adapter.js';

const config: IdentityConfig = {
  password: {
    memoryCostKiB: 65_536,
    timeCost: 3,
    parallelism: 1,
    minLength: 10,
    maxLength: 128,
  },
  session: {
    customerIdleMs: 30 * 24 * 60 * 60 * 1_000,
    customerAbsoluteMs: 30 * 24 * 60 * 60 * 1_000,
    staffIdleMs: 8 * 60 * 60 * 1_000,
    staffAbsoluteMs: 12 * 60 * 60 * 1_000,
    touchIntervalMs: 5 * 60 * 1_000,
  },
  verificationTokenTtlMs: 24 * 60 * 60 * 1_000,
  passwordResetTtlMs: 30 * 60 * 1_000,
  preAuthChallengeTtlMs: 5 * 60 * 1_000,
  totpIssuer: 'Honey integration',
  totpDriftSeconds: 30,
  authThrottle: {
    windowMs: 15 * 60 * 1_000,
    maxFailures: 10,
    baseLockMs: 30_000,
    maxLockMs: 15 * 60 * 1_000,
  },
};

const requestMetadata = {
  requestId: 'identity-integration-request',
  clientIp: '192.0.2.55',
  userAgent: 'identity-integration',
} as const;

class CapturingEmail {
  readonly verifications: IdentityEmailMessage[] = [];
  readonly resets: IdentityEmailMessage[] = [];

  async sendEmailVerification(message: IdentityEmailMessage): Promise<void> {
    this.verifications.push(message);
  }

  async sendPasswordReset(message: IdentityEmailMessage): Promise<void> {
    this.resets.push(message);
  }
}

const execFileAsync = promisify(execFile);
const dbDirectory = fileURLToPath(new URL('../../db/', import.meta.url));
const prismaCli = fileURLToPath(
  new URL('../../db/node_modules/prisma/build/index.js', import.meta.url),
);

type TemporaryDatabase = Readonly<{
  adminUrl: string;
  databaseName: string;
  databaseUrl: string;
}>;

async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const base = new URL(
    process.env['DATABASE_URL'] ??
      'postgresql://honey_local:replace-with-local-development-password@127.0.0.1:5432/honey_local',
  );
  const databaseName = `honey_identity_${randomUUID().replaceAll('-', '')}`;
  if (!/^honey_identity_[a-f0-9]{32}$/u.test(databaseName))
    throw new Error('Unsafe test database name.');
  const admin = new URL(base);
  admin.pathname = '/postgres';
  const target = new URL(base);
  target.pathname = `/${databaseName}`;
  const client = new Client({
    connectionString: admin.toString(),
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await client.end();
  }
  return { adminUrl: admin.toString(), databaseName, databaseUrl: target.toString() };
}

async function migrate(databaseUrl: string): Promise<void> {
  await execFileAsync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--config', 'prisma.config.ts'],
    {
      cwd: dbDirectory,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      windowsHide: true,
      timeout: 120_000,
    },
  );
}

async function dropTemporaryDatabase(value: TemporaryDatabase): Promise<void> {
  const client = new Client({ connectionString: value.adminUrl, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    await client.query(`DROP DATABASE "${value.databaseName}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
}

async function seedIdentity(passwordHash: string): Promise<void> {
  const roleIds = new Map<string, string>();
  for (const code of ROLE_CODES) {
    const id = uuidV7();
    roleIds.set(code, id);
    await prisma.role.create({ data: { id, code, name: code } });
  }
  const ownerRoleId = roleIds.get('OWNER');
  if (ownerRoleId === undefined) throw new Error('OWNER role seed failed.');
  for (const code of PERMISSION_CODES) {
    const permissionId = uuidV7();
    await prisma.permission.create({ data: { id: permissionId, code } });
    await prisma.rolePermission.create({
      data: { id: uuidV7(), roleId: ownerRoleId, permissionId },
    });
  }
  const ownerId = uuidV7();
  await prisma.user.create({
    data: {
      id: ownerId,
      email: 'owner-integration@example.invalid',
      isStaff: true,
      credentials: {
        create: { id: uuidV7(), type: 'PASSWORD', secretHash: passwordHash },
      },
      userRoles: {
        create: { id: uuidV7(), roleId: ownerRoleId },
      },
    },
  });
}

let database: TemporaryDatabase;
let prisma: PrismaClient;
let repository: PrismaIdentityRepository;
let authState: RedisAuthStateAdapter;
let email: CapturingEmail;
let identity: IdentityService;

beforeAll(async () => {
  database = await createTemporaryDatabase();
  await migrate(database.databaseUrl);
  prisma = createPrismaClient({ databaseUrl: database.databaseUrl });
  const passwordHasher = new Argon2PasswordHasher(config.password);
  await seedIdentity(await passwordHasher.hash('owner integration password'));
  repository = new PrismaIdentityRepository(database.databaseUrl);
  authState = new RedisAuthStateAdapter('redis://127.0.0.1:6379', config.authThrottle);
  email = new CapturingEmail();
  identity = new IdentityService({
    config,
    repository,
    passwordHasher,
    breachedPasswords: { isBreached: async () => Promise.resolve(false) },
    cipher: new Aes256GcmSecretCipher('AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI='),
    totp: new Rfc6238Totp(),
    authState,
    email,
    clock: new SystemClock(),
  });
}, 120_000);

afterAll(async () => {
  await Promise.allSettled([repository?.close(), authState?.close(), prisma?.$disconnect()]);
  if (database !== undefined) await dropTemporaryDatabase(database);
}, 120_000);

describe('identity integration with disposable PostgreSQL and real Redis', () => {
  it('applies atomic per-key exponential lockout and single-use challenges in Redis', async () => {
    const identityKey = `integration-identity:${uuidV7()}`;
    const ipKey = `integration-ip:${uuidV7()}`;
    const time = new Date('2026-08-06T12:00:00.000Z');
    const results = await Promise.all(
      Array.from({ length: 10 }, () => authState.recordFailure([identityKey, ipKey], time)),
    );
    expect(results.filter((result) => result !== null)).toHaveLength(1);
    await expect(authState.checkThrottle([identityKey], time)).resolves.toBe(30_000);
    await expect(authState.recordFailure([identityKey], time)).resolves.toBe(60_000);
    await authState.clearIdentity(identityKey);
    await expect(authState.checkThrottle([identityKey], time)).resolves.toBeNull();
    await expect(authState.checkThrottle([ipKey], time)).resolves.toBe(30_000);

    const challengeHash = sha256(`integration-challenge:${uuidV7()}`);
    await authState.createChallenge(
      challengeHash,
      {
        userId: uuidV7(),
        kind: 'TOTP_VERIFY',
        expiresAt: new Date(time.getTime() + 300_000),
      },
      300_000,
    );
    const consumed = await Promise.all([
      authState.consumeChallenge(challengeHash),
      authState.consumeChallenge(challengeHash),
    ]);
    expect(consumed.filter((value) => value !== null)).toHaveLength(1);
  });

  it('persists registration atomically, hashes one-time tokens, and revokes reset sessions', async () => {
    await identity.register(
      {
        email: 'customer-integration@example.invalid',
        password: 'customer integration password',
      },
      requestMetadata,
    );
    const user = await prisma.user.findUnique({
      where: { email: 'customer-integration@example.invalid' },
      include: { credentials: true, userRoles: { include: { role: true } } },
    });
    expect(user?.isStaff).toBe(false);
    expect(user?.userRoles.map(({ role }) => role.code)).toEqual(['CUSTOMER']);
    expect(user?.credentials[0]?.secretHash).toContain('$argon2id$');
    const verification = email.verifications[0];
    if (verification === undefined) throw new Error('Verification email was not captured.');
    const storedVerification = await prisma.verificationToken.findUnique({
      where: { tokenHash: sha256(verification.token) },
    });
    expect(storedVerification).not.toBeNull();
    expect(JSON.stringify(storedVerification)).not.toContain(verification.token);
    await identity.confirmEmailVerification(verification.token, requestMetadata);
    await expect(
      identity.confirmEmailVerification(verification.token, requestMetadata),
    ).rejects.toMatchObject({ code: 'VERIFICATION_TOKEN_INVALID' });

    const login = await identity.login(
      {
        email: 'customer-integration@example.invalid',
        password: 'customer integration password',
      },
      requestMetadata,
    );
    if (login.next !== 'AUTHENTICATED') throw new Error('Customer did not receive a session.');
    const persistedSession = await prisma.session.findUnique({
      where: { tokenHash: sha256(login.session.sessionToken) },
    });
    expect(persistedSession).not.toBeNull();
    expect(JSON.stringify(persistedSession)).not.toContain(login.session.sessionToken);
    const loginAudit = await prisma.auditLog.findFirst({
      where: { action: 'auth.login_succeeded', subjectType: 'session' },
      orderBy: { createdAt: 'desc' },
    });
    expect(loginAudit?.subjectId).toBe(persistedSession?.id);

    await identity.requestPasswordReset('customer-integration@example.invalid', requestMetadata);
    const reset = email.resets[0];
    if (reset === undefined) throw new Error('Reset email was not captured.');
    await identity.confirmPasswordReset(
      reset.token,
      'replacement integration password',
      requestMetadata,
    );
    await expect(identity.authenticateSession(login.session.sessionToken)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(
      identity.confirmPasswordReset(
        reset.token,
        'replacement integration password',
        requestMetadata,
      ),
    ).rejects.toMatchObject({ code: 'PASSWORD_RESET_TOKEN_INVALID' });
  });

  it('creates no staff session before TOTP and stores only encrypted, replay-protected material', async () => {
    const login = await identity.login(
      { email: 'owner-integration@example.invalid', password: 'owner integration password' },
      { ...requestMetadata, requestId: 'identity-staff-login' },
    );
    if (login.next !== 'TOTP_ENROLLMENT_REQUIRED') throw new Error('Expected TOTP enrollment.');
    expect(await prisma.session.count({ where: { kind: 'STAFF' } })).toBe(0);
    const provisioning = new URL(login.provisioningUri);
    const secret = provisioning.searchParams.get('secret');
    if (secret === null) throw new Error('Provisioning URI omitted its controlled secret.');
    const code = await generate({ secret });
    const session = await identity.completeStaffTotp(login.challengeToken, code, {
      ...requestMetadata,
      requestId: 'identity-staff-totp',
    });
    const credential = await prisma.authCredential.findFirst({
      where: { userId: session.user.id, type: 'TOTP' },
    });
    expect(credential?.secretHash).toBeNull();
    expect(credential?.encryptedSecret).not.toBeNull();
    expect(Buffer.from(credential?.encryptedSecret ?? []).toString('utf8')).not.toContain(secret);
    expect(credential?.secretNonce).toHaveLength(12);
    expect(credential?.secretTag).toHaveLength(16);
    await expect(
      identity.completeStaffTotp(login.challengeToken, code, requestMetadata),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    const persistedSession = await prisma.session.findUnique({
      where: { tokenHash: sha256(session.sessionToken) },
    });
    if (persistedSession === null) throw new Error('Staff session was not persisted.');
    expect(persistedSession.expiresAt.getTime() - persistedSession.createdAt.getTime()).toBe(
      config.session.staffIdleMs,
    );
    expect(
      persistedSession.absoluteExpiresAt.getTime() - persistedSession.createdAt.getTime(),
    ).toBe(config.session.staffAbsoluteMs);
  });

  it('keeps security audit rows append-only and free of credential material', async () => {
    const before = await prisma.auditLog.count();
    await identity.requestEmailVerification('customer-integration@example.invalid');
    const after = await prisma.auditLog.count();
    expect(after).toBeGreaterThanOrEqual(before);
    const rows = await prisma.auditLog.findMany();
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toMatch(/customer integration password|owner integration password/iu);
    expect(serialized).not.toContain('identity-integration-request:token');
    const row = rows[0];
    if (row === undefined) throw new Error('Expected an audit row.');
    await expect(
      prisma.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } }),
    ).rejects.toBeDefined();
    await prisma.auditLog.create({
      data: {
        id: uuidV7(),
        action: 'identity.integration.append_only',
        subjectType: 'user',
        subjectId: row.subjectId,
      },
    });
  });
});
