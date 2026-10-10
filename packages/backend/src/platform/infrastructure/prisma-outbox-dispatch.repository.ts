import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@honey/db';

import type {
  ClaimedOutboxEvent,
  OutboxClaimOptions,
  OutboxClaimRelease,
  OutboxDispatchConfirmation,
  OutboxDispatchRepository,
  OutboxPendingMetrics,
} from '../domain/outbox-dispatch.js';

type ClaimedRow = Readonly<{
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: Date;
  payload: unknown;
  correlationId: string | null;
  claimToken: string;
  attempts: number;
}>;

type IdRow = Readonly<{ id: string }>;

type BacklogRow = Readonly<{
  pendingCount: bigint;
  oldestPendingAt: Date | null;
  quarantinedCount: bigint;
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const errorCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/u;

function validDate(value: Date | undefined): Date | null {
  if (value === undefined) return null;
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw new TypeError('Expected a valid Date.');
  }
  return value;
}

function assertClaimIdentity(options: OutboxDispatchConfirmation): void {
  if (!uuidPattern.test(options.id) || !uuidPattern.test(options.claimToken)) {
    throw new TypeError('Outbox claim identity must use UUIDs.');
  }
}

function metricCount(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Outbox metric exceeds the safe integer range.');
  }
  return Number(value);
}

/** PostgreSQL leases use one atomic SKIP LOCKED claim, never a process-local lock. */
export class PrismaOutboxDispatchRepository implements OutboxDispatchRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  async claimBatch(options: OutboxClaimOptions): Promise<readonly ClaimedOutboxEvent[]> {
    if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 500) {
      throw new RangeError('Outbox claim limit must be between 1 and 500.');
    }
    if (
      !Number.isSafeInteger(options.leaseMs) ||
      options.leaseMs < 1_000 ||
      options.leaseMs > 600_000
    ) {
      throw new RangeError('Outbox lease must be between 1 second and 10 minutes.');
    }
    const now = validDate(options.now);
    const token = randomUUID();
    const rows = await this.#client.$queryRaw<ClaimedRow[]>`
      WITH claim_clock AS (
        SELECT COALESCE(${now}::timestamptz, statement_timestamp()) AS current_at
      ), eligible AS (
        SELECT event.id
        FROM outbox_event AS event CROSS JOIN claim_clock AS clock
        WHERE event.published_at IS NULL
          AND event.quarantined_at IS NULL
          AND event.next_attempt_at <= clock.current_at
          AND (event.claim_expires_at IS NULL OR event.claim_expires_at <= clock.current_at)
        ORDER BY event.occurred_at, event.id
        LIMIT ${options.limit}
        FOR UPDATE OF event SKIP LOCKED
      )
      UPDATE outbox_event AS event
      SET claim_token = ${token}::uuid,
          claim_expires_at = clock.current_at + (${options.leaseMs} * interval '1 millisecond'),
          attempts = event.attempts + 1,
          updated_at = clock.current_at
      FROM eligible CROSS JOIN claim_clock AS clock
      WHERE event.id = eligible.id
      RETURNING event.id,
                event.aggregate_type AS "aggregateType",
                event.aggregate_id AS "aggregateId",
                event.event_type AS "eventType",
                event.event_version AS "eventVersion",
                event.occurred_at AS "occurredAt",
                event.payload,
                event.correlation_id AS "correlationId",
                event.claim_token AS "claimToken",
                event.attempts
    `;
    return rows
      .map((row) => ({
        id: row.id,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        eventType: row.eventType,
        eventVersion: row.eventVersion,
        occurredAt: row.occurredAt,
        payload: row.payload,
        ...(row.correlationId === null ? {} : { correlationId: row.correlationId }),
        claimToken: row.claimToken,
        attempts: row.attempts,
      }))
      .sort(
        (left, right) =>
          left.occurredAt.valueOf() - right.occurredAt.valueOf() || left.id.localeCompare(right.id),
      );
  }

  async markDispatched(options: OutboxDispatchConfirmation): Promise<boolean> {
    assertClaimIdentity(options);
    const now = validDate(options.now);
    const rows = await this.#client.$queryRaw<IdRow[]>`
      WITH dispatch_clock AS (
        SELECT COALESCE(${now}::timestamptz, statement_timestamp()) AS current_at
      )
      UPDATE outbox_event AS event
      SET published_at = clock.current_at,
          claim_token = NULL,
          claim_expires_at = NULL,
          last_error = NULL,
          updated_at = clock.current_at
      FROM dispatch_clock AS clock
      WHERE event.id = ${options.id}::uuid
        AND event.claim_token = ${options.claimToken}::uuid
        AND event.claim_expires_at > clock.current_at
        AND event.published_at IS NULL
        AND event.quarantined_at IS NULL
      RETURNING event.id
    `;
    return rows.length === 1;
  }

  async releaseClaim(options: OutboxClaimRelease): Promise<boolean> {
    assertClaimIdentity(options);
    if (!errorCodePattern.test(options.errorCode)) {
      throw new TypeError('Outbox error code must be a bounded safe code.');
    }
    const now = validDate(options.now);
    const nextAttemptAt = validDate(options.nextAttemptAt);
    const quarantine = options.quarantine ?? false;
    const rows = await this.#client.$queryRaw<IdRow[]>`
      WITH release_clock AS (
        SELECT COALESCE(${now}::timestamptz, statement_timestamp()) AS current_at
      )
      UPDATE outbox_event AS event
      SET claim_token = NULL,
          claim_expires_at = NULL,
          next_attempt_at = COALESCE(${nextAttemptAt}::timestamptz, clock.current_at),
          quarantined_at = CASE WHEN ${quarantine} THEN clock.current_at ELSE NULL END,
          last_error = ${options.errorCode},
          updated_at = clock.current_at
      FROM release_clock AS clock
      WHERE event.id = ${options.id}::uuid
        AND event.claim_token = ${options.claimToken}::uuid
        AND event.published_at IS NULL
      RETURNING event.id
    `;
    return rows.length === 1;
  }

  async pendingMetrics(): Promise<OutboxPendingMetrics> {
    const rows = await this.#client.$queryRaw<BacklogRow[]>`
      SELECT count(*) FILTER (
               WHERE published_at IS NULL AND quarantined_at IS NULL
             ) AS "pendingCount",
             min(occurred_at) FILTER (
               WHERE published_at IS NULL AND quarantined_at IS NULL
             ) AS "oldestPendingAt",
             count(*) FILTER (
               WHERE published_at IS NULL AND quarantined_at IS NOT NULL
             ) AS "quarantinedCount"
      FROM outbox_event
    `;
    const row = rows[0];
    if (row === undefined) throw new Error('Outbox metrics query returned no row.');
    return {
      pendingCount: metricCount(row.pendingCount),
      oldestPendingAt: row.oldestPendingAt,
      quarantinedCount: metricCount(row.quarantinedCount),
    };
  }

  async close(): Promise<void> {
    await this.#client.$disconnect();
  }
}
