import { createHash } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';

import {
  FulfilmentService,
  InventoryService,
  JOB_NAMES,
  type BackupVerificationService,
  PaymentsService,
  PrismaJobFailureRepository,
  PrismaOutboxDispatchRepository,
  QUEUE_NAMES,
  REQUEST_CONTEXT,
  SitemapRevalidationService,
  decodeJobEnvelope,
  createJobEnvelope,
  deterministicJobId,
  isJobName,
  type JobName,
  type QueueName,
  type RequestContextPort,
  type ValidatedJobEnvelope,
} from '@honey/backend';

import type { WorkerConfig } from './config.js';
import { classifyFailure, RETRY_POLICY, safeFailureCode } from './failure-policy.js';
import { OutboxDispatcher } from './outbox-dispatcher.js';
import { producerConnectionOptions, redisConnectionOptions } from './redis-connection.js';
import { WorkerModule } from './worker.module.js';

const ACTIVE_QUEUES: readonly QueueName[] = [
  'outbox',
  'email',
  'inventory',
  'payments',
  'cache',
  'maintenance',
];

export const QUEUE_CAPABILITIES: Readonly<
  Record<QueueName, 'ACTIVE' | 'REGISTERED_NO_ACTIVE_PROCESSOR' | 'DEFERRED_BY_CAPABILITY'>
> = {
  outbox: 'ACTIVE',
  email: 'ACTIVE',
  sms: 'REGISTERED_NO_ACTIVE_PROCESSOR',
  inventory: 'ACTIVE',
  orders: 'REGISTERED_NO_ACTIVE_PROCESSOR',
  payments: 'ACTIVE',
  media: 'REGISTERED_NO_ACTIVE_PROCESSOR',
  search: 'REGISTERED_NO_ACTIVE_PROCESSOR',
  cache: 'ACTIVE',
  maintenance: 'ACTIVE',
};

function operationalLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Readonly<Record<string, string | number | boolean | null>> = {},
): void {
  process.stdout.write(`${JSON.stringify({ level, event, ...fields })}\n`);
}

function jobCorrelation(envelope: ValidatedJobEnvelope): string {
  return `corr-${createHash('sha256').update(envelope.correlationId).digest('hex').slice(0, 32)}`;
}

function safeJobVersion(value: unknown): number {
  if (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'number' &&
    Number.isSafeInteger(value.version) &&
    value.version >= 1 &&
    value.version <= 100
  )
    return value.version;
  return 1;
}

function safeJobName(value: string): string {
  return isJobName(value) ? value : 'unknown.job';
}

