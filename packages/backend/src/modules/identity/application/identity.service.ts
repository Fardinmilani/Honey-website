import { uuidV7 } from '@honey/db';

import {
  ConflictAppError,
  DependencyUnavailableAppError,
  ForbiddenAppError,
  NotFoundAppError,
  RateLimitedAppError,
  UnauthenticatedAppError,
  ValidationAppError,
} from '../../../errors/index.js';
import {
  assertPasswordShape,
  normalizeEmail,
  ownsResource,
  type AuthenticatedPrincipal,
  type IdentityConfig,
  type PermissionCode,
  type RequestMetadata,
  type RoleCode,
  type SafeUser,
  type SessionKind,
  type SessionSummary,
} from '../domain/identity.js';
import type {
  AuthStatePort,
  BreachedPasswordPort,
  ClockPort,
  IdentityEmailPort,
  IdentityRepositoryPort,
  PasswordHasherPort,
  SecretCipherPort,
  TotpPort,
} from '../domain/ports.js';
import { randomOpaqueToken, sha256, userAgentHash } from '../infrastructure/identity-crypto.js';

export type SessionResult = Readonly<{
  sessionToken: string;
  expiresAt: Date;
  user: SafeUser;
}>;

export type LoginResult =
  | Readonly<{ next: 'AUTHENTICATED'; session: SessionResult }>
  | Readonly<{ next: 'TOTP_REQUIRED'; challengeToken: string; challengeExpiresAt: Date }>
  | Readonly<{
      next: 'TOTP_ENROLLMENT_REQUIRED';
      challengeToken: string;
      challengeExpiresAt: Date;
      provisioningUri: string;
    }>;

type Dependencies = Readonly<{
  config: IdentityConfig;
  repository: IdentityRepositoryPort;
  passwordHasher: PasswordHasherPort;
  breachedPasswords: BreachedPasswordPort;
  cipher: SecretCipherPort;
  totp: TotpPort;
  authState: AuthStatePort;
  email: IdentityEmailPort;
  clock: ClockPort;
}>;

const accepted = { accepted: true } as const;

function audit(
  action: string,
  subjectType: string,
  subjectId: string,
  metadata: RequestMetadata,
  actorUserId: string | null = null,
): Readonly<{
  actorUserId: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata: RequestMetadata;
}> {
  return { actorUserId, action, subjectType, subjectId, metadata };
}

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}

export class IdentityService {
  constructor(private readonly dependencies: Dependencies) {}

  async register(
    input: Readonly<{
      email: string;
      password: string;
      displayName?: string;
      preferredLocale?: string;
    }>,
    metadata: RequestMetadata,
  ): Promise<typeof accepted> {
    const email = normalizeEmail(input.email);
    this.#assertPassword(input.password);
    await this.#assertNotBreached(input.password);
    const passwordHash = await this.dependencies.passwordHasher.hash(input.password);
    const now = this.dependencies.clock.now();
    const userId = uuidV7(now.getTime());
    const rawToken = randomOpaqueToken();
    const expiresAt = new Date(now.getTime() + this.dependencies.config.verificationTokenTtlMs);
    const created = await this.dependencies.repository.transaction((transaction) =>
      transaction.createCustomer({
        id: userId,
        email,
        displayName: input.displayName ?? null,
        preferredLocale: input.preferredLocale ?? 'fa',
        passwordCredentialId: uuidV7(now.getTime()),
        passwordHash,
        customerRoleCode: 'CUSTOMER',
        userRoleId: uuidV7(now.getTime()),
        verificationTokenId: uuidV7(now.getTime()),
        verificationTokenHash: sha256(rawToken),
        verificationExpiresAt: expiresAt,
        audit: audit('auth.registration_completed', 'user', userId, metadata),
      }),
    );
    if (created) {
      await this.#sendVerification({ recipient: email, token: rawToken, expiresAt });
    }
    return accepted;
  }

