import { NotFoundAppError, ValidationAppError } from '../../../errors/index.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import type {
  CreatePendingOrderInput,
  CreatedPendingOrder,
  CustomerOrder,
  OrderOwner,
  OrdersRepository,
} from '../domain/orders.js';

const ORDER_NUMBER = /^HNY-[0-9]{4}-[0-9]{6}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function validation(path: string, code: string): ValidationAppError {
  return new ValidationAppError([{ path, code }]);
}

function identifier(value: string, path: string): string {
  if (!UUID.test(value)) throw validation(path, 'ORDER_ID_INVALID');
  return value;
}

function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw validation('limit', 'ORDER_LIMIT_INVALID');
  }
  return value;
}

/**
 * Owns customer order writes and reads. Checkout supplies only server-derived
 * values inside its encompassing transaction; this service never accepts a
 * browser monetary amount or order status.
 */
export class OrdersService {
  constructor(private readonly repository: OrdersRepository) {}

  createPendingOrder(
    input: CreatePendingOrderInput,
    transaction: TransactionContext,
  ): Promise<CreatedPendingOrder> {
    this.#validateCreate(input);
    return this.repository.createPendingOrder(input, transaction);
  }

  async getOwnedOrder(numberInput: string, owner: OrderOwner): Promise<CustomerOrder> {
    const number = numberInput.normalize('NFKC').trim().toUpperCase();
    if (!ORDER_NUMBER.test(number)) throw new NotFoundAppError();
    const order = await this.repository.findOwnedOrder(number, owner);
    if (order === null) throw new NotFoundAppError();
    return order;
  }

  listForUser(userIdInput: string, limit = 24): Promise<readonly CustomerOrder[]> {
    return this.repository.listOrdersForUser(
      identifier(userIdInput, 'userId'),
      boundedLimit(limit),
    );
  }

  findByCheckoutSession(
    checkoutSessionIdInput: string,
    transaction: TransactionContext,
  ): Promise<CreatedPendingOrder | null> {
    return this.repository.findByCheckoutSession(
      identifier(checkoutSessionIdInput, 'checkoutSessionId'),
      transaction,
    );
  }

  #validateCreate(input: CreatePendingOrderInput): void {
    identifier(input.checkoutSessionId, 'checkoutSessionId');
    if (input.userId !== null) identifier(input.userId, 'userId');
    if (input.lines.length === 0) throw validation('lines', 'ORDER_LINES_REQUIRED');
    if (
      input.subtotalMinor < 0n ||
      input.discountTotalMinor < 0n ||
      input.shippingTotalMinor < 0n ||
      input.taxTotalMinor < 0n ||
      input.grandTotalMinor < 0n
    ) {
      throw validation('totals', 'ORDER_TOTAL_INVALID');
    }
    const lineTotal = input.lines.reduce((total, line) => total + line.lineTotalMinor, 0n);
    const merchandiseTotal = input.subtotalMinor - input.discountTotalMinor;
    // Each persisted order line stores a gross total (`order_line_values`
    // requires unitPrice*quantity - discount + tax); for tax-exclusive orders
    // that gross total already carries the line's apportioned tax, so the
    // sum across lines reconciles against merchandise plus tax, not
    // merchandise alone.
    const expectedLineTotal = merchandiseTotal + (input.taxInclusive ? 0n : input.taxTotalMinor);
    const expectedGrand =
      merchandiseTotal + input.shippingTotalMinor + (input.taxInclusive ? 0n : input.taxTotalMinor);
    if (lineTotal !== expectedLineTotal || expectedGrand !== input.grandTotalMinor) {
      throw validation('totals', 'ORDER_TOTAL_MISMATCH');
    }
    for (const line of input.lines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
        throw validation('lines.quantity', 'ORDER_LINE_QUANTITY_INVALID');
      }
      if (
        line.unitPriceMinor < 0n ||
        line.discountAllocatedMinor < 0n ||
        line.taxAmountMinor < 0n ||
        line.lineTotalMinor < 0n ||
        line.discountAllocatedMinor > line.unitPriceMinor * BigInt(line.quantity)
      ) {
        throw validation('lines', 'ORDER_LINE_TOTAL_INVALID');
      }
    }
  }
}
