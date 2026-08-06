import { createClient, type RedisClientType } from 'redis';

import type { EncryptedValue } from '../domain/identity.js';
import type { AuthStatePort, PreAuthChallenge } from '../domain/ports.js';
import { sha256 } from './identity-crypto.js';

const CHECK_THROTTLE = `
local locked = tonumber(redis.call('HGET', KEYS[1], 'lockedUntil') or '0')
local now = tonumber(ARGV[1])
if locked > now then return locked - now end
return 0
`;

const RECORD_FAILURE = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local maximum = tonumber(ARGV[3])
local base = tonumber(ARGV[4])
local cap = tonumber(ARGV[5])
local started = tonumber(redis.call('HGET', KEYS[1], 'started') or '0')
local failures = tonumber(redis.call('HGET', KEYS[1], 'failures') or '0')
if started == 0 or now - started >= window then
  started = now
  failures = 0
end
failures = failures + 1
local lockedUntil = 0
if failures >= maximum then
  local exponent = failures - maximum
  local duration = math.min(cap, base * (2 ^ exponent))
  lockedUntil = now + duration
end
redis.call('HSET', KEYS[1], 'started', started, 'failures', failures, 'lockedUntil', lockedUntil)
redis.call('PEXPIRE', KEYS[1], window + cap)
if lockedUntil > now then return lockedUntil - now end
return 0
`;

const CONSUME_CHALLENGE = `
local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
redis.call('DEL', KEYS[1] .. ':attempts')
return value
`;

const FAIL_CHALLENGE = `
local count = redis.call('INCR', KEYS[1] .. ':attempts')
local ttl = redis.call('PTTL', KEYS[1])
if ttl > 0 then redis.call('PEXPIRE', KEYS[1] .. ':attempts', ttl) end
if count >= tonumber(ARGV[1]) then
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[1] .. ':attempts')
  return 1
end
return 0
`;

type SerializedChallenge = Readonly<{
  userId: string;
  kind: 'TOTP_VERIFY' | 'TOTP_ENROLL';
  expiresAt: string;
  encryptedEnrollmentSecret?: Readonly<{
    ciphertext: string;
    nonce: string;
    tag: string;
  }>;
}>;

type SerializedEncryptedValue = Readonly<{
  ciphertext: string;
  nonce: string;
  tag: string;
}>;

function serializeEncrypted(value: EncryptedValue): SerializedEncryptedValue {
  return {
    ciphertext: Buffer.from(value.ciphertext).toString('base64'),
    nonce: Buffer.from(value.nonce).toString('base64'),
    tag: Buffer.from(value.tag).toString('base64'),
  };
}

function serialize(challenge: PreAuthChallenge): string {
  const value: SerializedChallenge = {
    userId: challenge.userId,
    kind: challenge.kind,
    expiresAt: challenge.expiresAt.toISOString(),
    ...(challenge.encryptedEnrollmentSecret === undefined
      ? {}
      : { encryptedEnrollmentSecret: serializeEncrypted(challenge.encryptedEnrollmentSecret) }),
  };
  return JSON.stringify(value);
}

function parseString(value: unknown, key: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid challenge ${key}.`);
  }
  return value;
}

function parse(value: string): PreAuthChallenge {
  const decoded: unknown = JSON.parse(value);
  if (decoded === null || typeof decoded !== 'object') throw new Error('Invalid challenge state.');
  const userId = 'userId' in decoded ? parseString(decoded.userId, 'userId') : '';
  const kind = 'kind' in decoded ? decoded.kind : undefined;
  if (kind !== 'TOTP_VERIFY' && kind !== 'TOTP_ENROLL') {
    throw new Error('Invalid challenge kind.');
  }
  const expiresAtText = 'expiresAt' in decoded ? parseString(decoded.expiresAt, 'expiresAt') : '';
  const expiresAt = new Date(expiresAtText);
  if (!Number.isFinite(expiresAt.getTime())) throw new Error('Invalid challenge expiry.');
  if (
    !('encryptedEnrollmentSecret' in decoded) ||
    decoded.encryptedEnrollmentSecret === undefined
  ) {
    return { userId, kind, expiresAt };
  }
  const encrypted = decoded.encryptedEnrollmentSecret;
  if (encrypted === null || typeof encrypted !== 'object') {
    throw new Error('Invalid encrypted challenge state.');
  }
  const ciphertext =
    'ciphertext' in encrypted ? parseString(encrypted.ciphertext, 'ciphertext') : '';
  const nonce = 'nonce' in encrypted ? parseString(encrypted.nonce, 'nonce') : '';
  const tag = 'tag' in encrypted ? parseString(encrypted.tag, 'tag') : '';
  return {
    userId,
    kind,
    expiresAt,
    encryptedEnrollmentSecret: {
      ciphertext: Buffer.from(ciphertext, 'base64'),
      nonce: Buffer.from(nonce, 'base64'),
      tag: Buffer.from(tag, 'base64'),
    },
  };
}

