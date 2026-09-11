import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { InventoryService } from '../inventory/index.js';
import { MediaService } from '../media/index.js';
import { PricingService } from '../pricing/index.js';
import { CartService } from './application/cart.service.js';
import type {
  CartAvailabilityPort,
  CartConfig,
  CartPricingPort,
  CartRepository,
} from './domain/cart.js';
import type { CartMediaPort } from './domain/cart-media.port.js';
import { InventoryCartAvailabilityAdapter } from './infrastructure/inventory-cart-availability.adapter.js';
import { MediaCartAdapter } from './infrastructure/media-cart.adapter.js';
import { PricingCartAdapter } from './infrastructure/pricing-cart.adapter.js';
import { PrismaCartRepository } from './infrastructure/prisma-cart.repository.js';

export type CartModuleOverrides = Readonly<{
  repository?: CartRepository;
  availability?: CartAvailabilityPort;
  pricing?: CartPricingPort;
  media?: CartMediaPort;
}>;

export type CartModuleOptions = Readonly<{
  databaseUrl: string;
  config: CartConfig;
  inventoryModule?: DynamicModule;
  pricingModule?: DynamicModule;
  mediaModule?: DynamicModule;
  overrides?: CartModuleOverrides;
}>;

class CartShutdownLifecycle implements OnApplicationShutdown {
  constructor(private readonly closeResources: () => Promise<void>) {}

  onApplicationShutdown(): Promise<void> {
    return this.closeResources();
  }
}

@Module({})
export class CartModule {
  static register(options: CartModuleOptions): DynamicModule {
    const ownedRepository =
      options.overrides?.repository === undefined
        ? new PrismaCartRepository(options.databaseUrl)
        : undefined;
    const repository = options.overrides?.repository ?? ownedRepository;
    if (repository === undefined) throw new Error('Cart module configuration failed.');
    const inject: (typeof InventoryService | typeof PricingService | typeof MediaService)[] = [];
    if (options.overrides?.availability === undefined && options.inventoryModule !== undefined) {
      inject.push(InventoryService);
    }
    if (options.overrides?.pricing === undefined && options.pricingModule !== undefined) {
      inject.push(PricingService);
    }
    if (options.overrides?.media === undefined && options.mediaModule !== undefined) {
      inject.push(MediaService);
    }
    const providers: Provider[] = [
      {
        provide: CartService,
        inject,
        useFactory: (...dependencies: unknown[]) => {
          let offset = 0;
          const inventory =
            options.overrides?.availability === undefined && options.inventoryModule !== undefined
              ? (dependencies[offset++] as InventoryService | undefined)
              : undefined;
          const pricing =
            options.overrides?.pricing === undefined && options.pricingModule !== undefined
              ? (dependencies[offset++] as PricingService | undefined)
              : undefined;
          const mediaService =
            options.overrides?.media === undefined && options.mediaModule !== undefined
              ? (dependencies[offset++] as MediaService | undefined)
              : undefined;
          const availability =
            options.overrides?.availability ??
            (inventory === undefined ? undefined : new InventoryCartAvailabilityAdapter(inventory));
          const pricingPort =
            options.overrides?.pricing ??
            (pricing === undefined ? undefined : new PricingCartAdapter(pricing));
          const media =
            options.overrides?.media ??
            (mediaService === undefined ? undefined : new MediaCartAdapter(mediaService));
          if (availability === undefined || pricingPort === undefined || media === undefined) {
            throw new Error('Cart module boundaries are not configured.');
          }
          return new CartService(repository, availability, pricingPort, options.config, media);
        },
      },
      {
        provide: CartShutdownLifecycle,
        useValue: new CartShutdownLifecycle(async () => {
          await ownedRepository?.close();
        }),
      },
    ];
    return {
      module: CartModule,
      imports: [
        ...(options.inventoryModule === undefined ? [] : [options.inventoryModule]),
        ...(options.pricingModule === undefined ? [] : [options.pricingModule]),
        ...(options.mediaModule === undefined ? [] : [options.mediaModule]),
      ],
      providers,
      exports: [CartService],
    };
  }
}