  async login(
    input: Readonly<{ email: string; password: string }>,
    metadata: RequestMetadata,
  ): Promise<LoginResult> {
    const email = normalizeEmail(input.email);
    const now = this.dependencies.clock.now();
    const throttleKeys = this.#throttleKeys(email, metadata.clientIp);
    const blockedMs = await this.dependencies.authState.checkThrottle(throttleKeys, now);
    if (blockedMs !== null) this.#throwThrottled(blockedMs);

    const user = await this.dependencies.repository.findAuthenticationUser(email);
    let passwordValid = false;
    if (user?.passwordCredential === null || user === null) {
      await this.dependencies.passwordHasher.verifyDummy(input.password);
    } else {
      passwordValid = await this.dependencies.passwordHasher.verify(
        user.passwordCredential.secretHash,
        input.password,
      );
    }
    if (!passwordValid || user === null || user.status !== 'ACTIVE') {
      return this.#recordAuthenticationFailure(user, throttleKeys, now, metadata);
    }
    await this.dependencies.authState.clearIdentity(`identity:${email}`);

    if (!user.isStaff) {
      return {
        next: 'AUTHENTICATED',
        session: await this.#createSession(user, 'CUSTOMER', now, metadata),
      };
    }

    const challengeToken = randomOpaqueToken();
    const challengeTokenHash = sha256(challengeToken);
    const challengeExpiresAt = new Date(
      now.getTime() + this.dependencies.config.preAuthChallengeTtlMs,
    );
    if (user.totpCredential !== null) {
      await this.dependencies.authState.createChallenge(
        challengeTokenHash,
        { userId: user.id, kind: 'TOTP_VERIFY', expiresAt: challengeExpiresAt },
        this.dependencies.config.preAuthChallengeTtlMs,
      );
      return { next: 'TOTP_REQUIRED', challengeToken, challengeExpiresAt };
    }

    const secret = this.dependencies.totp.generateSecret();
    await this.dependencies.authState.createChallenge(
      challengeTokenHash,
      {
        userId: user.id,
        kind: 'TOTP_ENROLL',
        encryptedEnrollmentSecret: this.dependencies.cipher.encrypt(secret),
        expiresAt: challengeExpiresAt,
      },
      this.dependencies.config.preAuthChallengeTtlMs,
    );
    return {
      next: 'TOTP_ENROLLMENT_REQUIRED',
      challengeToken,
      challengeExpiresAt,
      provisioningUri: this.dependencies.totp.provisioningUri(
        user.email,
        this.dependencies.config.totpIssuer,
        secret,
      ),
    };
  }

