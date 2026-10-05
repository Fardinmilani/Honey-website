import { calculateManualFlatQuotes } from '../domain/manual-flat-rates.js';
import {
  MANUAL_FLAT_PROVIDER_CODE,
  type ShippingConfiguration,
  type ShippingMethodQuote,
  type ShippingProvider,
  type ShippingQuoteRequest,
  type ShippingTrackingEvent,
  type ShipmentCreationInput,
  type ShipmentCreationResult,
} from '../domain/shipping.js';

/** Staff operate the shipment; this adapter never represents an external carrier. */
export class ManualFlatShippingProvider implements ShippingProvider {
  readonly code = MANUAL_FLAT_PROVIDER_CODE;
  readonly capabilities = {
    quote: true,
    createShipment: true,
    cancelShipment: false,
    tracking: true,
    labels: false,
    webhooks: false,
  } as const;

  async quote(
    input: ShippingQuoteRequest,
    configuration: ShippingConfiguration,
  ): Promise<readonly ShippingMethodQuote[]> {
    return calculateManualFlatQuotes(input, configuration);
  }

  async createShipment(input: ShipmentCreationInput): Promise<ShipmentCreationResult> {
    return {
      providerCode: this.code,
      providerShipmentRef: input.shipmentId,
      trackingNumber: input.trackingNumber,
      trackingUrl: input.trackingUrl,
    };
  }

  async track(events: readonly ShippingTrackingEvent[]): Promise<readonly ShippingTrackingEvent[]> {
    return [...events].sort(
      (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
    );
  }
}
