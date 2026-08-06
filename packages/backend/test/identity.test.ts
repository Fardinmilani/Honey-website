import { describe, expect, it } from 'vitest';

import {
  Aes256GcmSecretCipher,
  Argon2PasswordHasher,
  IdentityService,
  Rfc6238Totp,
  assertPasswordShape,
  normalizeEmail,
  randomOpaqueToken,
  sha256,
  type AuditInput,
  type AuthenticationUser,
  type AuthStatePort,
  type ClockPort,
  type EncryptedValue,
  type IdentityConfig,
  type IdentityEmailMessage,
  type IdentityEmailPort,
  type IdentityRepositoryPort,
  type IdentityTransactionPort,
  type PasswordHasherPort,
  type PersistedSession,
  type PreAuthChallenge,
  type RequestMetadata,
  type SafeUser,
  type SessionSummary,
} from '../src/index.js';

const now = new Date('2026-08-06T12:00:00.000Z');
const metadata: RequestMetadata = {
  requestId: 'request-identity-test',
  clientIp: '192.0.2.10',
  userAgent: 'identity-test',
};
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
  totpIssuer: 'Honey',
  totpDriftSeconds: 30,
  authThrottle: {
    windowMs: 15 * 60 * 1_000,
    maxFailures: 3,
    baseLockMs: 30_000,
    maxLockMs: 15 * 60 * 1_000,
  },
};

class FakeClock implements ClockPort {
  current = new Date(now);

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

class FakePasswordHasher implements PasswordHasherPort {
  dummyChecks = 0;

  async hash(password: string): Promise<string> {
    return Promise.resolve(`argon2id:${password}`);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return Promise.resolve(hash === `argon2id:${password}`);
  }

  async verifyDummy(): Promise<void> {
    this.dummyChecks += 1;
  }
}

class FakeCipher {
  encrypt(value: string): EncryptedValue {
    return {
      ciphertext: Buffer.from(`encrypted:${value}`),
      nonce: Buffer.from('unique-nonce'),
      tag: Buffer.from('authentication-tag'),
    };
  }

  decrypt(value: EncryptedValue): string {
    return Buffer.from(value.ciphertext)
      .toString('utf8')
      .replace(/^encrypted:/u, '');
  }
}

class FakeTotp {
  readonly secret = 'JBSWY3DPEHPK3PXP';

  generateSecret(): string {
    return this.secret;
  }

  provisioningUri(email: string, issuer: string): string {
    return `otpauth://totp/${issuer}:${email}`;
  }

  async verify(
    secret: string,
    code: string,
    time: Date,
    _driftSeconds: number,
    afterStep: bigint | null,
  ): Promise<Readonly<{ valid: false } | { valid: true; step: bigint }>> {
    const step = BigInt(Math.floor(time.getTime() / 30_000));
    return Promise.resolve(
      secret === this.secret && code === '123456' && (afterStep === null || step > afterStep)
        ? { valid: true, step }
        : { valid: false },
    );
  }
}

class FakeEmail implements IdentityEmailPort {
  readonly verifications: IdentityEmailMessage[] = [];
  readonly resets: IdentityEmailMessage[] = [];

  async sendEmailVerification(message: IdentityEmailMessage): Promise<void> {
    this.verifications.push(message);
  }

  async sendPasswordReset(message: IdentityEmailMessage): Promise<void> {
    this.resets.push(message);
  }
}

class FakeAuthState implements AuthStatePort {
  readonly challenges = new Map<string, PreAuthChallenge>();
  readonly failures = new Map<string, number>();
  readonly cleared: string[] = [];

  async checkThrottle(keys: readonly string[]): Promise<number | null> {
    return Promise.resolve(keys.some((key) => (this.failures.get(key) ?? 0) >= 3) ? 30_000 : null);
  }

  async recordFailure(keys: readonly string[]): Promise<number | null> {
    let locked = false;
    for (const key of keys) {
      const count = (this.failures.get(key) ?? 0) + 1;
      this.failures.set(key, count);
      locked ||= count >= 3;
    }
    return Promise.resolve(locked ? 30_000 : null);
  }

  async clearIdentity(key: string): Promise<void> {
    this.failures.delete(key);
    this.cleared.push(key);
  }

  async createChallenge(
    tokenHash: string,
    challenge: PreAuthChallenge,
    _ttlMs: number,
  ): Promise<void> {
    this.challenges.set(tokenHash, challenge);
  }

