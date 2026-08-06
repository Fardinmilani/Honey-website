export abstract class TransactionContext {
  readonly #transactionContextBrand = true;
}

export interface TransactionRunner {
  run<Result>(work: (transaction: TransactionContext) => Promise<Result>): Promise<Result>;
}
