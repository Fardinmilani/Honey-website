import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { IdentityService } from '../identity/index.js';
import { ForbiddenAppError } from '../../errors/index.js';
import { TRANSACTION_RUNNER } from '../../platform/domain/tokens.js';
import type { TransactionRunner } from '../../platform/domain/transaction.js';
import { PaymentsService, type StepUpPort } from './application/payments.service.js';
import type { PaymentProvider, PaymentsRepository } from './domain/payments.js';
import { IdentityStepUpAdapter } from './infrastructure/identity-step-up.adapter.js';
import { PrismaPaymentsRepository } from './infrastructure/prisma-payments.repository.js';
import { FakePaymentProvider } from './infrastructure/providers/fake-payment-provider.js';
import {
  ZarinpalPaymentProvider,
  type ZarinpalConfig,
} from './infrastructure/providers/zarinpal/zarinpal-payment-provider.js';

export type PaymentsModuleOptions = Readonly<{
  databaseUrl: string;
  defaultProvider: 'mock' | 'zarinpal';
  callbackUrl: string;
  requestTimeoutMs: number;
  reconciliationMinAgeMs: number;
  zarinpal: Omit<ZarinpalConfig, 'requestTimeoutMs'>;
  identityModule: DynamicModule;
  platformModule: DynamicModule;
  overrides?: Readonly<{
    repository?: PaymentsRepository;
    providers?: ReadonlyMap<string, PaymentProvider>;
  }>;
}>;

export type WorkerPaymentsModuleOptions = Omit<PaymentsModuleOptions, 'identityModule'>;

function createPaymentDependencies(options: WorkerPaymentsModuleOptions) {
  const ownedRepository =
    options.overrides?.repository === undefined
      ? new PrismaPaymentsRepository(options.databaseUrl)
      : undefined;
  const repository = options.overrides?.repository ?? ownedRepository;
  if (repository === undefined) throw new Error('Payments module configuration failed.');
  const providers: ReadonlyMap<string, PaymentProvider> =
    options.overrides?.providers ??
    (options.defaultProvider === 'mock'
      ? new Map<string, PaymentProvider>([
          ['mock', new FakePaymentProvider()],
          [
            'zarinpal',
            new ZarinpalPaymentProvider({
              ...options.zarinpal,
              requestTimeoutMs: options.requestTimeoutMs,
            }),
          ],
        ])
      : new Map<string, PaymentProvider>([
          [
            'zarinpal',
            new ZarinpalPaymentProvider({
              ...options.zarinpal,
              requestTimeoutMs: options.requestTimeoutMs,
            }),
          ],
        ]));
  return { ownedRepository, repository, providers };
}

class PaymentsShutdownLifecycle implements OnApplicationShutdown {
  constructor(private readonly closeResources: () => Promise<void>) {}

  onApplicationShutdown(): Promise<void> {
    return this.closeResources();
  }
}

@Module({})
export class PaymentsModule {
  static register(options: PaymentsModuleOptions): DynamicModule {
    const { ownedRepository, repository, providers } = createPaymentDependencies(options);
    const providersList: Provider[] = [
      {
        provide: PaymentsService,
        useFactory: (transactions: TransactionRunner, identity: IdentityService) =>
          new PaymentsService(
            repository,
            providers,
            options.defaultProvider,
            transactions,
            new IdentityStepUpAdapter(identity),
            options.callbackUrl,
            options.reconciliationMinAgeMs,
          ),
        inject: [TRANSACTION_RUNNER, IdentityService],
      },
      {
        provide: PaymentsShutdownLifecycle,
        useValue: new PaymentsShutdownLifecycle(async () => {
          await ownedRepository?.close();
        }),
      },
    ];
    return {
      module: PaymentsModule,
      imports: [options.platformModule, options.identityModule],
      providers: providersList,
      exports: [PaymentsService],
    };
  }

  /** The headless worker needs provider reconciliation, never a human refund path. */
  static registerWorkerReconciliation(options: WorkerPaymentsModuleOptions): DynamicModule {
    const { ownedRepository, repository, providers } = createPaymentDependencies(options);
    const denyHumanStepUp: StepUpPort = {
      requireStepUp: () => Promise.reject(new ForbiddenAppError({ code: 'STAFF_REQUIRED' })),
    };
    const providersList: Provider[] = [
      {
        provide: PaymentsService,
        useFactory: (transactions: TransactionRunner) =>
          new PaymentsService(
            repository,
            providers,
            options.defaultProvider,
            transactions,
            denyHumanStepUp,
            options.callbackUrl,
            options.reconciliationMinAgeMs,
          ),
        inject: [TRANSACTION_RUNNER],
      },
      {
        provide: PaymentsShutdownLifecycle,
        useValue: new PaymentsShutdownLifecycle(async () => {
          await ownedRepository?.close();
        }),
      },
    ];
    return {
      module: PaymentsModule,
      imports: [options.platformModule],
      providers: providersList,
      exports: [PaymentsService],
    };
  }
}
