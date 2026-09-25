import { createPrismaClient, Prisma, type PrismaClient } from '@honey/db';

import { asPrismaTransaction } from '../../../../platform/infrastructure/prisma-platform.adapter.js';
import type { TransactionContext } from '../../../../platform/domain/transaction.js';
import type { CheckoutShippingQuoteRepository } from '../domain/checkout-shipping-quote.port.js';
import type {
  StandardShippingQuote,
  StandardShippingQuoteDraft,
  StoredShippingQuote,
} from '../domain/standard-shipping-quote.js';

type Client = PrismaClient | ReturnType<typeof asPrismaTransaction>;

type QuoteRow = Readonly<{
  id: string;
  checkoutSessionId: string;
  methodCode: string;
  amountMinor: bigint;
  currency: string;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  expiresAt: Date;
  createdAt: Date;
}>;

function mapQuote(row: QuoteRow): StoredShippingQuote {
  return {
    id: row.id,
    checkoutSessionId: row.checkoutSessionId,
    methodCode: row.methodCode,
    amountMinor: row.amountMinor,
    currency: row.currency,
    estimatedDaysMin: row.estimatedDaysMin,
    estimatedDaysMax: row.estimatedDaysMax,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

function asStandardQuote(row: QuoteRow): StandardShippingQuote {
  const quote = mapQuote(row);
  if (
    quote.methodCode !== 'STANDARD' ||
    quote.estimatedDaysMin !== 0 ||
    quote.estimatedDaysMax !== 0
  ) {
    throw new TypeError('Persisted quote is not a Phase 13 STANDARD quote.');
  }
  return {
    ...quote,
    methodCode: 'STANDARD',
    estimatedDaysMin: 0,
    estimatedDaysMax: 0,
  };
}

function clientFor(client: PrismaClient, transaction: TransactionContext | undefined): Client {
  return transaction === undefined ? client : asPrismaTransaction(transaction);
}

/**
 * Owns only checkout_session and shipping_quote persistence. Callers must
 * supply their encompassing checkout transaction so quote selection commits
 * atomically with its checkout state.
 */
export class PrismaCheckoutShippingQuoteRepository implements CheckoutShippingQuoteRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  async createAndSelect(
    quote: StandardShippingQuoteDraft,
    transaction: TransactionContext,
  ): Promise<StandardShippingQuote> {
    const client = asPrismaTransaction(transaction);
    const created = await client.shippingQuote.create({
      data: {
        id: quote.id,
        checkoutSessionId: quote.checkoutSessionId,
        methodCode: quote.methodCode,
        amountMinor: quote.amountMinor,
        currency: quote.currency,
        estimatedDaysMin: quote.estimatedDaysMin,
        estimatedDaysMax: quote.estimatedDaysMax,
        expiresAt: quote.expiresAt,
        createdAt: quote.createdAt,
        createdBy: quote.actorUserId,
        updatedBy: quote.actorUserId,
      },
    });
    await client.checkoutSession.update({
      where: { id: quote.checkoutSessionId },
      data: {
        shippingMethodCode: quote.methodCode,
        shippingQuoteId: created.id,
        updatedBy: quote.actorUserId,
      },
    });
    return asStandardQuote(created);
  }

  async lockSelected(
    checkoutSessionId: string,
    transaction: TransactionContext,
  ): Promise<StoredShippingQuote | null> {
    const client = clientFor(this.#client, transaction);
    const sessions = await client.$queryRaw<
      readonly Readonly<{ shippingQuoteId: string | null }>[]
    >(
      Prisma.sql`
        SELECT "shipping_quote_id" AS "shippingQuoteId"
        FROM "checkout_session"
        WHERE "id" = ${checkoutSessionId}::uuid
        FOR UPDATE
      `,
    );
    const session = sessions[0];
    if (session === undefined || session.shippingQuoteId === null) return null;

    await client.$queryRaw(
      Prisma.sql`
        SELECT "id"
        FROM "shipping_quote"
        WHERE "id" = ${session.shippingQuoteId}::uuid
        FOR UPDATE
      `,
    );
    const quote = await client.shippingQuote.findUnique({
      where: { id: session.shippingQuoteId },
      select: {
        id: true,
        checkoutSessionId: true,
        methodCode: true,
        amountMinor: true,
        currency: true,
        estimatedDaysMin: true,
        estimatedDaysMax: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    if (quote === null) return null;
    const mapped = mapQuote(quote);
    if (mapped.checkoutSessionId !== checkoutSessionId) {
      throw new TypeError('Selected shipping quote does not belong to its checkout session.');
    }
    return mapped;
  }

  close(): Promise<void> {
    return this.#client.$disconnect();
  }
}
