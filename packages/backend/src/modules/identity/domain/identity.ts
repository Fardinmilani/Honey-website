export const ROLE_CODES = [
  'OWNER',
  'ADMIN',
  'ORDER_MANAGER',
  'INVENTORY_MANAGER',
  'CONTENT_EDITOR',
  'SUPPORT',
  'CUSTOMER',
] as const;

export const PERMISSION_CODES = [
  'catalog:read',
  'catalog:write',
  'catalog:publish',
  'inventory:read',
  'inventory:adjust',
  'procurement:read',
  'procurement:write',
  'order:read',
  'order:write',
  'order:refund',
  'order:cancel',
  'customer:read',
  'customer:export',
  'content:read',
  'content:write',
  'content:publish',
  'review:moderate',
  'settings:read',
  'settings:write',
  'role:grant',
  'audit:read',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];
export type PermissionCode = (typeof PERMISSION_CODES)[number];
export type SessionKind = 'CUSTOMER' | 'STAFF';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export type RequestMetadata = Readonly<{
  requestId: string;
  clientIp?: string;
  userAgent?: string;
}>;

export type SafeUser = Readonly<{
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  preferredLocale: string;
  status: UserStatus;
  isStaff: boolean;
  roles: readonly RoleCode[];
  permissions: readonly PermissionCode[];
}>;

export type AuthenticatedPrincipal = Readonly<{
  userId: string;
  sessionId: string;
  kind: SessionKind;
  permissions: readonly PermissionCode[];
}>;

export type EncryptedValue = Readonly<{
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  tag: Uint8Array;
}>;

export type PasswordCredential = Readonly<{
  id: string;
  secretHash: string;
}>;

export type TotpCredential = Readonly<{
  id: string;
  encryptedSecret: EncryptedValue;
  lastAcceptedStep: bigint | null;
}>;

export type AuthenticationUser = SafeUser &
  Readonly<{
    passwordCredential: PasswordCredential | null;
    totpCredential: TotpCredential | null;
  }>;

export type PersistedSession = Readonly<{
  id: string;
  user: SafeUser;
  kind: SessionKind;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
}>;

export type SessionSummary = Readonly<{
  id: string;
  kind: SessionKind;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgentHash: string | null;
}>;

export type IdentityConfig = Readonly<{
  password: Readonly<{
    memoryCostKiB: number;
    timeCost: number;
    parallelism: 1;
    minLength: number;
    maxLength: number;
  }>;
  session: Readonly<{
    customerIdleMs: number;
    customerAbsoluteMs: number;
    staffIdleMs: number;
    staffAbsoluteMs: number;
    touchIntervalMs: number;
  }>;
  verificationTokenTtlMs: number;
  passwordResetTtlMs: number;
  preAuthChallengeTtlMs: number;
  totpIssuer: string;
  totpDriftSeconds: number;
  authThrottle: Readonly<{
    windowMs: number;
    maxFailures: number;
    baseLockMs: number;
    maxLockMs: number;
  }>;
}>;

export function normalizeEmail(email: string): string {
  return email.normalize('NFC').trim().toLowerCase();
}

export function assertPasswordShape(password: string, config: IdentityConfig['password']): void {
  const length = Array.from(password).length;
  if (length < config.minLength || length > config.maxLength) {
    throw new TypeError('Password length is outside the accepted range.');
  }
  for (const character of password) {
    const point = character.codePointAt(0);
    if (point !== undefined && point >= 0xd800 && point <= 0xdfff) {
      throw new TypeError('Password contains an unpaired surrogate.');
    }
  }
}

export function ownsResource(principal: AuthenticatedPrincipal, ownerUserId: string): boolean {
  return principal.userId === ownerUserId;
}
