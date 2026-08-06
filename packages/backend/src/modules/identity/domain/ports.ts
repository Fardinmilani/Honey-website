import type {
  AuthenticationUser,
  EncryptedValue,
  PersistedSession,
  RequestMetadata,
  RoleCode,
  SafeUser,
  SessionKind,
  SessionSummary,
} from './identity.js';

export interface ClockPort {
  now(): Date;
}

export interface PasswordHasherPort {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  verifyDummy(password: string): Promise<void>;
}

export interface BreachedPasswordPort {
  isBreached(password: string): Promise<boolean>;
}

export interface SecretCipherPort {
  encrypt(value: string): EncryptedValue;
  decrypt(value: EncryptedValue): string;
}

export interface TotpPort {
  generateSecret(): string;
  provisioningUri(email: string, issuer: string, secret: string): string;
  verify(
    secret: string,
    code: string,
    now: Date,
    driftSeconds: number,
    afterStep: bigint | null,
  ): Promise<Readonly<{ valid: false } | { valid: true; step: bigint }>>;
}

export type IdentityEmailMessage = Readonly<{
  recipient: string;
  token: string;
  expiresAt: Date;
}>;

export interface IdentityEmailPort {
  sendEmailVerification(message: IdentityEmailMessage): Promise<void>;
  sendPasswordReset(message: IdentityEmailMessage): Promise<void>;
}

export type PreAuthChallenge = Readonly<{
  userId: string;
  kind: 'TOTP_VERIFY' | 'TOTP_ENROLL';
  encryptedEnrollmentSecret?: EncryptedValue;
  expiresAt: Date;
}>;

export interface AuthStatePort {
  checkThrottle(keys: readonly string[], now: Date): Promise<number | null>;
  recordFailure(keys: readonly string[], now: Date): Promise<number | null>;
  clearIdentity(key: string): Promise<void>;
  createChallenge(tokenHash: string, challenge: PreAuthChallenge, ttlMs: number): Promise<void>;
  getChallenge(tokenHash: string): Promise<PreAuthChallenge | null>;
  consumeChallenge(tokenHash: string): Promise<PreAuthChallenge | null>;
  recordChallengeFailure(tokenHash: string, maxAttempts: number): Promise<boolean>;
}

export type AuditInput = Readonly<{
  actorUserId: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  before?: Readonly<Record<string, boolean | number | string | null>>;
  after?: Readonly<Record<string, boolean | number | string | null>>;
  metadata: RequestMetadata;
}>;

export interface IdentityTransactionPort {
  createCustomer(
    input: Readonly<{
      id: string;
      email: string;
      displayName: string | null;
      preferredLocale: string;
      passwordCredentialId: string;
      passwordHash: string;
      customerRoleCode: 'CUSTOMER';
      userRoleId: string;
      verificationTokenId: string;
      verificationTokenHash: string;
      verificationExpiresAt: Date;
      audit: AuditInput;
    }>,
  ): Promise<boolean>;
  confirmEmailVerification(tokenHash: string, now: Date, audit: AuditInput): Promise<boolean>;
  completePasswordReset(
    input: Readonly<{
      tokenHash: string;
      passwordHash: string;
      now: Date;
      audit: AuditInput;
    }>,
  ): Promise<boolean>;
  createSession(
    input: Readonly<{
      id: string;
      userId: string;
      kind: SessionKind;
      tokenHash: string;
      ip: string | null;
      userAgentHash: string | null;
      now: Date;
      expiresAt: Date;
      absoluteExpiresAt: Date;
      audit: AuditInput;
    }>,
  ): Promise<void>;
  saveTotpCredential(
    input: Readonly<{
      id: string;
      userId: string;
      encryptedSecret: EncryptedValue;
      acceptedStep: bigint;
      now: Date;
      audit: AuditInput;
    }>,
  ): Promise<void>;
  acceptTotpStep(credentialId: string, step: bigint, now: Date): Promise<boolean>;
  revokeSession(userId: string, sessionId: string, now: Date, audit: AuditInput): Promise<boolean>;
  revokeAllSessions(userId: string, now: Date, audit: AuditInput): Promise<number>;
}

export interface IdentityRepositoryPort {
  transaction<Result>(
    work: (transaction: IdentityTransactionPort) => Promise<Result>,
  ): Promise<Result>;
  findAuthenticationUser(email: string): Promise<AuthenticationUser | null>;
  findAuthenticationUserById(userId: string): Promise<AuthenticationUser | null>;
  findUserByEmail(email: string): Promise<SafeUser | null>;
  findSessionByTokenHash(tokenHash: string): Promise<PersistedSession | null>;
  touchSession(sessionId: string, lastSeenAt: Date, expiresAt: Date): Promise<void>;
  listSessions(
    userId: string,
    now: Date,
    currentSessionId: string,
  ): Promise<readonly SessionSummary[]>;
  requestVerificationToken(
    input: Readonly<{
      email: string;
      tokenId: string;
      tokenHash: string;
      expiresAt: Date;
      now: Date;
    }>,
  ): Promise<SafeUser | null>;
  requestPasswordResetToken(
    input: Readonly<{
      email: string;
      tokenId: string;
      tokenHash: string;
      expiresAt: Date;
      now: Date;
    }>,
  ): Promise<SafeUser | null>;
  appendAudit(input: AuditInput): Promise<void>;
  assignRole(
    input: Readonly<{
      actorUserId: string;
      targetUserId: string;
      role: RoleCode;
      now: Date;
      audit: AuditInput;
    }>,
  ): Promise<boolean>;
}