  async completeStaffTotp(
    challengeToken: string,
    code: string,
    metadata: RequestMetadata,
  ): Promise<SessionResult> {
    const now = this.dependencies.clock.now();
    const tokenHash = sha256(challengeToken);
    const challenge = await this.dependencies.authState.getChallenge(tokenHash);
    if (challenge === null || challenge.expiresAt <= now) {
      throw new UnauthenticatedAppError({ code: 'AUTHENTICATION_FAILED' });
    }
    const user = await this.dependencies.repository.findAuthenticationUserById(challenge.userId);
    if (user === null || !user.isStaff || user.status !== 'ACTIVE') {
      await this.dependencies.authState.consumeChallenge(tokenHash);
      throw new UnauthenticatedAppError({ code: 'AUTHENTICATION_FAILED' });
    }

    const credential = user.totpCredential;
    const secret =
      challenge.kind === 'TOTP_ENROLL'
        ? challenge.encryptedEnrollmentSecret === undefined
          ? null
          : this.dependencies.cipher.decrypt(challenge.encryptedEnrollmentSecret)
        : credential === null
          ? null
          : this.dependencies.cipher.decrypt(credential.encryptedSecret);
    if (secret === null) {
      await this.dependencies.authState.consumeChallenge(tokenHash);
      throw new UnauthenticatedAppError({ code: 'AUTHENTICATION_FAILED' });
    }

    const verification = await this.dependencies.totp.verify(
      secret,
      code,
      now,
      this.dependencies.config.totpDriftSeconds,
      challenge.kind === 'TOTP_VERIFY' && credential !== null ? credential.lastAcceptedStep : null,
    );
    if (!verification.valid) {
      await this.dependencies.authState.recordChallengeFailure(tokenHash, 5);
      await this.dependencies.repository.appendAudit(
        audit('auth.staff_totp_failed', 'user', user.id, metadata),
      );
      throw new UnauthenticatedAppError({ code: 'AUTHENTICATION_FAILED' });
    }

    const consumed = await this.dependencies.authState.consumeChallenge(tokenHash);
    if (consumed === null) throw new UnauthenticatedAppError({ code: 'AUTHENTICATION_FAILED' });

    if (challenge.kind === 'TOTP_VERIFY') {
      if (credential === null) throw new UnauthenticatedAppError({ code: 'AUTHENTICATION_FAILED' });
      const acceptedStep = await this.dependencies.repository.transaction((transaction) =>
        transaction.acceptTotpStep(credential.id, verification.step, now),
      );
      if (!acceptedStep) throw new UnauthenticatedAppError({ code: 'AUTHENTICATION_FAILED' });
    } else {
      await this.dependencies.repository.transaction((transaction) =>
        transaction.saveTotpCredential({
          id: uuidV7(now.getTime()),
          userId: user.id,
          encryptedSecret: this.dependencies.cipher.encrypt(secret),
          acceptedStep: verification.step,
          now,
          audit: audit('auth.totp_enrolled', 'user', user.id, metadata, user.id),
        }),
      );
    }

    return this.#createSession(user, 'STAFF', now, metadata);
  }

  async authenticateSession(rawToken: string | undefined): Promise<AuthenticatedPrincipal> {
    if (rawToken === undefined || rawToken.length < 32) {
      throw new UnauthenticatedAppError();
    }
    const session = await this.dependencies.repository.findSessionByTokenHash(sha256(rawToken));
    const now = this.dependencies.clock.now();
    if (
      session === null ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      session.absoluteExpiresAt <= now ||
      session.user.status !== 'ACTIVE' ||
      (session.kind === 'STAFF' && !session.user.isStaff)
    ) {
      throw new UnauthenticatedAppError();
    }
    if (
      now.getTime() - session.lastSeenAt.getTime() >=
      this.dependencies.config.session.touchIntervalMs
    ) {
      const idleMs =
        session.kind === 'STAFF'
          ? this.dependencies.config.session.staffIdleMs
          : this.dependencies.config.session.customerIdleMs;
      const nextExpiry = new Date(
        Math.min(now.getTime() + idleMs, session.absoluteExpiresAt.getTime()),
      );
      await this.dependencies.repository.touchSession(session.id, now, nextExpiry);
    }
    return {
      userId: session.user.id,
      sessionId: session.id,
      kind: session.kind,
      permissions: session.user.permissions,
    };
  }

  authorize(principal: AuthenticatedPrincipal, required: readonly PermissionCode[]): void {
    if (!required.every((permission) => principal.permissions.includes(permission))) {
      throw new ForbiddenAppError();
    }
  }

  async grantRole(
    principal: AuthenticatedPrincipal,
    targetUserId: string,
    role: RoleCode,
    metadata: RequestMetadata,
  ): Promise<void> {
    this.authorize(principal, ['role:grant']);
    const actor = await this.dependencies.repository.findAuthenticationUserById(principal.userId);
    if (actor === null || !actor.roles.includes('OWNER')) throw new ForbiddenAppError();
    const assigned = await this.dependencies.repository.assignRole({
      actorUserId: principal.userId,
      targetUserId,
      role,
      now: this.dependencies.clock.now(),
      audit: audit('authorization.role_granted', 'user', targetUserId, metadata, principal.userId),
    });
    if (!assigned) throw new NotFoundAppError();
  }

