import { Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import { PrismaPlatformAdapter } from '../../platform/index.js';
import { ReviewPurchaseService } from '../orders/index.js';
import { FulfilmentService } from '../fulfilment/index.js';
import { CatalogService } from '../catalog/index.js';
import { ReviewsService } from './application/reviews.service.js';
import { PrismaReviewsRepository } from './infrastructure/prisma-reviews.repository.js';
class Shutdown implements OnApplicationShutdown {
  constructor(
    private readonly repository: PrismaReviewsRepository,
    private readonly transactions: PrismaPlatformAdapter,
  ) {}
  async onApplicationShutdown() {
    await Promise.allSettled([this.repository.close(), this.transactions.close()]);
  }
}
@Module({})
export class ReviewsModule {
  static register(
    options: Readonly<{
      databaseUrl: string;
      enabledLocales: readonly string[];
      ordersModule: DynamicModule;
      fulfilmentModule: DynamicModule;
      catalogModule: DynamicModule;
    }>,
  ): DynamicModule {
    const repository = new PrismaReviewsRepository(options.databaseUrl);
    const transactions = new PrismaPlatformAdapter(options.databaseUrl);
    return {
      module: ReviewsModule,
      imports: [options.ordersModule, options.fulfilmentModule, options.catalogModule],
      providers: [
        {
          provide: ReviewsService,
          inject: [ReviewPurchaseService, FulfilmentService, CatalogService],
          useFactory: (
            purchases: ReviewPurchaseService,
            delivery: FulfilmentService,
            catalog: CatalogService,
          ) =>
            new ReviewsService(
              repository,
              purchases,
              delivery,
              catalog,
              transactions,
              options.enabledLocales,
            ),
        },
        { provide: Shutdown, useValue: new Shutdown(repository, transactions) },
      ],
      exports: [ReviewsService],
    };
  }
}
