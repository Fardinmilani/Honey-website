import {
  createPrismaClient,
  type PrismaClient,
  type TransactionClient,
  withTransaction,
} from '@honey/db';

import type { DatabaseHealthPort } from '../domain/database-health.port.js';
import type { GracefulResource } from '../domain/graceful-resource.js';
import { TransactionContext, type TransactionRunner } from '../domain/transaction.js';

class PrismaTransactionContext extends TransactionContext {
  constructor(readonly client: TransactionClient) {
    super();
  }
}

export class PrismaPlatformAdapter
  implements DatabaseHealthPort, TransactionRunner, GracefulResource
{
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  async check(): Promise<void> {
    await this.#client.$queryRaw`SELECT 1`;
  }

  run<Result>(work: (transaction: TransactionContext) => Promise<Result>): Promise<Result> {
    return withTransaction(this.#client, (client) => work(new PrismaTransactionContext(client)));
  }

  async close(): Promise<void> {
    await this.#client.$disconnect();
  }
}
