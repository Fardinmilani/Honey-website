/** Shared, transport-neutral contracts for the Phase 16 queues. */
export const QUEUE_NAMES = [
  'outbox',
  'email',
  'sms',
  'inventory',
  'orders',
  'payments',
  'media',
  'search',
  'cache',
  'maintenance',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export const JOB_NAMES = {
  outboxDispatch: 'outbox.dispatch.v1',
  reservationSweep: 'inventory.reservation-sweep.v1',
  inventoryReconcile: 'inventory.reconcile.v1',
  paymentReconcile: 'payments.reconcile.v1',
  fulfilmentEmail: 'email.fulfilment-notify.v1',
  catalogRevalidate: 'cache.catalog-revalidate.v1',
  sitemapRegenerate: 'maintenance.sitemap-regenerate.v1',
  backupVerify: 'maintenance.backup-verify.v1',
  deadLetterReconcile: 'maintenance.dead-letter-reconcile.v1',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export function isJobName(value: string): value is JobName {
  return Object.values(JOB_NAMES).some((name) => name === value);
}

export const JOB_QUEUES: Readonly<Record<JobName, QueueName>> = {
  [JOB_NAMES.outboxDispatch]: 'outbox',
  [JOB_NAMES.reservationSweep]: 'inventory',
  [JOB_NAMES.inventoryReconcile]: 'inventory',
  [JOB_NAMES.paymentReconcile]: 'payments',
  [JOB_NAMES.fulfilmentEmail]: 'email',
  [JOB_NAMES.catalogRevalidate]: 'cache',
  [JOB_NAMES.sitemapRegenerate]: 'maintenance',
  [JOB_NAMES.backupVerify]: 'maintenance',
  [JOB_NAMES.deadLetterReconcile]: 'maintenance',
};

export type JobEnvelopeV1<TName extends JobName = JobName, TPayload = unknown> = Readonly<{
  version: 1;
  type: TName;
  correlationId: string;
  occurredAt: string;
  payload: TPayload;
  eventId?: string;
}>;

export type JobPayload =
  | Readonly<{ type: typeof JOB_NAMES.outboxDispatch; payload: Readonly<Record<string, never>> }>
  | Readonly<{ type: typeof JOB_NAMES.reservationSweep; payload: Readonly<Record<string, never>> }>
  | Readonly<{
      type: typeof JOB_NAMES.inventoryReconcile;
      payload: Readonly<{
        repair: boolean;
        cursor?: Readonly<{ variantId: string; stockLocationId: string }>;
      }>;
    }>
  | Readonly<{ type: typeof JOB_NAMES.paymentReconcile; payload: Readonly<Record<string, never>> }>
  | Readonly<{
      type: typeof JOB_NAMES.fulfilmentEmail;
      payload: Readonly<{ shipmentId: string; kind: 'SHIPPED' | 'DELIVERED' }>;
    }>
  | Readonly<{
      type: typeof JOB_NAMES.catalogRevalidate;
      payload: Readonly<{
        scope: 'catalog' | 'product' | 'category' | 'collection';
        id?: string;
      }>;
    }>
  | Readonly<{
      type: typeof JOB_NAMES.sitemapRegenerate;
      payload: Readonly<{ locale: 'fa' | 'en' }>;
    }>
  | Readonly<{ type: typeof JOB_NAMES.backupVerify; payload: Readonly<Record<string, never>> }>
  | Readonly<{
      type: typeof JOB_NAMES.deadLetterReconcile;
      payload: Readonly<Record<string, never>>;
    }>;

export type ValidatedJobEnvelope = JobPayload &
  Readonly<{
    version: 1;
    correlationId: string;
    occurredAt: string;
    eventId?: string;
  }>;

export class InvalidJobPayloadError extends Error {
  constructor(readonly code: 'MALFORMED_JOB' | 'UNSUPPORTED_JOB_VERSION' | 'JOB_NAME_MISMATCH') {
    super(code);
    this.name = 'InvalidJobPayloadError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CORRELATION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

function record(input: unknown): input is Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false;
  const prototype: unknown = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
  );
}

function emptyPayload(input: unknown): input is Record<string, never> {
  return record(input) && Object.keys(input).length === 0;
}

function inventoryCursor(
  input: unknown,
): input is Readonly<{ variantId: string; stockLocationId: string }> {
  return (
    record(input) &&
    exactKeys(input, ['variantId', 'stockLocationId']) &&
    typeof input['variantId'] === 'string' &&
    UUID.test(input['variantId']) &&
    typeof input['stockLocationId'] === 'string' &&
    UUID.test(input['stockLocationId'])
  );
}

function validIsoDate(input: unknown): input is string {
  return (
    typeof input === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input) &&
    !Number.isNaN(Date.parse(input)) &&
    new Date(input).toISOString() === input
  );
}

/** Rejects extra keys so secrets and PII cannot slip into Redis by accident. */
export function decodeJobEnvelope(input: unknown, expectedName?: JobName): ValidatedJobEnvelope {
  if (!record(input)) throw new InvalidJobPayloadError('MALFORMED_JOB');
  if (input['version'] !== 1) throw new InvalidJobPayloadError('UNSUPPORTED_JOB_VERSION');
  const type = input['type'];
  if (typeof type !== 'string' || !(type in JOB_QUEUES)) {
    throw new InvalidJobPayloadError('MALFORMED_JOB');
  }
  if (expectedName !== undefined && type !== expectedName) {
    throw new InvalidJobPayloadError('JOB_NAME_MISMATCH');
  }
  if (
    !exactKeys(input, ['version', 'type', 'correlationId', 'occurredAt', 'payload'], ['eventId']) ||
    typeof input['correlationId'] !== 'string' ||
    !CORRELATION.test(input['correlationId']) ||
    !validIsoDate(input['occurredAt']) ||
    (input['eventId'] !== undefined &&
      (typeof input['eventId'] !== 'string' || !UUID.test(input['eventId'])))
  ) {
    throw new InvalidJobPayloadError('MALFORMED_JOB');
  }
  const payload = input['payload'];
  let valid = false;
  switch (type) {
    case JOB_NAMES.outboxDispatch:
    case JOB_NAMES.reservationSweep:
    case JOB_NAMES.paymentReconcile:
    case JOB_NAMES.backupVerify:
    case JOB_NAMES.deadLetterReconcile:
      valid = emptyPayload(payload);
      break;
    case JOB_NAMES.inventoryReconcile:
      valid =
        record(payload) &&
        exactKeys(payload, ['repair'], ['cursor']) &&
        payload['repair'] === false &&
        (payload['cursor'] === undefined || inventoryCursor(payload['cursor']));
      break;
    case JOB_NAMES.sitemapRegenerate:
      valid =
        record(payload) &&
        exactKeys(payload, ['locale']) &&
        (payload['locale'] === 'fa' || payload['locale'] === 'en');
      break;
    case JOB_NAMES.fulfilmentEmail:
      valid =
        record(payload) &&
        exactKeys(payload, ['shipmentId', 'kind']) &&
        typeof payload['shipmentId'] === 'string' &&
        UUID.test(payload['shipmentId']) &&
        (payload['kind'] === 'SHIPPED' || payload['kind'] === 'DELIVERED');
      break;
    case JOB_NAMES.catalogRevalidate:
      valid =
        record(payload) &&
        exactKeys(payload, ['scope'], ['id']) &&
        (payload['scope'] === 'catalog' ||
          payload['scope'] === 'product' ||
          payload['scope'] === 'category' ||
          payload['scope'] === 'collection') &&
        (payload['id'] === undefined ||
          (typeof payload['id'] === 'string' && UUID.test(payload['id']))) &&
        (payload['scope'] === 'catalog'
          ? payload['id'] === undefined
          : payload['id'] !== undefined);
      break;
  }
  if (!valid) throw new InvalidJobPayloadError('MALFORMED_JOB');
  // A narrow validated object is reconstructed. No unvalidated extra properties are returned.
  const shared = {
    version: 1 as const,
    correlationId: input['correlationId'],
    occurredAt: input['occurredAt'],
    ...(input['eventId'] === undefined ? {} : { eventId: input['eventId'] }),
  };
  switch (type) {
    case JOB_NAMES.outboxDispatch:
      return { ...shared, type, payload: {} };
    case JOB_NAMES.reservationSweep:
      return { ...shared, type, payload: {} };
    case JOB_NAMES.paymentReconcile:
      return { ...shared, type, payload: {} };
    case JOB_NAMES.backupVerify:
      return { ...shared, type, payload: {} };
    case JOB_NAMES.deadLetterReconcile:
      return { ...shared, type, payload: {} };
    case JOB_NAMES.inventoryReconcile: {
      if (!record(payload)) throw new InvalidJobPayloadError('MALFORMED_JOB');
      const cursor = payload['cursor'];
      return {
        ...shared,
        type,
        payload: {
          repair: false,
          ...(inventoryCursor(cursor)
            ? { cursor: { variantId: cursor.variantId, stockLocationId: cursor.stockLocationId } }
            : {}),
        },
      };
    }
    case JOB_NAMES.sitemapRegenerate:
      return {
        ...shared,
        type,
        payload: { locale: record(payload) && payload['locale'] === 'fa' ? 'fa' : 'en' },
      };
    case JOB_NAMES.fulfilmentEmail: {
      if (
        !record(payload) ||
        typeof payload['shipmentId'] !== 'string' ||
        (payload['kind'] !== 'SHIPPED' && payload['kind'] !== 'DELIVERED')
      ) {
        throw new InvalidJobPayloadError('MALFORMED_JOB');
      }
      return {
        ...shared,
        type,
        payload: { shipmentId: payload['shipmentId'], kind: payload['kind'] },
      };
    }
    case JOB_NAMES.catalogRevalidate: {
      if (!record(payload)) throw new InvalidJobPayloadError('MALFORMED_JOB');
      const scope = payload['scope'];
      if (
        scope !== 'catalog' &&
        scope !== 'product' &&
        scope !== 'category' &&
        scope !== 'collection'
      ) {
        throw new InvalidJobPayloadError('MALFORMED_JOB');
      }
      const id = payload['id'];
      return { ...shared, type, payload: { scope, ...(typeof id === 'string' ? { id } : {}) } };
    }
  }
  throw new InvalidJobPayloadError('MALFORMED_JOB');
}

export function createJobEnvelope<TName extends JobName, TPayload>(
  type: TName,
  payload: TPayload,
  correlationId: string,
  eventId?: string,
  occurredAt: string = new Date().toISOString(),
): JobEnvelopeV1<TName, TPayload> {
  const candidate = {
    version: 1,
    type,
    correlationId,
    occurredAt,
    payload,
    ...(eventId === undefined ? {} : { eventId }),
  } as const;
  decodeJobEnvelope(candidate, type);
  return candidate;
}

/** BullMQ custom IDs cannot contain a colon. All components are non-PII identifiers. */
export function deterministicJobId(
  input: Readonly<{
    type: JobName;
    key: string;
  }>,
): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(input.key)) {
    throw new InvalidJobPayloadError('MALFORMED_JOB');
  }
  return `${input.type.replaceAll('.', '-')}-${input.key}`;
}