  async getChallenge(tokenHash: string): Promise<PreAuthChallenge | null> {
    return Promise.resolve(this.challenges.get(tokenHash) ?? null);
  }

  async consumeChallenge(tokenHash: string): Promise<PreAuthChallenge | null> {
    const value = this.challenges.get(tokenHash) ?? null;
    this.challenges.delete(tokenHash);
    return Promise.resolve(value);
  }

  async recordChallengeFailure(tokenHash: string, maxAttempts: number): Promise<boolean> {
    const key = `challenge:${tokenHash}`;
    const count = (this.failures.get(key) ?? 0) + 1;
    this.failures.set(key, count);
    if (count >= maxAttempts) this.challenges.delete(tokenHash);
    return Promise.resolve(count >= maxAttempts);
  }
}

type StoredToken = {
  userId: string;
  purpose: 'EMAIL' | 'PASSWORD_RESET';
  expiresAt: Date;
  consumedAt: Date | null;
};

class FakeRepository implements IdentityRepositoryPort, IdentityTransactionPort {
  readonly users = new Map<string, AuthenticationUser>();
  readonly sessions = new Map<string, PersistedSession>();
  readonly sessionHashes: string[] = [];
  readonly tokens = new Map<string, StoredToken>();
  readonly audits: AuditInput[] = [];
  roleAssignments = 0;

  transaction<Result>(
    work: (transaction: IdentityTransactionPort) => Promise<Result>,
  ): Promise<Result> {
    return work(this);
  }

  async createCustomer(
    input: Parameters<IdentityTransactionPort['createCustomer']>[0],
  ): Promise<boolean> {
    if ([...this.users.values()].some((user) => user.email === input.email)) return false;
    const user: AuthenticationUser = {
      id: input.id,
      email: input.email,
      emailVerified: false,
      displayName: input.displayName,
      preferredLocale: input.preferredLocale,
      status: 'ACTIVE',
      isStaff: false,
      roles: ['CUSTOMER'],
      permissions: [],
      passwordCredential: { id: input.passwordCredentialId, secretHash: input.passwordHash },
      totpCredential: null,
    };
    this.users.set(user.id, user);
    this.tokens.set(input.verificationTokenHash, {
      userId: user.id,
      purpose: 'EMAIL',
      expiresAt: input.verificationExpiresAt,
      consumedAt: null,
    });
    this.audits.push(input.audit);
    return true;
  }

  async confirmEmailVerification(
    tokenHash: string,
    time: Date,
    audit: AuditInput,
  ): Promise<boolean> {
    const token = this.tokens.get(tokenHash);
    if (
      token === undefined ||
      token.purpose !== 'EMAIL' ||
      token.consumedAt !== null ||
      token.expiresAt <= time
    ) {
      return false;
    }
    token.consumedAt = time;
    const user = this.users.get(token.userId);
    if (user === undefined) return false;
    this.users.set(user.id, { ...user, emailVerified: true });
    this.audits.push({ ...audit, subjectId: user.id });
    return true;
  }

  async completePasswordReset(
    input: Parameters<IdentityTransactionPort['completePasswordReset']>[0],
  ): Promise<boolean> {
    const token = this.tokens.get(input.tokenHash);
    if (
      token === undefined ||
      token.purpose !== 'PASSWORD_RESET' ||
      token.consumedAt !== null ||
      token.expiresAt <= input.now
    ) {
      return false;
    }
    const user = this.users.get(token.userId);
    if (user === undefined || user.passwordCredential === null) return false;
    token.consumedAt = input.now;
    this.users.set(user.id, {
      ...user,
      passwordCredential: { ...user.passwordCredential, secretHash: input.passwordHash },
    });
    for (const [hash, session] of this.sessions) {
      if (session.user.id === user.id)
        this.sessions.set(hash, { ...session, revokedAt: input.now });
    }
    this.audits.push({ ...input.audit, subjectId: user.id });
    return true;
  }

  async createSession(
    input: Parameters<IdentityTransactionPort['createSession']>[0],
  ): Promise<void> {
    const user = this.users.get(input.userId);
    if (user === undefined) throw new Error('Missing fake user.');
    this.sessions.set(input.tokenHash, {
      id: input.id,
      user,
      kind: input.kind,
      createdAt: input.now,
      lastSeenAt: input.now,
      expiresAt: input.expiresAt,
      absoluteExpiresAt: input.absoluteExpiresAt,
      revokedAt: null,
    });
    this.sessionHashes.push(input.tokenHash);
    this.audits.push(input.audit);
  }

