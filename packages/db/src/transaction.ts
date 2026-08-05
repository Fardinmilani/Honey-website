import type { Prisma, PrismaClient } from './generated/prisma/client.js';

export type TransactionClient = Prisma.TransactionClient;
export type TransactionWork<Result> = (transaction: TransactionClient) => Promise<Result>;

export function withTransaction<Result>(
  client: PrismaClient,
  work: TransactionWork<Result>,
): Promise<Result> {
  return client.$transaction((transaction) => work(transaction));
}
