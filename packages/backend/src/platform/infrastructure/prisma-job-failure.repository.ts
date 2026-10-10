import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@honey/db';

import type {
  JobFailureErrorClass,
  JobFailureRepository,
  RecordedJobFailure,
  TerminalJobFailure,
} from '../domain/job-failure.js';

type IdRow = Readonly<{ id: string }>;
type CountRow = Readonly<{ queue: string; count: bigint }>;

const queuePattern = /^[a-z][a-z0-9-]{0,63}$/u;
const namePattern = /^[a-z][a-z0-9._-]{0,127}$/u;
const jobIdPattern = /^[A-Za-z0-9_.:-]{1,200}$/u;
const cyclePattern = /^[A-Za-z0-9_-]{1,80}$/u;
const correlationPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const errorCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/u;

function safeErrorDescription(errorClass: JobFailureErrorClass): string {
  switch (errorClass) {
    case 'TRANSIENT':
      return 'Transient job failure became terminal.';
    case 'PERMANENT':
      return 'Permanent job failure.';
    case 'EXHAUSTED':
      return 'Job exhausted its bounded retry attempts.';
    default:
      throw new TypeError('Unknown terminal error class.');
  }
}

function validateFailure(failure: TerminalJobFailure): Date {
  if (!queuePattern.test(failure.queue)) throw new TypeError('Invalid queue name.');
  if (!jobIdPattern.test(failure.jobId)) throw new TypeError('Invalid safe job ID.');
  if (!namePattern.test(failure.name)) throw new TypeError('Invalid job name.');
  if (!cyclePattern.test(failure.terminalCycle)) throw new TypeError('Invalid terminal cycle.');
  if (!errorCodePattern.test(failure.errorCode)) throw new TypeError('Invalid safe error code.');
  if (failure.correlationId !== undefined && !correlationPattern.test(failure.correlationId)) {
    throw new TypeError('Invalid safe correlation ID.');
  }
  if (!Number.isSafeInteger(failure.payloadVersion) || failure.payloadVersion < 1) {
    throw new RangeError('Payload version must be a positive integer.');
  }
  if (!Number.isSafeInteger(failure.attemptsMade) || failure.attemptsMade < 0) {
    throw new RangeError('Attempt count must be a non-negative integer.');
  }
  const failedAt = failure.failedAt ?? new Date();
  if (!(failedAt instanceof Date) || Number.isNaN(failedAt.valueOf())) {
    throw new TypeError('Failure time must be a valid Date.');
  }
  return failedAt;
}

/** Durable terminal capture with safe, fixed messages and one row per failure cycle. */
export class PrismaJobFailureRepository implements JobFailureRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  async recordTerminalFailure(failure: TerminalJobFailure): Promise<RecordedJobFailure> {
    const failedAt = validateFailure(failure);
    const description = safeErrorDescription(failure.errorClass);
    const id = randomUUID();
    const rows = await this.#client.$queryRaw<IdRow[]>`
      INSERT INTO job_failure (
        id, queue, job_id, name, payload, payload_version, correlation_id,
        attempts_made, error_code, error_class, error, terminal_cycle,
        failed_at, last_attempt_at, created_at, updated_at
      ) VALUES (
        ${id}::uuid, ${failure.queue}, ${failure.jobId}, ${failure.name},
        '{}'::jsonb, ${failure.payloadVersion}, ${failure.correlationId ?? null},
        ${failure.attemptsMade}, ${failure.errorCode}, ${failure.errorClass},
        ${description}, ${failure.terminalCycle},
        ${failedAt}, ${failedAt}, ${failedAt}, ${failedAt}
      )
      ON CONFLICT (queue, job_id, terminal_cycle) DO NOTHING
      RETURNING id
    `;
    const created = rows[0];
    if (created !== undefined) return { id: created.id, created: true };
    const existing = await this.#client.$queryRaw<IdRow[]>`
      SELECT id FROM job_failure
      WHERE queue = ${failure.queue}
        AND job_id = ${failure.jobId}
        AND terminal_cycle = ${failure.terminalCycle}
      LIMIT 1
    `;
    const prior = existing[0];
    if (prior === undefined) throw new Error('Terminal failure dedupe row disappeared.');
    return { id: prior.id, created: false };
  }

  async countUnresolvedByQueue(): Promise<Readonly<Record<string, number>>> {
    const rows = await this.#client.$queryRaw<CountRow[]>`
      SELECT queue, count(*) AS count
      FROM job_failure
      WHERE resolved_at IS NULL
      GROUP BY queue
    `;
    const result: Record<string, number> = {};
    for (const row of rows) {
      if (row.count > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new RangeError('Job failure count exceeds the safe integer range.');
      }
      result[row.queue] = Number(row.count);
    }
    return result;
  }

  async close(): Promise<void> {
    await this.#client.$disconnect();
  }
}
