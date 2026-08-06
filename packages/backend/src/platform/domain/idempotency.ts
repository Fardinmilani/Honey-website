import type { JsonValue } from '../../errors/index.js';
import type { TransactionContext } from './transaction.js';

export type IdempotencyRecord = Readonly<{
  scope: string;
  key: string;
  requestHash: string;
  statusCode: number;
  response: JsonValue;
  expiresAt: Date;
}>;

export interface IdempotencyStore {
  find(scope: string, key: string): Promise<IdempotencyRecord | undefined>;
  save(record: IdempotencyRecord, transaction?: TransactionContext): Promise<void>;
}
