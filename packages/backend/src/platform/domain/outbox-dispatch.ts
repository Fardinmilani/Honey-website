/** A committed domain event leased for transport to a deterministic queue job. */
export type ClaimedOutboxEvent = Readonly<{
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: Date;
  payload: unknown;
  correlationId?: string;
  claimToken: string;
  attempts: number;
}>;

export type OutboxClaimOptions = Readonly<{
  limit: number;
  leaseMs: number;
  now?: Date;
}>;

export type OutboxDispatchConfirmation = Readonly<{
  id: string;
  claimToken: string;
  now?: Date;
}>;

export type OutboxClaimRelease = OutboxDispatchConfirmation &
  Readonly<{
    errorCode: string;
    nextAttemptAt?: Date;
    quarantine?: boolean;
  }>;

export type OutboxPendingMetrics = Readonly<{
  pendingCount: number;
  oldestPendingAt: Date | null;
  quarantinedCount: number;
}>;

export interface OutboxDispatchRepository {
  claimBatch(options: OutboxClaimOptions): Promise<readonly ClaimedOutboxEvent[]>;
  markDispatched(options: OutboxDispatchConfirmation): Promise<boolean>;
  releaseClaim(options: OutboxClaimRelease): Promise<boolean>;
  pendingMetrics(): Promise<OutboxPendingMetrics>;
  close(): Promise<void>;
}
