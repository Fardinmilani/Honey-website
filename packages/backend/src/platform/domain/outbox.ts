import type { JsonValue } from '../../errors/index.js';
import type { TransactionContext } from './transaction.js';

export type OutboxMessage = Readonly<{
  id: string;
  eventType: string;
  eventVersion: number;
  occurredAt: Date;
  payload: Readonly<Record<string, JsonValue>>;
  correlationId?: string;
}>;

export interface OutboxWriter {
  append(message: OutboxMessage, transaction: TransactionContext): Promise<void>;
}