  async me(principal: AuthenticatedPrincipal): Promise<SafeUser> {
    const user = await this.dependencies.repository.findAuthenticationUserById(principal.userId);
    if (user === null || !ownsResource(principal, user.id)) throw new NotFoundAppError();
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      preferredLocale: user.preferredLocale,
      status: user.status,
      isStaff: user.isStaff,
      roles: user.roles,
      permissions: user.permissions,
    };
  }

  listSessions(principal: AuthenticatedPrincipal): Promise<readonly SessionSummary[]> {
    return this.dependencies.repository.listSessions(
      principal.userId,
      this.dependencies.clock.now(),
      principal.sessionId,
    );
  }

  async revokeSession(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const revoked = await this.dependencies.repository.transaction((transaction) =>
      transaction.revokeSession(
        principal.userId,
        sessionId,
        this.dependencies.clock.now(),
        audit('auth.session_revoked', 'session', sessionId, metadata, principal.userId),
      ),
    );
    if (!revoked) throw new NotFoundAppError();
  }

  async logout(principal: AuthenticatedPrincipal, metadata: RequestMetadata): Promise<void> {
    await this.revokeSession(principal, principal.sessionId, metadata);
  }

  async logoutAll(principal: AuthenticatedPrincipal, metadata: RequestMetadata): Promise<number> {
    return this.dependencies.repository.transaction((transaction) =>
      transaction.revokeAllSessions(
        principal.userId,
        this.dependencies.clock.now(),
        audit('auth.logout_all', 'user', principal.userId, metadata, principal.userId),
      ),
    );
  }

  async requestEmailVerification(emailInput: string): Promise<typeof accepted> {
    const email = normalizeEmail(emailInput);
    const now = this.dependencies.clock.now();
    const token = randomOpaqueToken();
    const expiresAt = new Date(now.getTime() + this.dependencies.config.verificationTokenTtlMs);
    const user = await this.dependencies.repository.requestVerificationToken({
      email,
      tokenId: uuidV7(now.getTime()),
      tokenHash: sha256(token),
      expiresAt,
      now,
    });
    if (user !== null) await this.#sendVerification({ recipient: user.email, token, expiresAt });
    return accepted;
  }

  async confirmEmailVerification(token: string, metadata: RequestMetadata): Promise<void> {
    const verified = await this.dependencies.repository.transaction((transaction) =>
      transaction.confirmEmailVerification(
        sha256(token),
        this.dependencies.clock.now(),
        audit('auth.email_verified', 'user', uuidV7(), metadata),
      ),
    );
    if (!verified) throw new ConflictAppError({ code: 'VERIFICATION_TOKEN_INVALID' });
  }

  async requestPasswordReset(
    emailInput: string,
    metadata: RequestMetadata,
  ): Promise<typeof accepted> {
    const email = normalizeEmail(emailInput);
    const now = this.dependencies.clock.now();
    const throttleKeys = [
      `password-reset:identity:${email}`,
      `password-reset:ip:${metadata.clientIp ?? 'unknown'}`,
    ];
    const blockedMs = await this.dependencies.authState.checkThrottle(throttleKeys, now);
    if (blockedMs !== null) this.#throwThrottled(blockedMs);
    const lockedMs = await this.dependencies.authState.recordFailure(throttleKeys, now);
    if (lockedMs !== null) this.#throwThrottled(lockedMs);
    const token = randomOpaqueToken();
    const expiresAt = new Date(now.getTime() + this.dependencies.config.passwordResetTtlMs);
    const user = await this.dependencies.repository.requestPasswordResetToken({
      email,
      tokenId: uuidV7(now.getTime()),
      tokenHash: sha256(token),
      expiresAt,
      now,
    });
    if (user !== null) {
      await this.#sendReset({ recipient: user.email, token, expiresAt });
    }
    return accepted;
  }

  async confirmPasswordReset(
    token: string,
    newPassword: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    this.#assertPassword(newPassword);
    await this.#assertNotBreached(newPassword);
    const passwordHash = await this.dependencies.passwordHasher.hash(newPassword);
    const reset = await this.dependencies.repository.transaction((transaction) =>
      transaction.completePasswordReset({
        tokenHash: sha256(token),
        passwordHash,
        now: this.dependencies.clock.now(),
        audit: audit('auth.password_reset_completed', 'user', uuidV7(), metadata),
      }),
    );
    if (!reset) throw new ConflictAppError({ code: 'PASSWORD_RESET_TOKEN_INVALID' });
  }

  async #createSession(
    user: SafeUser,
    kind: SessionKind,
    now: Date,
    metadata: RequestMetadata,
  ): Promise<SessionResult> {
    const token = randomOpaqueToken();
    const sessionId = uuidV7(now.getTime());
    const idleMs =
      kind === 'STAFF'
        ? this.dependencies.config.session.staffIdleMs
        : this.dependencies.config.session.customerIdleMs;
    const absoluteMs =
      kind === 'STAFF'
        ? this.dependencies.config.session.staffAbsoluteMs
        : this.dependencies.config.session.customerAbsoluteMs;
    const absoluteExpiresAt = new Date(now.getTime() + absoluteMs);
    const expiresAt = new Date(Math.min(now.getTime() + idleMs, absoluteExpiresAt.getTime()));
    await this.dependencies.repository.transaction((transaction) =>
      transaction.createSession({
        id: sessionId,
        userId: user.id,
        kind,
        tokenHash: sha256(token),
        ip: metadata.clientIp ?? null,
        userAgentHash: userAgentHash(metadata.userAgent),
        now,
        expiresAt,
        absoluteExpiresAt,
        audit: audit('auth.login_succeeded', 'session', sessionId, metadata, user.id),
      }),
    );
    return { sessionToken: token, expiresAt, user };
  }

  #assertPassword(password: string): void {
    try {
      assertPasswordShape(password, this.dependencies.config.password);
    } catch {
      throw new ValidationAppError([{ path: 'password', code: 'INVALID_LENGTH' }]);
    }
  }

  async #assertNotBreached(password: string): Promise<void> {
    try {
      if (await this.dependencies.breachedPasswords.isBreached(password)) {
        throw new ValidationAppError([{ path: 'password', code: 'BREACHED_PASSWORD' }]);
      }
    } catch (error) {
      if (error instanceof ValidationAppError) throw error;
      throw new DependencyUnavailableAppError({ code: 'PASSWORD_SCREENING_UNAVAILABLE' });
    }
  }

  #throttleKeys(email: string, clientIp: string | undefined): readonly string[] {
    return [`identity:${email}`, `ip:${clientIp ?? 'unknown'}`];
  }

  async #recordAuthenticationFailure(
    user: SafeUser | null,
    keys: readonly string[],
    now: Date,
    metadata: RequestMetadata,
  ): Promise<never> {
    const lockedMs = await this.dependencies.authState.recordFailure(keys, now);
    if (user?.isStaff === true) {
      await this.dependencies.repository.appendAudit(
        audit('auth.staff_login_failed', 'user', user.id, metadata),
      );
    }
    if (lockedMs !== null) this.#throwThrottled(lockedMs);
    throw new UnauthenticatedAppError({ code: 'AUTHENTICATION_FAILED' });
  }

  #throwThrottled(milliseconds: number): never {
    throw new RateLimitedAppError({
      code: 'AUTHENTICATION_THROTTLED',
      retryAfterSeconds: Math.max(1, Math.ceil(milliseconds / 1_000)),
    });
  }

  async #sendVerification(
    message: Parameters<IdentityEmailPort['sendEmailVerification']>[0],
  ): Promise<void> {
    try {
      await this.dependencies.email.sendEmailVerification(message);
    } catch {
      throw new DependencyUnavailableAppError({ code: 'IDENTITY_EMAIL_UNAVAILABLE' });
    }
  }

  async #sendReset(message: Parameters<IdentityEmailPort['sendPasswordReset']>[0]): Promise<void> {
    try {
      await this.dependencies.email.sendPasswordReset(message);
    } catch {
      throw new DependencyUnavailableAppError({ code: 'IDENTITY_EMAIL_UNAVAILABLE' });
    }
  }
}
