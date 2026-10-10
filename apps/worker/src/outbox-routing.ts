import {
  JOB_NAMES,
  createJobEnvelope,
  deterministicJobId,
  type ClaimedOutboxEvent,
  type JobName,
  type QueueName,
} from '@honey/backend';

type Route = Readonly<{
  queue: QueueName;
  name: JobName;
  jobId: string;
  data: unknown;
}>;

export type OutboxRoute =
  | Readonly<{ disposition: 'ENQUEUE'; route: Route }>
  | Readonly<{ disposition: 'NO_ACTIVE_CONSUMER' }>
  | Readonly<{ disposition: 'UNSUPPORTED_EVENT' }>;

const CATALOG_EVENTS = new Set([
  'catalog.category.created',
  'catalog.category.moved',
  'catalog.category.translation_updated',
  'catalog.category.updated',
  'catalog.collection.archived',
  'catalog.collection.created',
  'catalog.collection.published',
  'catalog.collection.slug_changed',
  'catalog.collection.translation_updated',
  'catalog.collection.updated',
  'catalog.product.archived',
  'catalog.product.category_assigned',
  'catalog.product.category_unassigned',
  'catalog.product.collection_assigned',
  'catalog.product.collection_unassigned',
  'catalog.product.created',
  'catalog.product.default_variant_set',
  'catalog.product.media_attached',
  'catalog.product.media_detached',
  'catalog.product.media_updated',
  'catalog.product.published',
  'catalog.product.slug_changed',
  'catalog.product.translation_updated',
  'catalog.product.updated',
  'catalog.variant.created',
  'catalog.variant.translation_updated',
  'catalog.variant.updated',
]);

/** Existing events with no Phase 16 application consumer are visible as quarantine, not discarded. */
const NO_ACTIVE_CONSUMER_EVENTS = new Set([
  'checkout.started',
  'shipment.created',
  'fulfilment.completed',
  'fulfilment.partial',
  'order.cancelled',
  'order.created',
  'order.fulfilment_updated',
  'payment.created',
  'payment.failed',
  'payment.paid',
  'payment.partially_refunded',
  'payment.reconciliation_mismatch',
  'payment.refunded',
  'inventory.adjusted',
  'inventory.allocated',
  'inventory.changed',
  'inventory.oversell_prevented',
  'inventory.production_received',
  'inventory.reconciled',
  'inventory.reservation_expired',
  'inventory.reservation_released',
  'inventory.reserved',
  'stock.low',
  'inventory.location.created',
  'inventory.location.updated',
  'procurement.purchase_order.created',
  'procurement.supplier.created',
  'procurement.supplier.updated',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CORRELATION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export function routeOutboxEvent(event: ClaimedOutboxEvent): OutboxRoute {
  if (
    event.eventVersion !== 1 ||
    !UUID.test(event.id) ||
    !UUID.test(event.aggregateId) ||
    (event.correlationId !== undefined && !CORRELATION.test(event.correlationId))
  ) {
    return { disposition: 'UNSUPPORTED_EVENT' };
  }
  // The event UUID is an exact lineage key without copying a possibly sensitive request ID.
  const correlationId = `outbox-${event.id}`;
  if (CATALOG_EVENTS.has(event.eventType)) {
    const scope =
      event.aggregateType === 'product' ||
      event.aggregateType === 'category' ||
      event.aggregateType === 'collection'
        ? event.aggregateType
        : 'catalog';
    const payload = scope === 'catalog' ? { scope } : { scope, id: event.aggregateId };
    return {
      disposition: 'ENQUEUE',
      route: {
        queue: 'cache',
        name: JOB_NAMES.catalogRevalidate,
        jobId: deterministicJobId({ type: JOB_NAMES.catalogRevalidate, key: event.id }),
        data: createJobEnvelope(
          JOB_NAMES.catalogRevalidate,
          payload,
          correlationId,
          event.id,
          event.occurredAt.toISOString(),
        ),
      },
    };
  }
  if (event.eventType === 'shipment.shipped' || event.eventType === 'shipment.delivered') {
    if (event.aggregateType !== 'shipment') return { disposition: 'UNSUPPORTED_EVENT' };
    const kind = event.eventType === 'shipment.shipped' ? 'SHIPPED' : 'DELIVERED';
    return {
      disposition: 'ENQUEUE',
      route: {
        queue: 'email',
        name: JOB_NAMES.fulfilmentEmail,
        jobId: deterministicJobId({ type: JOB_NAMES.fulfilmentEmail, key: event.id }),
        data: createJobEnvelope(
          JOB_NAMES.fulfilmentEmail,
          { shipmentId: event.aggregateId, kind },
          correlationId,
          event.id,
          event.occurredAt.toISOString(),
        ),
      },
    };
  }
  if (NO_ACTIVE_CONSUMER_EVENTS.has(event.eventType)) {
    return { disposition: 'NO_ACTIVE_CONSUMER' };
  }
  return { disposition: 'UNSUPPORTED_EVENT' };
}
