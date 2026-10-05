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
  providerPayload: Prisma.JsonValue | null;
}>;

function payloadField(payload: Prisma.JsonValue | null, name: string): string | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const value = payload[name];
  return typeof value === 'string' ? value : null;
}

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
    contextFingerprint: payloadField(row.providerPayload, 'contextFingerprint'),
    methodName: payloadField(row.providerPayload, 'methodName'),
    providerCode: payloadField(row.providerPayload, 'providerCode'),
  };
}

function asStandardQuote(row: QuoteRow): StandardShippingQuote {
  const quote = mapQuote(row);
  return {
    id: quote.id,
    checkoutSessionId: quote.checkoutSessionId,
    methodCode: quote.methodCode,
    amountMinor: quote.amountMinor,
    currency: quote.currency,
    estimatedDaysMin: quote.estimatedDaysMin,
    estimatedDaysMax: quote.estimatedDaysMax,
    expiresAt: quote.expiresAt,
    createdAt: quote.createdAt,
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
        ...(quote.contextFingerprint === undefined
          ? {}
          : {
              providerPayload: {
                contextFingerprint: quote.contextFingerprint,
                methodName: quote.methodName ?? quote.methodCode,
                providerCode: quote.providerCode ?? 'manual-flat',
              },
            }),
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

  async createOptionsAndSelect(
    quotes: readonly StandardShippingQuoteDraft[],
    selectedQuoteId: string,
    transaction: TransactionContext,
  ): Promise<readonly StoredShippingQuote[]> {
    if (quotes.length === 0 || !quotes.some((quote) => quote.id === selectedQuoteId)) {
      throw new TypeError('Selected shipping quote must belong to generated options.');
    }
    const client = asPrismaTransaction(transaction);
    const created: StoredShippingQuote[] = [];
    for (const quote of quotes) {
      const row = await client.shippingQuote.create({
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
          providerPayload: {
            contextFingerprint: quote.contextFingerprint ?? '',
            methodName: quote.methodName ?? quote.methodCode,
            providerCode: quote.providerCode ?? 'manual-flat',
          },
        },
      });
      created.push(mapQuote(row));
    }
    const selected = quotes.find((quote) => quote.id === selectedQuoteId);
    if (selected === undefined) throw new TypeError('Selected quote is missing.');
    await client.checkoutSession.update({
      where: { id: selected.checkoutSessionId },
      data: {
        shippingMethodCode: selected.methodCode,
        shippingQuoteId: selected.id,
        updatedBy: selected.actorUserId,
      },
    });
    return created;
  }

  async findForCheckout(
    checkoutSessionId: string,
    quoteId: string,
    transaction: TransactionContext,
  ): Promise<StoredShippingQuote | null> {
    const row = await asPrismaTransaction(transaction).shippingQuote.findFirst({
      where: { id: quoteId, checkoutSessionId },
    });
    return row === null ? null : mapQuote(row);
  }

  async listCurrentForCheckout(
    checkoutSessionId: string,
    contextFingerprint: string,
    now: Date,
    transaction: TransactionContext,
  ): Promise<readonly StoredShippingQuote[]> {
    const rows = await asPrismaTransaction(transaction).shippingQuote.findMany({
      where: { checkoutSessionId, expiresAt: { gt: now } },
      orderBy: [{ createdAt: 'desc' }, { methodCode: 'asc' }],
    });
    const current = rows
      .map(mapQuote)
      .filter((quote) => quote.contextFingerprint === contextFingerprint);
    const byMethod = new Map<string, StoredShippingQuote>();
    for (const quote of current) {
      if (!byMethod.has(quote.methodCode)) byMethod.set(quote.methodCode, quote);
    }
    return [...byMethod.values()];
  }

  async selectExisting(
    checkoutSessionId: string,
    quoteId: string,
    actorUserId: string | null,
    transaction: TransactionContext,
  ): Promise<void> {
    const quote = await this.findForCheckout(checkoutSessionId, quoteId, transaction);
    if (quote === null) throw new TypeError('Shipping quote does not belong to checkout.');
    await asPrismaTransaction(transaction).checkoutSession.update({
      where: { id: checkoutSessionId },
      data: {
        shippingMethodCode: quote.methodCode,
        shippingQuoteId: quote.id,
        updatedBy: actorUserId,
      },
    });
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
        providerPayload: true,
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
