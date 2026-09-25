import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { CartService } from '../cart/index.js';
import { InventoryService } from '../inventory/index.js';
import { OrdersService } from '../orders/index.js';
import { PricingService } from '../pricing/index.js';
import { TRANSACTION_RUNNER } from '../../platform/domain/tokens.js';
import type { TransactionRunner } from '../../platform/domain/transaction.js';
import { CheckoutService } from './application/checkout.service.js';
import type { CheckoutRepository } from './domain/checkout.js';
import { PrismaCheckoutRepository } from './infrastructure/prisma-checkout.repository.js';
import { StandardShippingQuoteService } from './shipping/application/standard-shipping-quote.service.js';
import type { StandardShippingQuoteConfiguration } from './shipping/domain/standard-shipping-quote.js';
import type { CheckoutShippingQuoteRepository } from './shipping/domain/checkout-shipping-quote.port.js';
import { PrismaCheckoutShippingQuoteRepository } from './shipping/infrastructure/prisma-checkout-shipping-quote.repository.js';

export type CheckoutModuleOptions = Readonly<{
  databaseUrl: string;
  standardShipping: StandardShippingQuoteConfiguration;
  cartModule: DynamicModule;
  pricingModule: DynamicModule;
  inventoryModule: DynamicModule;
  ordersModule: DynamicModule;
  platformModule: DynamicModule;
  overrides?: Readonly<{
    repository?: CheckoutRepository;
    shippingRepository?: CheckoutShippingQuoteRepository;
  }>;
}>;

class CheckoutShutdownLifecycle implements OnApplicationShutdown {
  constructor(private readonly closeResources: () => Promise<void>) {}

  onApplicationShutdown(): Promise<void> {
    return this.closeResources();
  }
}

@Module({})
export class CheckoutModule {
  static register(options: CheckoutModuleOptions): DynamicModule {
    const ownedRepository =
      options.overrides?.repository === undefined
        ? new PrismaCheckoutRepository(options.databaseUrl)
        : undefined;
    const repository = options.overrides?.repository ?? ownedRepository;
    const ownedShippingRepository =
      options.overrides?.shippingRepository === undefined
        ? new PrismaCheckoutShippingQuoteRepository(options.databaseUrl)
        : undefined;
    const shippingRepository = options.overrides?.shippingRepository ?? ownedShippingRepository;
    if (repository === undefined || shippingRepository === undefined) {
      throw new Error('Checkout module configuration failed.');
    }
    const shipping = new StandardShippingQuoteService(shippingRepository, options.standardShipping);
    const providers: Provider[] = [
      {
        provide: CheckoutService,
        useFactory: (
          cart: CartService,
          pricing: PricingService,
          inventory: InventoryService,
          orders: OrdersService,
          transactions: TransactionRunner,
        ) => new CheckoutService(repository, cart, pricing, inventory, orders, shipping, transactions),
        inject: [CartService, PricingService, InventoryService, OrdersService, TRANSACTION_RUNNER],
      },
      {
        provide: CheckoutShutdownLifecycle,
        useValue: new CheckoutShutdownLifecycle(async () => {
          await Promise.all([ownedRepository?.close(), ownedShippingRepository?.close()]);
        }),
      },
    ];
    return {
      module: CheckoutModule,
      imports: [
        options.platformModule,
        options.cartModule,
        options.pricingModule,
        options.inventoryModule,
        options.ordersModule,
      ],
      providers,
      exports: [CheckoutService],
    };
  }
}