  async saveTotpCredential(
    input: Parameters<IdentityTransactionPort['saveTotpCredential']>[0],
  ): Promise<void> {
    const user = this.users.get(input.userId);
    if (user === undefined) throw new Error('Missing fake user.');
    this.users.set(user.id, {
      ...user,
      totpCredential: {
        id: input.id,
        encryptedSecret: input.encryptedSecret,
        lastAcceptedStep: input.acceptedStep,
      },
    });
    this.audits.push(input.audit);
  }

  async acceptTotpStep(credentialId: string, step: bigint): Promise<boolean> {
    for (const [id, user] of this.users) {
      const credential = user.totpCredential;
      if (credential?.id === credentialId) {
        if (credential.lastAcceptedStep !== null && credential.lastAcceptedStep >= step)
          return false;
        this.users.set(id, {
          ...user,
          totpCredential: { ...credential, lastAcceptedStep: step },
        });
        return true;
      }
    }
    return false;
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    time: Date,
    audit: AuditInput,
  ): Promise<boolean> {
    for (const [hash, session] of this.sessions) {
      if (session.id === sessionId && session.user.id === userId && session.revokedAt === null) {
        this.sessions.set(hash, { ...session, revokedAt: time });
        this.audits.push(audit);
        return true;
      }
    }
    return false;
  }

  async revokeAllSessions(userId: string, time: Date, audit: AuditInput): Promise<number> {
    let count = 0;
    for (const [hash, session] of this.sessions) {
      if (session.user.id === userId && session.revokedAt === null) {
        this.sessions.set(hash, { ...session, revokedAt: time });
        count += 1;
      }
    }
    this.audits.push(audit);
    return count;
  }

  async findAuthenticationUser(email: string): Promise<AuthenticationUser | null> {
    return Promise.resolve([...this.users.values()].find((user) => user.email === email) ?? null);
  }

  async findAuthenticationUserById(userId: string): Promise<AuthenticationUser | null> {
    return Promise.resolve(this.users.get(userId) ?? null);
  }

