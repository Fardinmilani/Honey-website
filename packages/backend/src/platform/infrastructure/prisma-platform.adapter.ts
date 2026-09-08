import {
  createPrismaClient,
  type PrismaClient,
  type TransactionClient,
  withTransaction,
} from '@honey/db';

import type { DatabaseHealthPort } from '../domain/database-health.port.js';
import type { GracefulResource } from '../domain/graceful-resource.js';
import { TransactionContext, type TransactionRunner } from '../domain/transaction.js';

export class PrismaTransactionContext extends TransactionContext {
  constructor(readonly client: TransactionClient) {
    super();
  }
}

export function asPrismaTransaction(transaction: TransactionContext): TransactionClient {
  if (!(transaction instanceof PrismaTransactionContext)) {
    throw new TypeError('Transaction context is not a Prisma transaction.');
  }
  return transaction.client;
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
