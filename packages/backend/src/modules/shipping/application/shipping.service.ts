import { ConflictAppError, DependencyUnavailableAppError } from '../../../errors/index.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import type {
  ShippingConfigurationRepository,
  ShippingMethodQuote,
  ShippingProvider,
  ShippingQuoteRequest,
} from '../domain/shipping.js';

/** Server-authoritative rate lookup; no browser value enters the money calculation. */
export class ShippingService {
  constructor(
    private readonly repository: ShippingConfigurationRepository,
    private readonly provider: ShippingProvider,
  ) {}

  async quote(
    input: ShippingQuoteRequest,
    transaction: TransactionContext,
  ): Promise<readonly ShippingMethodQuote[]> {
    if (!this.provider.capabilities.quote) {
      throw new DependencyUnavailableAppError({
        code: 'CHECKOUT_SHIPPING_CONFIGURATION_UNAVAILABLE',
        retryable: false,
      });
    }
    const configuration = await this.repository.loadConfiguration(transaction);
    // A clean Phase 13 deployment may still use its explicit STANDARD rate.
    // Once any zones exist, an unsupported destination must fail closed.
    if (configuration.zones.length === 0) return [];
    const quotes = await this.provider.quote(input, configuration);
    if (quotes.length === 0) {
      throw new ConflictAppError({ code: 'SHIPPING_NOT_AVAILABLE' });
    }
    return quotes;
  }

  close(): Promise<void> {
    return this.repository.close();
  }
}
