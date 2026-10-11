import { describe, it, expect } from 'vitest';
import { decodeJobEnvelope, type ClaimedOutboxEvent, JOB_NAMES } from '@honey/backend';
import { routeOutboxEvent } from './outbox-routing.js';
const id = '018f0000-0000-7000-8000-000000001801';
const productId = '018f0000-0000-7000-8000-000000001802';
const event = (
  eventType: string,
  aggregateType = 'content',
  payload: unknown = {},
): ClaimedOutboxEvent => ({
  id,
  aggregateId: id,
  aggregateType,
  eventType,
  eventVersion: 1,
  payload,
  occurredAt: new Date(),
  claimToken: 'phase18-claim',
  attempts: 1,
});
describe('Phase 18 thin outbox routing', () => {
  it.each(['content.created', 'content.updated', 'content.published', 'content.archived'])(
    '%s invalidates content via validated queue envelope',
    (type) => {
      const r = routeOutboxEvent(event(type));
      if (r.disposition !== 'ENQUEUE') throw new Error('Route missing.');
      expect(r.route.queue).toBe('cache');
      expect(decodeJobEnvelope(r.route.data, JOB_NAMES.catalogRevalidate).payload).toEqual({
        scope: 'content',
        id,
      });
    },
  );
  it.each(['review.approved', 'review.rejected'])('%s targets the owning product cache', (type) => {
    const r = routeOutboxEvent(event(type, 'review', { productId }));
    if (r.disposition !== 'ENQUEUE') throw new Error('Route missing.');
    expect(decodeJobEnvelope(r.route.data, JOB_NAMES.catalogRevalidate).payload).toEqual({
      scope: 'product',
      id: productId,
    });
    expect(routeOutboxEvent(event(type, 'review', { productId: 'forged' })).disposition).toBe(
      'UNSUPPORTED_EVENT',
    );
  });
  it('newsletter carries a delivery ID only and preserves existing shipment v1 payload', () => {
    const r = routeOutboxEvent(event('notification.newsletter_queued', 'newsletter'));
    if (r.disposition !== 'ENQUEUE') throw new Error('Route missing.');
    expect(r.route.queue).toBe('email');
    expect(decodeJobEnvelope(r.route.data, JOB_NAMES.newsletterEmail).payload).toEqual({
      deliveryId: id,
    });
    const old = routeOutboxEvent(event('shipment.shipped', 'shipment'));
    if (old.disposition !== 'ENQUEUE') throw new Error('Legacy route missing.');
    expect(decodeJobEnvelope(old.route.data, JOB_NAMES.fulfilmentEmail).payload).toEqual({
      shipmentId: id,
      kind: 'SHIPPED',
    });
  });
});
