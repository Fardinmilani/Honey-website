import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import argon2 from 'argon2';
import { generateSecret, generateURI, verify } from 'otplib';

import type { IdentityConfig, EncryptedValue } from '../domain/identity.js';
import type {
  BreachedPasswordPort,
  PasswordHasherPort,
  SecretCipherPort,
  TotpPort,
} from '../domain/ports.js';

export function randomOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function userAgentHash(value: string | undefined): string | null {
  return value === undefined || value.length === 0 ? null : sha256(value.slice(0, 512));
}

export class Argon2PasswordHasher implements PasswordHasherPort {
  readonly #memoryCost: number;
  readonly #timeCost: number;
  readonly #parallelism: 1;
  #dummyHash: Promise<string> | undefined;

  constructor(config: IdentityConfig['password']) {
    if (config.memoryCostKiB < 65_536 || config.timeCost < 3 || config.parallelism !== 1) {
      throw new TypeError('Argon2id configuration is below the documented security minimum.');
    }
    this.#memoryCost = config.memoryCostKiB;
    this.#timeCost = config.timeCost;
    this.#parallelism = config.parallelism;
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.#memoryCost,
      timeCost: this.#timeCost,
      parallelism: this.#parallelism,
    });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  async verifyDummy(password: string): Promise<void> {
    this.#dummyHash ??= this.hash('fixed dummy credential for timing equalization');
    await this.verify(await this.#dummyHash, password);
  }
}

export class Aes256GcmSecretCipher implements SecretCipherPort {
  readonly #key: Buffer;

  constructor(base64Key: string) {
    this.#key = Buffer.from(base64Key, 'base64');
    if (this.#key.length !== 32) {
      throw new TypeError('TOTP encryption key must decode to exactly 32 bytes.');
    }
  }

  encrypt(value: string): EncryptedValue {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.#key, nonce);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return { ciphertext, nonce, tag: cipher.getAuthTag() };
  }

  decrypt(value: EncryptedValue): string {
    const decipher = createDecipheriv('aes-256-gcm', this.#key, value.nonce);
    decipher.setAuthTag(value.tag);
    return Buffer.concat([decipher.update(value.ciphertext), decipher.final()]).toString('utf8');
  }
}

export class Rfc6238Totp implements TotpPort {
  generateSecret(): string {
    return generateSecret({ length: 20 });
  }

  provisioningUri(email: string, issuer: string, secret: string): string {
    return generateURI({ issuer, label: email, secret, algorithm: 'sha1', digits: 6, period: 30 });
  }

  async verify(
    secret: string,
    code: string,
    now: Date,
    driftSeconds: number,
    afterStep: bigint | null,
  ): Promise<Readonly<{ valid: false } | { valid: true; step: bigint }>> {
    if (!/^\d{6}$/u.test(code)) return { valid: false };
    const result = await verify({
      strategy: 'totp',
      secret,
      token: code,
      epoch: now.getTime() / 1_000,
      epochTolerance: driftSeconds,
      ...(afterStep === null ? {} : { afterTimeStep: Number(afterStep) }),
    });
    return result.valid && 'timeStep' in result
      ? { valid: true, step: BigInt(result.timeStep) }
      : { valid: false };
  }
}

export class PwnedPasswordsKAnonymityAdapter implements BreachedPasswordPort {
  constructor(
    private readonly endpoint: string,
    private readonly timeoutMs: number,
  ) {}

  async isBreached(password: string): Promise<boolean> {
    const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.endpoint}${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'honey-identity' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Breached-password service unavailable.');
      for (const line of (await response.text()).split(/\r?\n/u)) {
        const [candidate] = line.split(':', 1);
        if (candidate !== undefined) {
          const left = Buffer.from(candidate.padEnd(suffix.length, '0'));
          const right = Buffer.from(suffix);
          if (left.length === right.length && timingSafeEqual(left, right)) return true;
        }
      }
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