function numberResult(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  throw new Error('Redis script returned an invalid result.');
}

export class RedisAuthStateAdapter implements AuthStatePort {
  readonly #client: RedisClientType;
  #connecting: Promise<unknown> | undefined;

  constructor(
    redisUrl: string,
    private readonly throttle: Readonly<{
      windowMs: number;
      maxFailures: number;
      baseLockMs: number;
      maxLockMs: number;
    }>,
  ) {
    this.#client = createClient({ url: redisUrl });
    this.#client.on('error', () => undefined);
  }

  async #ready(): Promise<void> {
    if (this.#client.isReady) return;
    this.#connecting ??= this.#client.connect();
    await this.#connecting;
  }

  #throttleKey(key: string): string {
    return `identity:throttle:${sha256(key)}`;
  }

  #challengeKey(tokenHash: string): string {
    return `identity:challenge:${tokenHash}`;
  }

  async checkThrottle(keys: readonly string[], now: Date): Promise<number | null> {
    await this.#ready();
    let longest = 0;
    for (const key of keys) {
      const result = await this.#client.eval(CHECK_THROTTLE, {
        keys: [this.#throttleKey(key)],
        arguments: [String(now.getTime())],
      });
      longest = Math.max(longest, numberResult(result));
    }
    return longest > 0 ? longest : null;
  }

  async recordFailure(keys: readonly string[], now: Date): Promise<number | null> {
    await this.#ready();
    let longest = 0;
    for (const key of keys) {
      const result = await this.#client.eval(RECORD_FAILURE, {
        keys: [this.#throttleKey(key)],
        arguments: [
          String(now.getTime()),
          String(this.throttle.windowMs),
          String(this.throttle.maxFailures),
          String(this.throttle.baseLockMs),
          String(this.throttle.maxLockMs),
        ],
      });
      longest = Math.max(longest, numberResult(result));
    }
    return longest > 0 ? longest : null;
  }

  async clearIdentity(key: string): Promise<void> {
    await this.#ready();
    await this.#client.del(this.#throttleKey(key));
  }

  async createChallenge(
    tokenHash: string,
    challenge: PreAuthChallenge,
    ttlMs: number,
  ): Promise<void> {
    await this.#ready();
    const result = await this.#client.set(this.#challengeKey(tokenHash), serialize(challenge), {
      NX: true,
      PX: ttlMs,
    });
    if (result !== 'OK') throw new Error('Could not create authentication challenge.');
  }

  async getChallenge(tokenHash: string): Promise<PreAuthChallenge | null> {
    await this.#ready();
    const value = await this.#client.get(this.#challengeKey(tokenHash));
    return value === null ? null : parse(value);
  }

  async consumeChallenge(tokenHash: string): Promise<PreAuthChallenge | null> {
    await this.#ready();
    const value = await this.#client.eval(CONSUME_CHALLENGE, {
      keys: [this.#challengeKey(tokenHash)],
      arguments: [],
    });
    return typeof value === 'string' ? parse(value) : null;
  }

  async recordChallengeFailure(tokenHash: string, maxAttempts: number): Promise<boolean> {
    await this.#ready();
    const value = await this.#client.eval(FAIL_CHALLENGE, {
      keys: [this.#challengeKey(tokenHash)],
      arguments: [String(maxAttempts)],
    });
    return numberResult(value) === 1;
  }

  async close(): Promise<void> {
    if (this.#client.isOpen) await this.#client.close();
  }
}
