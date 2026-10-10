import { describe, expect, it } from 'vitest';

import type {
  ClaimedOutboxEvent,
  JobFailureRepository,
  OutboxClaimOptions,
  OutboxClaimRelease,
  OutboxDispatchConfirmation,
  OutboxDispatchRepository,
  TerminalJobFailure,
} from '@honey/backend';

import { OutboxDispatcher, type JobEnqueuePort } from './outbox-dispatcher.js';
import { routeOutboxEvent } from './outbox-routing.js';

const EVENT: ClaimedOutboxEvent = {
  id: '52a7004f-227d-447b-bbad-4a554f24066d',
  aggregateType: 'product',
  aggregateId: '6f22b221-e810-4987-becf-e1a9db889111',
  eventType: 'catalog.product.published',
  eventVersion: 1,
  occurredAt: new Date('2026-10-01T00:00:00.000Z'),
  payload: { aggregateId: '6f22b221-e810-4987-becf-e1a9db889111', version: 1 },
  claimToken: 'claim-1',
  attempts: 1,
};

class FakeOutbox implements OutboxDispatchRepository {
  current: ClaimedOutboxEvent[] = [EVENT];
  marked = 0;
  released: OutboxClaimRelease[] = [];
  failMarkOnce = false;

  claimBatch(_options: OutboxClaimOptions): Promise<readonly ClaimedOutboxEvent[]> {
    return Promise.resolve(this.current);
  }
  markDispatched(_options: OutboxDispatchConfirmation): Promise<boolean> {
    if (this.failMarkOnce) {
      this.failMarkOnce = false;
      return Promise.reject(new Error('simulated DB crash after Redis accepted the job'));
    }
    this.marked += 1;
    this.current = [];
    return Promise.resolve(true);
  }
  releaseClaim(options: OutboxClaimRelease): Promise<boolean> {
    this.released.push(options);
    return Promise.resolve(true);
  }
  pendingMetrics() {
    return Promise.resolve({
      pendingCount: this.current.length,
      oldestPendingAt: null,
      quarantinedCount: 0,
    });
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeFailures implements JobFailureRepository {
  readonly rows: TerminalJobFailure[] = [];
  countUnresolvedByQueue(): Promise<Readonly<Record<string, number>>> {
    return Promise.resolve({ outbox: this.rows.length });
  }
  recordTerminalFailure(row: TerminalJobFailure) {
    this.rows.push(row);
    return Promise.resolve({ id: 'failure-id', created: true });
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeEnqueuer implements JobEnqueuePort {
  readonly jobs = new Map<string, unknown>();
  failOnce = false;
  add(input: Readonly<{ jobId: string; data: unknown }>): Promise<void> {
    if (this.failOnce) {
      this.failOnce = false;
      return Promise.reject(new Error('simulated Redis outage'));
    }
    this.jobs.set(input.jobId, input.data);
    return Promise.resolve();
  }
}

describe('outbox routing and crash windows', () => {
  it('routes only known catalog events to a deterministic targeted cache job', () => {
    const first = routeOutboxEvent(EVENT);
    const second = routeOutboxEvent(EVENT);
    expect(first).toEqual(second);
    expect(first.disposition).toBe('ENQUEUE');
    if (first.disposition === 'ENQUEUE') {
      expect(first.route.queue).toBe('cache');
      expect(first.route.data).toMatchObject({
        payload: { scope: 'product', id: EVENT.aggregateId },
        eventId: EVENT.id,
      });
    }
  });

  it('enqueues one logical job after Redis acceptance but before DB confirmation crash', async () => {
    const outbox = new FakeOutbox();
    outbox.failMarkOnce = true;
    const enqueuer = new FakeEnqueuer();
    const dispatcher = new OutboxDispatcher(outbox, new FakeFailures(), enqueuer);
    expect((await dispatcher.dispatch(10)).deferred).toBe(1);
    expect(outbox.marked).toBe(0);
    expect((await dispatcher.dispatch(10)).enqueued).toBe(1);
    expect(outbox.marked).toBe(1);
    expect(enqueuer.jobs.size).toBe(1);
  });

  it('keeps Postgres outbox eligible during Redis outage and recovers later', async () => {
    const outbox = new FakeOutbox();
    const enqueuer = new FakeEnqueuer();
    enqueuer.failOnce = true;
    const dispatcher = new OutboxDispatcher(outbox, new FakeFailures(), enqueuer);
    expect((await dispatcher.dispatch(10)).deferred).toBe(1);
    expect(outbox.marked).toBe(0);
    expect(outbox.released[0]?.errorCode).toBe('OUTBOX_ENQUEUE_UNAVAILABLE');
    expect((await dispatcher.dispatch(10)).enqueued).toBe(1);
    expect(enqueuer.jobs.size).toBe(1);
  });

  it('quarantines known no-consumer events without alerting and unknown versions with one durable failure', async () => {
    const outbox = new FakeOutbox();
    const failures = new FakeFailures();
    outbox.current = [{ ...EVENT, eventType: 'order.created' }];
    const dispatcher = new OutboxDispatcher(outbox, failures, new FakeEnqueuer());
    expect((await dispatcher.dispatch(10)).quarantined).toBe(1);
    expect(failures.rows).toHaveLength(0);
    expect(outbox.released[0]?.errorCode).toBe('OUTBOX_NO_ACTIVE_CONSUMER');
    outbox.current = [{ ...EVENT, eventVersion: 99 }];
    expect((await dispatcher.dispatch(10)).quarantined).toBe(1);
    expect(failures.rows).toHaveLength(1);
    expect(failures.rows[0]?.errorCode).toBe('OUTBOX_UNSUPPORTED_EVENT');
  });

  it('routes shipment outbox by identifier and event kind, without recipient data', () => {
    const route = routeOutboxEvent({
      ...EVENT,
      aggregateType: 'shipment',
      eventType: 'shipment.shipped',
    });
    expect(route.disposition).toBe('ENQUEUE');
    if (route.disposition === 'ENQUEUE') {
      expect(route.route.queue).toBe('email');
      expect(route.route.data).toMatchObject({
        payload: { shipmentId: EVENT.aggregateId, kind: 'SHIPPED' },
      });
      expect(JSON.stringify(route.route.data)).not.toContain('recipient');
    }
  });

  it('quarantines malformed lineage and still dispatches the next valid row', async () => {
    const outbox = new FakeOutbox();
    outbox.current = [
      { ...EVENT, correlationId: 'person@example.test' },
      { ...EVENT, id: '34815449-8028-427d-b1cb-2b72f60ba635' },
    ];
    const failures = new FakeFailures();
    const enqueuer = new FakeEnqueuer();
    const result = await new OutboxDispatcher(outbox, failures, enqueuer).dispatch(10);
    expect(result.quarantined).toBe(1);
    expect(result.enqueued).toBe(1);
    expect(failures.rows).toHaveLength(1);
    expect(failures.rows[0]?.correlationId).toBe(`outbox-${EVENT.id}`);
  });
});