function safeJobId(value: string | undefined): string {
  if (value === undefined) return 'unknown';
  return `opaque-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

async function readyWithin(work: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('WORKER_REDIS_STARTUP_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export class WorkerRuntime {
  readonly #queues = new Map<QueueName, Queue<unknown, unknown, string>>();
  readonly #workers: Worker<unknown, unknown, string>[] = [];
  readonly #failureCaptures = new Set<Promise<void>>();
  readonly #outboxRepository: PrismaOutboxDispatchRepository;
  readonly #failures: PrismaJobFailureRepository;
  #app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
  #inventory: InventoryService | undefined;
  #payments: PaymentsService | undefined;
  #fulfilment: FulfilmentService | undefined;
  #sitemap: SitemapRevalidationService | undefined;
  #requestContext: RequestContextPort | undefined;
  #dispatcher: OutboxDispatcher | undefined;
  #closing = false;

  constructor(
    private readonly config: WorkerConfig,
    private readonly backupVerifier?: BackupVerificationService,
  ) {
    this.#outboxRepository = new PrismaOutboxDispatchRepository(config.databaseUrl);
    this.#failures = new PrismaJobFailureRepository(config.databaseUrl);
  }

  async start(): Promise<void> {
    if (this.#app !== undefined) throw new Error('Worker already started.');
    const connection = redisConnectionOptions(this.config.redisUrl);
    const producerConnection = producerConnectionOptions(this.config.redisUrl);
    try {
      this.#app = await NestFactory.createApplicationContext(WorkerModule.register(this.config), {
        logger: false,
      });
      this.#inventory = this.#app.get(InventoryService);
      this.#payments = this.#app.get(PaymentsService);
      this.#fulfilment = this.#app.get(FulfilmentService);
      this.#sitemap = this.#app.get(SitemapRevalidationService);
      this.#requestContext = this.#app.get<RequestContextPort>(REQUEST_CONTEXT);
      for (const name of QUEUE_NAMES) {
        const queue = new Queue<unknown, unknown, string>(name, {
          connection: producerConnection,
          prefix: this.config.redisPrefix,
          defaultJobOptions: RETRY_POLICY,
        });
        this.#queues.set(name, queue);
      }
      await readyWithin(
        Promise.all([...this.#queues.values()].map((queue) => queue.waitUntilReady())),
        10_000,
      );
      this.#dispatcher = new OutboxDispatcher(this.#outboxRepository, this.#failures, {
        add: async ({ queue, name, data, jobId }) => {
          await this.#queue(queue).add(name, data, { jobId });
        },
      });
      await this.#registerSchedules();
      for (const name of ACTIVE_QUEUES) {
        const worker = new Worker<unknown, unknown, string>(
          name,
          (job) => this.#execute(name, job),
          {
            connection,
            prefix: this.config.redisPrefix,
            concurrency:
              name === 'outbox' || name === 'inventory' || name === 'maintenance' ? 1 : 2,
            ...(name === 'email' ? { limiter: { max: 10, duration: 1_000 } } : {}),
            maxStalledCount: 2,
            lockDuration: 60_000,
            removeOnComplete: RETRY_POLICY.removeOnComplete,
            removeOnFail: RETRY_POLICY.removeOnFail,
          },
        );
        worker.on('failed', (job, error) => {
          if (job === undefined) return;
          const capture = this.#captureIfTerminal(name, job, error);
          this.#failureCaptures.add(capture);
          void capture.finally(() => this.#failureCaptures.delete(capture));
        });
        worker.on('error', () => {
          operationalLog('error', 'worker.queue_error', { queue: name });
        });
        this.#workers.push(worker);
      }
      await readyWithin(
        Promise.all(this.#workers.map((worker) => worker.waitUntilReady())),
        10_000,
      );
      await this.#synchronizeFailedJobs();
      operationalLog('info', 'worker.started', {
        queues: QUEUE_NAMES.length,
        activeQueues: ACTIVE_QUEUES.length,
      });
      operationalLog('info', 'worker.capability_deferred', {
        capability: 'backup-verification',
        enabled: false,
      });
    } catch (error) {
      await this.close(true);
      throw error;
    }
  }

  #queue(name: QueueName): Queue<unknown, unknown, string> {
    const queue = this.#queues.get(name);
    if (queue === undefined) throw new Error('Queue has not been registered.');
    return queue;
  }

  async #registerSchedules(): Promise<void> {
    const schedules = [
      {
        queue: 'outbox' as const,
        name: JOB_NAMES.outboxDispatch,
        key: 'outbox-dispatch',
        every: this.config.outboxIntervalMs,
        payload: {},
      },
      {
        queue: 'inventory' as const,
        name: JOB_NAMES.reservationSweep,
        key: 'reservation-sweep',
        every: this.config.reservationSweepIntervalMs,
        payload: {},
      },
      {
        queue: 'payments' as const,
        name: JOB_NAMES.paymentReconcile,
        key: 'payment-reconcile',
        every: this.config.paymentReconcileIntervalMs,
        payload: {},
      },
      {
        queue: 'inventory' as const,
        name: JOB_NAMES.inventoryReconcile,
        key: 'inventory-reconcile',
        every: this.config.inventoryReconcileIntervalMs,
        payload: { repair: false },
      },
      {
        queue: 'maintenance' as const,
        name: JOB_NAMES.sitemapRegenerate,
        key: 'sitemap-fa',
        every: this.config.sitemapRegenerateIntervalMs,
        payload: { locale: 'fa' },
      },
      {
        queue: 'maintenance' as const,
        name: JOB_NAMES.sitemapRegenerate,
        key: 'sitemap-en',
        every: this.config.sitemapRegenerateIntervalMs,
        payload: { locale: 'en' },
      },
      {
        queue: 'maintenance' as const,
        name: JOB_NAMES.deadLetterReconcile,
        key: 'dead-letter-reconcile',
        every: 300_000,
        payload: {},
      },
    ] as const;
    for (const schedule of schedules) {
      await this.#queue(schedule.queue).upsertJobScheduler(
        `scheduler-${schedule.key}`,
        { every: schedule.every },
        {
          name: schedule.name,
          data: createJobEnvelope(schedule.name, schedule.payload, `schedule-${schedule.key}`),
          opts: RETRY_POLICY,
        },
      );
    }
  }

  async #execute(queue: QueueName, job: Job<unknown, unknown, string>): Promise<unknown> {
    const started = Date.now();
    try {
      if (!isJobName(job.name)) throw new Error('UNKNOWN_JOB_NAME');
      const envelope = decodeJobEnvelope(job.data, job.name);
      if (queue !== this.#queueFor(envelope.type)) throw new Error('JOB_QUEUE_MISMATCH');
      const context = this.#requestContext;
      if (context === undefined) throw new Error('WORKER_NOT_READY');
      operationalLog('info', 'worker.job_started', {
        queue,
        jobId: safeJobId(job.id),
        name: safeJobName(job.name),
        correlationId: jobCorrelation(envelope),
        attempt: job.attemptsMade + 1,
        principalKind: 'SYSTEM',
        principalSource: 'WORKER',
      });
      const result = await context.run({ requestId: jobCorrelation(envelope) }, () =>
        this.#handle(envelope, job.id),
      );
      operationalLog('info', 'worker.job_completed', {
        queue,
        jobId: safeJobId(job.id),
        name: safeJobName(job.name),
        correlationId: jobCorrelation(envelope),
        attempt: job.attemptsMade + 1,
        durationMs: Date.now() - started,
        principalKind: 'SYSTEM',
        principalSource: 'WORKER',
      });
      return result;
    } catch (error) {
      const classification = classifyFailure(error);
      operationalLog('warn', 'worker.job_rejected', {
        queue,
        jobId: safeJobId(job.id),
        name: safeJobName(job.name),
        attempt: job.attemptsMade + 1,
        durationMs: Date.now() - started,
        errorCode: classification.code,
        retryable: classification.retryable,
        principalKind: 'SYSTEM',
        principalSource: 'WORKER',
      });
      if (classification.retryable) throw new Error(classification.code);
      throw new UnrecoverableError(classification.code);
    }
  }

  #queueFor(name: JobName): QueueName {
    switch (name) {
      case JOB_NAMES.outboxDispatch:
        return 'outbox';
      case JOB_NAMES.reservationSweep:
      case JOB_NAMES.inventoryReconcile:
        return 'inventory';
      case JOB_NAMES.paymentReconcile:
        return 'payments';
      case JOB_NAMES.fulfilmentEmail:
        return 'email';
      case JOB_NAMES.catalogRevalidate:
        return 'cache';
      case JOB_NAMES.sitemapRegenerate:
      case JOB_NAMES.backupVerify:
      case JOB_NAMES.deadLetterReconcile:
        return 'maintenance';
    }
  }

  async #handle(envelope: ValidatedJobEnvelope, jobId: string | undefined): Promise<unknown> {
    switch (envelope.type) {
      case JOB_NAMES.outboxDispatch:
        return this.#require(this.#dispatcher).dispatch(this.config.outboxBatchSize);
      case JOB_NAMES.reservationSweep:
        return this.#require(this.#inventory).expireReservations({
          batchSize: this.config.reservationBatchSize,
          actor: { actorUserId: null, metadata: { requestId: jobCorrelation(envelope) } },
        });
      case JOB_NAMES.inventoryReconcile: {
        const report = await this.#require(this.#inventory).reconcileForSystem(
          {
            kind: 'SYSTEM',
            source: 'WORKER',
            correlationId: jobCorrelation(envelope),
          },
          envelope.payload.repair,
          envelope.payload.cursor,
        );
        if (report.hasMore) {
          if (jobId === undefined || report.nextCursor === null) {
            throw new Error('INVENTORY_CONTINUATION_MISSING');
          }
          const cursor = report.nextCursor;
          const key = createHash('sha256')
            .update(JSON.stringify([jobId, cursor.variantId, cursor.stockLocationId]))
            .digest('hex')
            .slice(0, 32);
          await this.#queue('inventory').add(
            JOB_NAMES.inventoryReconcile,
            createJobEnvelope(
              JOB_NAMES.inventoryReconcile,
              { repair: false, cursor },
              envelope.correlationId,
            ),
            {
              jobId: deterministicJobId({
                type: JOB_NAMES.inventoryReconcile,
                key: `page-${key}`,
              }),
            },
          );
        }
        return {
          drifted: report.drifted,
          driftCount: report.drifts.length,
          repaired: false,
          hasMore: report.hasMore,
        };
      }
      case JOB_NAMES.paymentReconcile:
        return this.#require(this.#payments).reconcileEligible(
          this.config.payment.provider,
          this.config.paymentBatchSize,
        );
      case JOB_NAMES.fulfilmentEmail:
        return this.#require(this.#fulfilment).sendNotificationForSystem(
          { kind: 'SYSTEM', source: 'WORKER', correlationId: jobCorrelation(envelope) },
          envelope.payload,
        );
      case JOB_NAMES.catalogRevalidate:
        return this.#require(this.#sitemap).revalidateCatalog({
          ...envelope.payload,
          correlationId: jobCorrelation(envelope),
        });
      case JOB_NAMES.sitemapRegenerate:
        return this.#require(this.#sitemap).revalidate({
          locale: envelope.payload.locale,
          correlationId: jobCorrelation(envelope),
        });
      case JOB_NAMES.backupVerify:
        if (this.backupVerifier === undefined) throw new Error('BACKUP_CAPABILITY_DISABLED');
        return this.backupVerifier.verify({ correlationId: jobCorrelation(envelope) });
      case JOB_NAMES.deadLetterReconcile:
        return this.#synchronizeFailedJobs();
    }
  }

  #require<T>(value: T | undefined): T {
    if (value === undefined) throw new Error('WORKER_NOT_READY');
    return value;
  }

  async #captureIfTerminal(
    queue: QueueName,
    job: Job<unknown, unknown, string>,
    error: Error,
  ): Promise<void> {
    const attempts = job.opts.attempts ?? 1;
    if (!(error instanceof UnrecoverableError) && job.attemptsMade < attempts) return;
    await this.#recordFailure(
      queue,
      job,
      error instanceof UnrecoverableError ? 'PERMANENT' : 'EXHAUSTED',
    );
  }

  async #recordFailure(
    queue: QueueName,
    job: Job<unknown, unknown, string>,
    errorClass: 'PERMANENT' | 'EXHAUSTED',
  ): Promise<boolean> {
    try {
      let correlationId: string | undefined;
      if (isJobName(job.name)) {
        try {
          correlationId = jobCorrelation(decodeJobEnvelope(job.data, job.name));
        } catch {
          /* malformed payload is intentionally not read */
        }
      }
      const result = await this.#failures.recordTerminalFailure({
        queue,
        jobId: safeJobId(job.id),
        name: safeJobName(job.name),
        payloadVersion: safeJobVersion(job.data),
        ...(correlationId === undefined ? {} : { correlationId }),
        attemptsMade: job.attemptsMade,
        errorCode: safeFailureCode(job.failedReason),
        errorClass,
        terminalCycle: `created-${job.timestamp}`,
      });
      if (result.created) {
        operationalLog('error', 'worker.dead_letter_alert', {
          queue,
          jobId: safeJobId(job.id),
          name: safeJobName(job.name),
          errorClass,
        });
      }
      return result.created;
    } catch {
      operationalLog('error', 'worker.dead_letter_persistence_unavailable', {
        queue,
        jobId: safeJobId(job.id),
      });
      return false;
    }
  }

  async #synchronizeFailedJobs(): Promise<number> {
    let recorded = 0;
    for (const queueName of ACTIVE_QUEUES) {
      let start = 0;
      while (start < 10_000) {
        const jobs = await this.#queue(queueName).getJobs(['failed'], start, start + 99);
        if (jobs.length === 0) break;
        for (const job of jobs) {
          if (await this.#recordFailure(queueName, job, 'EXHAUSTED')) recorded += 1;
        }
        if (jobs.length < 100) break;
        start += jobs.length;
      }
    }
    return recorded;
  }

  async metrics(): Promise<Readonly<Record<string, unknown>>> {
    const deadLetters = await this.#failures.countUnresolvedByQueue();
    const queues: Record<string, unknown> = {};
    for (const name of QUEUE_NAMES) {
      const queue = this.#queue(name);
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'completed',
        'failed',
      );
      const oldest = (await queue.getJobs(['waiting'], 0, 0))[0];
      queues[name] = {
        ...counts,
        deadLetterCount: deadLetters[name] ?? 0,
        oldestWaitingAgeMs:
          oldest === undefined ? null : Math.max(0, Date.now() - oldest.timestamp),
        capability: QUEUE_CAPABILITIES[name],
      };
    }
    const outbox = await this.#outboxRepository.pendingMetrics();
    return {
      queues,
      outbox: {
        pendingCount: outbox.pendingCount,
        quarantinedCount: outbox.quarantinedCount,
        oldestPendingAgeMs:
          outbox.oldestPendingAt === null
            ? null
            : Math.max(0, Date.now() - outbox.oldestPendingAt.getTime()),
      },
    };
  }

  async close(force = false): Promise<void> {
    if (this.#closing) return;
    this.#closing = true;
    await Promise.allSettled(this.#workers.map((worker) => worker.close(force)));
    await Promise.allSettled([...this.#failureCaptures]);
    await Promise.allSettled([...this.#queues.values()].map((queue) => queue.close()));
    await this.#app?.close();
    await Promise.allSettled([this.#outboxRepository.close(), this.#failures.close()]);
    operationalLog('info', 'worker.stopped');
  }
}

export async function checkRedisHealth(config: WorkerConfig): Promise<void> {
  const queue = new Queue('outbox', {
    connection: {
      ...producerConnectionOptions(config.redisUrl),
      connectTimeout: 1_000,
      retryStrategy: () => null,
    },
    prefix: config.redisPrefix,
  });
  try {
    await readyWithin(queue.waitUntilReady(), 3_000);
    await readyWithin(queue.getJobCounts('waiting'), 3_000);
  } finally {
    await queue.close();
  }
}

/** Read-only process inspection: no Nest context, schedulers, or consumers are started. */
export async function inspectWorkerMetrics(
  config: WorkerConfig,
): Promise<Readonly<Record<string, unknown>>> {
  const connection = producerConnectionOptions(config.redisUrl);
  const queues = new Map<QueueName, Queue<unknown, unknown, string>>();
  const outbox = new PrismaOutboxDispatchRepository(config.databaseUrl);
  const failures = new PrismaJobFailureRepository(config.databaseUrl);
  try {
    for (const name of QUEUE_NAMES) {
      queues.set(
        name,
        new Queue<unknown, unknown, string>(name, {
          connection,
          prefix: config.redisPrefix,
        }),
      );
    }
    await readyWithin(
      Promise.all([...queues.values()].map((queue) => queue.waitUntilReady())),
      10_000,
    );
    const deadLetters = await failures.countUnresolvedByQueue();
    const queueMetrics: Record<string, unknown> = {};
    for (const name of QUEUE_NAMES) {
      const queue = queues.get(name);
      if (queue === undefined) throw new Error('Queue metric registration failed.');
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'completed',
        'failed',
      );
      const oldest = (await queue.getJobs(['waiting'], 0, 0))[0];
      queueMetrics[name] = {
        ...counts,
        deadLetterCount: deadLetters[name] ?? 0,
        oldestWaitingAgeMs:
          oldest === undefined ? null : Math.max(0, Date.now() - oldest.timestamp),
        capability: QUEUE_CAPABILITIES[name],
      };
    }
    const pending = await outbox.pendingMetrics();
    return {
      queues: queueMetrics,
      outbox: {
        pendingCount: pending.pendingCount,
        quarantinedCount: pending.quarantinedCount,
        oldestPendingAgeMs:
          pending.oldestPendingAt === null
            ? null
            : Math.max(0, Date.now() - pending.oldestPendingAt.getTime()),
      },
    };
  } finally {
    await Promise.allSettled([...queues.values()].map((queue) => queue.close()));
    await Promise.allSettled([outbox.close(), failures.close()]);
  }
}