  async findUserByEmail(email: string): Promise<SafeUser | null> {
    return this.findAuthenticationUser(email);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<PersistedSession | null> {
    const session = this.sessions.get(tokenHash);
    if (session === undefined) return null;
    const user = this.users.get(session.user.id);
    return user === undefined ? null : { ...session, user };
  }

  async touchSession(sessionId: string, lastSeenAt: Date, expiresAt: Date): Promise<void> {
    for (const [hash, session] of this.sessions) {
      if (session.id === sessionId) this.sessions.set(hash, { ...session, lastSeenAt, expiresAt });
    }
  }

  async listSessions(
    userId: string,
    time: Date,
    currentSessionId: string,
  ): Promise<readonly SessionSummary[]> {
    return [...this.sessions.values()]
      .filter(
        (session) =>
          session.user.id === userId && session.revokedAt === null && session.expiresAt > time,
      )
      .map((session) => ({
        id: session.id,
        kind: session.kind,
        current: session.id === currentSessionId,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        ip: null,
        userAgentHash: null,
      }));
  }

  async requestVerificationToken(
    input: Parameters<IdentityRepositoryPort['requestVerificationToken']>[0],
  ): Promise<SafeUser | null> {
    const user = await this.findAuthenticationUser(input.email);
    if (user === null || user.emailVerified) return null;
    for (const token of this.tokens.values()) {
      if (token.userId === user.id && token.purpose === 'EMAIL') token.consumedAt = input.now;
    }
    this.tokens.set(input.tokenHash, {
      userId: user.id,
      purpose: 'EMAIL',
      expiresAt: input.expiresAt,
      consumedAt: null,
    });
    return user;
  }

  async requestPasswordResetToken(
    input: Parameters<IdentityRepositoryPort['requestPasswordResetToken']>[0],
  ): Promise<SafeUser | null> {
    const user = await this.findAuthenticationUser(input.email);
    if (user === null || user.status !== 'ACTIVE') return null;
    for (const token of this.tokens.values()) {
      if (token.userId === user.id && token.purpose === 'PASSWORD_RESET')
        token.consumedAt = input.now;
    }
    this.tokens.set(input.tokenHash, {
      userId: user.id,
      purpose: 'PASSWORD_RESET',
      expiresAt: input.expiresAt,
      consumedAt: null,
    });
    return user;
  }

  async appendAudit(input: AuditInput): Promise<void> {
    this.audits.push(input);
  }

  async assignRole(input: Parameters<IdentityRepositoryPort['assignRole']>[0]): Promise<boolean> {
    const user = this.users.get(input.targetUserId);
    if (user === undefined) return false;
    const roles = user.roles.includes(input.role) ? user.roles : [...user.roles, input.role];
    this.users.set(user.id, { ...user, roles, isStaff: input.role !== 'CUSTOMER' || user.isStaff });
    this.roleAssignments += 1;
    await this.revokeAllSessions(user.id, input.now, input.audit);
    return true;
  }
}

function createFixture(): Readonly<{
  service: IdentityService;
  repository: FakeRepository;
  clock: FakeClock;
  passwordHasher: FakePasswordHasher;
  authState: FakeAuthState;
  email: FakeEmail;
}> {
  const repository = new FakeRepository();
  const clock = new FakeClock();
  const passwordHasher = new FakePasswordHasher();
  const authState = new FakeAuthState();
  const email = new FakeEmail();
  return {
    repository,
    clock,
    passwordHasher,
    authState,
    email,
    service: new IdentityService({
      config,
      repository,
      passwordHasher,
      breachedPasswords: { isBreached: async () => Promise.resolve(false) },
      cipher: new FakeCipher(),
      totp: new FakeTotp(),
      authState,
      email,
      clock,
    }),
  };
}

async function register(fixture: ReturnType<typeof createFixture>, email = 'user@example.invalid') {
  await fixture.service.register({ email, password: 'correct horse battery staple' }, metadata);
  const user = await fixture.repository.findAuthenticationUser(normalizeEmail(email));
  if (user === null) throw new Error('Fake registration failed.');
  return user;
}

describe('identity password and cryptographic primitives', () => {
  it('normalizes only email and preserves Unicode password input explicitly', async () => {
    expect(normalizeEmail('  U\u0308SER@EXAMPLE.INVALID  ')).toBe('üser@example.invalid');
    expect(() => assertPasswordShape('کلمه‌عبور امن  ', config.password)).not.toThrow();
    const hasher = new Argon2PasswordHasher(config.password);
    const first = await hasher.hash('کلمه‌عبور امن  ');
    const second = await hasher.hash('کلمه‌عبور امن  ');
    expect(first).toContain('$argon2id$');
    expect(first).not.toBe(second);
    await expect(hasher.verify(first, 'کلمه‌عبور امن  ')).resolves.toBe(true);
    await expect(hasher.verify(first, 'کلمه‌عبور امن')).resolves.toBe(false);
  });

  it('generates 256-bit opaque tokens and encrypts retrievable TOTP secrets', () => {
    const token = randomOpaqueToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    const cipher = new Aes256GcmSecretCipher('AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=');
    const encrypted = cipher.encrypt('TOTP-SECRET');
    expect(Buffer.from(encrypted.ciphertext).toString('utf8')).not.toContain('TOTP-SECRET');
    expect(cipher.decrypt(encrypted)).toBe('TOTP-SECRET');
  });

  it('uses RFC 6238 output and replay-aware verification results', async () => {
    const totp = new Rfc6238Totp();
    const secret = totp.generateSecret();
    expect(totp.provisioningUri('staff@example.invalid', 'Honey', secret)).toContain(
      'otpauth://totp/',
    );
    await expect(totp.verify(secret, 'not-code', now, 30, null)).resolves.toEqual({ valid: false });
  });
});

describe('identity application service', () => {
  it('registers only a CUSTOMER with a hashed credential and generic duplicate response', async () => {
    const fixture = createFixture();
    await expect(
      fixture.service.register(
        {
          email: ' Customer@Example.Invalid ',
          password: 'correct horse battery staple',
          displayName: 'Customer',
        },
        metadata,
      ),
    ).resolves.toEqual({ accepted: true });
    const user = await fixture.repository.findAuthenticationUser('customer@example.invalid');
    expect(user).toMatchObject({ isStaff: false, roles: ['CUSTOMER'], emailVerified: false });
    expect(user?.passwordCredential?.secretHash).toBe('argon2id:correct horse battery staple');
    expect(fixture.email.verifications).toHaveLength(1);
    await expect(
      fixture.service.register(
        { email: 'CUSTOMER@example.invalid', password: 'another safe password' },
        metadata,
      ),
    ).resolves.toEqual({ accepted: true });
    expect(fixture.email.verifications).toHaveLength(1);
    expect(JSON.stringify(fixture.repository.audits)).not.toContain('correct horse');
  });

  it('confirms email tokens once and rejects expired or replayed tokens', async () => {
    const fixture = createFixture();
    await register(fixture);
    const message = fixture.email.verifications[0];
    if (message === undefined) throw new Error('Missing verification message.');
    await fixture.service.confirmEmailVerification(message.token, metadata);
    await expect(
      fixture.service.confirmEmailVerification(message.token, metadata),
    ).rejects.toMatchObject({
      code: 'VERIFICATION_TOKEN_INVALID',
    });
    const expired = createFixture();
    await register(expired);
    const expiredMessage = expired.email.verifications[0];
    if (expiredMessage === undefined) throw new Error('Missing verification message.');
    expired.clock.advance(config.verificationTokenTtlMs + 1);
    await expect(
      expired.service.confirmEmailVerification(expiredMessage.token, metadata),
    ).rejects.toMatchObject({ code: 'VERIFICATION_TOKEN_INVALID' });
  });

  it('keeps reset requests enumeration-safe and consumes a reset while revoking sessions', async () => {
    const fixture = createFixture();
    await register(fixture);
    const firstLogin = await fixture.service.login(
      { email: 'user@example.invalid', password: 'correct horse battery staple' },
      metadata,
    );
    expect(firstLogin.next).toBe('AUTHENTICATED');
    await expect(
      fixture.service.requestPasswordReset('missing@example.invalid', metadata),
    ).resolves.toEqual({ accepted: true });
    await expect(
      fixture.service.requestPasswordReset('user@example.invalid', metadata),
    ).resolves.toEqual({ accepted: true });
    const reset = fixture.email.resets[0];
    if (reset === undefined) throw new Error('Missing reset message.');
    await fixture.service.confirmPasswordReset(reset.token, 'replacement password value', metadata);
    await expect(
      fixture.service.confirmPasswordReset(reset.token, 'replacement password value', metadata),
    ).rejects.toMatchObject({ code: 'PASSWORD_RESET_TOKEN_INVALID' });
    const stored = fixture.repository.sessions.get(fixture.repository.sessionHashes[0] ?? '');
    expect(stored?.revokedAt).toEqual(now);
  });

  it('returns generic password failures, performs dummy work, and locks per IP and identity', async () => {
    const fixture = createFixture();
    await register(fixture);
    await expect(
      fixture.service.login(
        { email: 'missing@example.invalid', password: 'wrong password' },
        metadata,
      ),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    expect(fixture.passwordHasher.dummyChecks).toBe(1);
    await expect(
      fixture.service.login(
        { email: 'user@example.invalid', password: 'wrong password' },
        metadata,
      ),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    await expect(
      fixture.service.login(
        { email: 'user@example.invalid', password: 'wrong password' },
        metadata,
      ),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_THROTTLED' });
    expect(fixture.authState.failures.get('ip:192.0.2.10')).toBe(3);
    expect(fixture.authState.failures.get('identity:user@example.invalid')).toBe(2);
  });

  it('stores only the session hash and enforces revocation, ownership, user status, and expiry', async () => {
    const fixture = createFixture();
    const user = await register(fixture);
    const login = await fixture.service.login(
      { email: user.email, password: 'correct horse battery staple' },
      metadata,
    );
    if (login.next !== 'AUTHENTICATED') throw new Error('Expected customer session.');
    expect(fixture.repository.sessionHashes).toEqual([sha256(login.session.sessionToken)]);
    expect(JSON.stringify(fixture.repository.sessions)).not.toContain(login.session.sessionToken);
    const principal = await fixture.service.authenticateSession(login.session.sessionToken);
    expect(await fixture.service.listSessions(principal)).toHaveLength(1);
    await expect(
      fixture.service.revokeSession(
        { ...principal, userId: '018f0000-0000-7000-8000-000000000099' },
        principal.sessionId,
        metadata,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await fixture.service.logout(principal, metadata);
    await expect(
      fixture.service.authenticateSession(login.session.sessionToken),
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });

    const another = await fixture.service.login(
      { email: user.email, password: 'correct horse battery staple' },
      metadata,
    );
    if (another.next !== 'AUTHENTICATED') throw new Error('Expected customer session.');
    fixture.repository.users.set(user.id, { ...user, status: 'SUSPENDED' });
    await expect(
      fixture.service.authenticateSession(another.session.sessionToken),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    fixture.repository.users.set(user.id, user);
    fixture.clock.advance(config.session.customerAbsoluteMs + 1);
    await expect(
      fixture.service.authenticateSession(another.session.sessionToken),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('creates no staff session before TOTP and makes enrollment single-use and replay-safe', async () => {
    const fixture = createFixture();
    const customer = await register(fixture, 'staff@example.invalid');
    const staff: AuthenticationUser = {
      ...customer,
      isStaff: true,
      roles: ['OWNER'],
      permissions: ['role:grant'],
    };
    fixture.repository.users.set(staff.id, staff);
    const login = await fixture.service.login(
      { email: staff.email, password: 'correct horse battery staple' },
      metadata,
    );
    if (login.next !== 'TOTP_ENROLLMENT_REQUIRED') throw new Error('Expected enrollment.');
    expect(fixture.repository.sessions).toHaveLength(0);
    expect(login.provisioningUri).toContain('otpauth://totp/');
    const challenge = fixture.authState.challenges.get(sha256(login.challengeToken));
    expect(Buffer.from(challenge?.encryptedEnrollmentSecret?.ciphertext ?? []).toString()).not.toBe(
      'JBSWY3DPEHPK3PXP',
    );
    const session = await fixture.service.completeStaffTotp(
      login.challengeToken,
      '123456',
      metadata,
    );
    expect((await fixture.service.authenticateSession(session.sessionToken)).kind).toBe('STAFF');
    await expect(
      fixture.service.completeStaffTotp(login.challengeToken, '123456', metadata),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });

    fixture.clock.advance(30_000);
    const next = await fixture.service.login(
      { email: staff.email, password: 'correct horse battery staple' },
      metadata,
    );
    if (next.next !== 'TOTP_REQUIRED') throw new Error('Expected TOTP verification.');
    await expect(
      fixture.service.completeStaffTotp(next.challengeToken, '000000', metadata),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    fixture.clock.advance(config.preAuthChallengeTtlMs + 1);
    await expect(
      fixture.service.completeStaffTotp(next.challengeToken, '123456', metadata),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
  });

  it('fails closed on permission and ownership and limits role grants to OWNER', async () => {
    const fixture = createFixture();
    const owner = await register(fixture, 'owner@example.invalid');
    const target = await register(fixture, 'target@example.invalid');
    const principal = {
      userId: owner.id,
      sessionId: '018f0000-0000-7000-8000-000000000001',
      kind: 'STAFF' as const,
      permissions: ['role:grant'] as const,
    };
    await expect(
      fixture.service.grantRole(principal, target.id, 'SUPPORT', metadata),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    fixture.repository.users.set(owner.id, {
      ...owner,
      isStaff: true,
      roles: ['OWNER'],
      permissions: ['role:grant'],
    });
    await fixture.service.grantRole(principal, target.id, 'SUPPORT', metadata);
    expect(fixture.repository.roleAssignments).toBe(1);
    expect(fixture.repository.audits.at(-1)?.action).toBe('authorization.role_granted');
    fixture.service.authorize(principal, ['role:grant']);
    expect(() =>
      fixture.service.authorize({ ...principal, permissions: [] }, ['role:grant']),
    ).toThrow('FORBIDDEN');
  });

  it('signs out everywhere and keeps audit metadata free of credentials and tokens', async () => {
    const fixture = createFixture();
    const user = await register(fixture);
    const first = await fixture.service.login(
      { email: user.email, password: 'correct horse battery staple' },
      metadata,
    );
    const second = await fixture.service.login(
      { email: user.email, password: 'correct horse battery staple' },
      metadata,
    );
    if (first.next !== 'AUTHENTICATED' || second.next !== 'AUTHENTICATED') {
      throw new Error('Expected customer sessions.');
    }
    const principal = await fixture.service.authenticateSession(first.session.sessionToken);
    await expect(fixture.service.logoutAll(principal, metadata)).resolves.toBe(2);
    const auditText = JSON.stringify(fixture.repository.audits);
    expect(auditText).not.toContain(first.session.sessionToken);
    expect(auditText).not.toContain('correct horse battery staple');
    expect(auditText).not.toContain('123456');
  });
});
