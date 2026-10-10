import {
  type JobFailureRepository,
  type OutboxDispatchRepository,
  type QueueName,
} from '@honey/backend';

import { routeOutboxEvent } from './outbox-routing.js';

export interface JobEnqueuePort {
  add(
    input: Readonly<{ queue: QueueName; name: string; data: unknown; jobId: string }>,
  ): Promise<void>;
}

export type DispatchResult = Readonly<{
  claimed: number;
  enqueued: number;
  deferred: number;
  quarantined: number;
}>;

/** DB lease plus deterministic queue ID closes the enqueue-before-confirm crash window. */
export class OutboxDispatcher {
  constructor(
    private readonly repository: OutboxDispatchRepository,
    private readonly failures: JobFailureRepository,
    private readonly enqueuer: JobEnqueuePort,
  ) {}

  async dispatch(limit: number): Promise<DispatchResult> {
    const claimed = await this.repository.claimBatch({ limit, leaseMs: 60_000 });
    let enqueued = 0;
    let deferred = 0;
    let quarantined = 0;
    for (const event of claimed) {
      let result: ReturnType<typeof routeOutboxEvent>;
      try {
        result = routeOutboxEvent(event);
      } catch {
        // One malformed committed row must never block later rows in the batch.
        result = { disposition: 'UNSUPPORTED_EVENT' };
      }
      if (result.disposition !== 'ENQUEUE') {
        const unsupported = result.disposition === 'UNSUPPORTED_EVENT';
        if (unsupported) {
          try {
            await this.failures.recordTerminalFailure({
              queue: 'outbox',
              jobId: `outbox-${event.id}`,
              name: 'outbox.unsupported',
              payloadVersion: Math.max(1, event.eventVersion),
              correlationId: `outbox-${event.id}`,
              attemptsMade: event.attempts,
              errorCode: 'OUTBOX_UNSUPPORTED_EVENT',
              errorClass: 'PERMANENT',
              terminalCycle: 'dispatch-v1',
            });
          } catch {
            await this.repository.releaseClaim({
              id: event.id,
              claimToken: event.claimToken,
              errorCode: 'OUTBOX_FAILURE_CAPTURE_UNAVAILABLE',
              nextAttemptAt: new Date(Date.now() + 5_000),
            });
            deferred += 1;
            continue;
          }
        }
        await this.repository.releaseClaim({
          id: event.id,
          claimToken: event.claimToken,
          errorCode: unsupported ? 'OUTBOX_UNSUPPORTED_EVENT' : 'OUTBOX_NO_ACTIVE_CONSUMER',
          quarantine: true,
        });
        quarantined += 1;
        continue;
      }
      try {
        await this.enqueuer.add(result.route);
        const marked = await this.repository.markDispatched({
          id: event.id,
          claimToken: event.claimToken,
        });
        if (marked) enqueued += 1;
        else deferred += 1;
      } catch {
        await this.repository.releaseClaim({
          id: event.id,
          claimToken: event.claimToken,
          errorCode: 'OUTBOX_ENQUEUE_UNAVAILABLE',
          nextAttemptAt: new Date(
            Date.now() + Math.min(60_000, 1_000 * 2 ** Math.min(event.attempts, 6)),
          ),
        });
        deferred += 1;
      }
    }
    return { claimed: claimed.length, enqueued, deferred, quarantined };
  }
}
