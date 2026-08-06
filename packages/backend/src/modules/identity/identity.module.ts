import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { IdentityService } from './application/identity.service.js';
import type { IdentityConfig } from './domain/identity.js';
import type {
  AuthStatePort,
  BreachedPasswordPort,
  ClockPort,
  IdentityEmailPort,
  IdentityRepositoryPort,
  PasswordHasherPort,
  SecretCipherPort,
  TotpPort,
} from './domain/ports.js';
import {
  Aes256GcmSecretCipher,
  Argon2PasswordHasher,
  PwnedPasswordsKAnonymityAdapter,
  Rfc6238Totp,
} from './infrastructure/identity-crypto.js';
import { PrismaIdentityRepository } from './infrastructure/prisma-identity.repository.js';
import { RedisAuthStateAdapter } from './infrastructure/redis-auth-state.adapter.js';
import {
  SmtpIdentityEmailAdapter,
  type IdentitySmtpConfig,
} from './infrastructure/smtp-identity-email.adapter.js';
import { SystemClock } from './application/identity.service.js';

export type IdentityModuleOverrides = Readonly<{
  repository?: IdentityRepositoryPort;
  passwordHasher?: PasswordHasherPort;
  breachedPasswords?: BreachedPasswordPort;
  cipher?: SecretCipherPort;
  totp?: TotpPort;
  authState?: AuthStatePort;
  email?: IdentityEmailPort;
  clock?: ClockPort;
}>;

export type IdentityModuleOptions = Readonly<{
  config: IdentityConfig;
  databaseUrl: string;
  redisUrl: string;
  totpEncryptionKey: string;
  breachedPasswordEndpoint: string;
  breachedPasswordTimeoutMs: number;
  smtp: IdentitySmtpConfig;
  overrides?: IdentityModuleOverrides;
}>;

class IdentityShutdownLifecycle implements OnApplicationShutdown {
  constructor(private readonly closeResources: () => Promise<void>) {}

  onApplicationShutdown(): Promise<void> {
    return this.closeResources();
  }
}

@Module({})
export class IdentityModule {
  static register(options: IdentityModuleOptions): DynamicModule {
    const ownedRepository =
      options.overrides?.repository === undefined
        ? new PrismaIdentityRepository(options.databaseUrl)
        : undefined;
    const repository = options.overrides?.repository ?? ownedRepository;
    if (repository === undefined) throw new Error('Identity repository configuration failed.');
    const ownedAuthState =
      options.overrides?.authState === undefined
        ? new RedisAuthStateAdapter(options.redisUrl, options.config.authThrottle)
        : undefined;
    const authState = options.overrides?.authState ?? ownedAuthState;
    if (authState === undefined) throw new Error('Identity auth-state configuration failed.');
    const ownedEmail =
      options.overrides?.email === undefined
        ? new SmtpIdentityEmailAdapter(options.smtp)
        : undefined;
    const email = options.overrides?.email ?? ownedEmail;
    if (email === undefined) throw new Error('Identity email configuration failed.');
    const passwordHasher =
      options.overrides?.passwordHasher ?? new Argon2PasswordHasher(options.config.password);
    const breachedPasswords =
      options.overrides?.breachedPasswords ??
      new PwnedPasswordsKAnonymityAdapter(
        options.breachedPasswordEndpoint,
        options.breachedPasswordTimeoutMs,
      );
    const cipher =
      options.overrides?.cipher ?? new Aes256GcmSecretCipher(options.totpEncryptionKey);
    const totp = options.overrides?.totp ?? new Rfc6238Totp();
    const clock = options.overrides?.clock ?? new SystemClock();
    const service = new IdentityService({
      config: options.config,
      repository,
      passwordHasher,
      breachedPasswords,
      cipher,
      totp,
      authState,
      email,
      clock,
    });
    const providers: Provider[] = [
      { provide: IdentityService, useValue: service },
      {
        provide: IdentityShutdownLifecycle,
        useValue: new IdentityShutdownLifecycle(async () => {
          await Promise.allSettled([
            ownedRepository?.close(),
            ownedAuthState?.close(),
            Promise.resolve(ownedEmail?.close()),
          ]);
        }),
      },
    ];
    return { module: IdentityModule, providers, exports: [IdentityService] };
  }
}
