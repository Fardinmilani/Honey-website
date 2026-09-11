export type Money = Readonly<{
  amountMinor: bigint;
  currency: string;
}>;

export type SerializedMoney = Readonly<{
  amountMinor: string;
  currency: string;
}>;

const ISO_CURRENCY = /^[A-Za-z]{3}$/u;
const SERIALIZED_MINOR_AMOUNT = /^(?:0|[1-9][0-9]*)$/u;

export function normalizeCurrency(value: string): string {
  const candidate = value.normalize('NFKC').trim();
  if (!ISO_CURRENCY.test(candidate)) throw new TypeError('Currency must be an ISO-4217 code.');
  return candidate.toUpperCase();
}

export function assertNonNegativeMinor(value: bigint, field = 'amountMinor'): bigint {
  if (value < 0n) throw new TypeError(`${field} must not be negative.`);
  return value;
}

export function createMoney(amountMinor: bigint, currency: string): Money {
  return {
    amountMinor: assertNonNegativeMinor(amountMinor),
    currency: normalizeCurrency(currency),
  };
}

export function serializeMoney(value: Money): SerializedMoney {
  const money = createMoney(value.amountMinor, value.currency);
  return {
    amountMinor: money.amountMinor.toString(),
    currency: money.currency,
  };
}

export function deserializeMoney(value: SerializedMoney): Money {
  if (!SERIALIZED_MINOR_AMOUNT.test(value.amountMinor)) {
    throw new TypeError('Serialized monetary amount must be a non-negative integer string.');
  }
  return createMoney(BigInt(value.amountMinor), value.currency);
}

export function addMoney(left: Money, right: Money): Money {
  const currency = assertSameCurrency(left, right);
  return createMoney(left.amountMinor + right.amountMinor, currency);
}

export function subtractMoney(left: Money, right: Money): Money {
  const currency = assertSameCurrency(left, right);
  if (right.amountMinor > left.amountMinor) {
    throw new RangeError('Money subtraction cannot produce a negative amount.');
  }
  return createMoney(left.amountMinor - right.amountMinor, currency);
}

function assertSameCurrency(left: Money, right: Money): string {
  const leftCurrency = normalizeCurrency(left.currency);
  const rightCurrency = normalizeCurrency(right.currency);
  assertNonNegativeMinor(left.amountMinor);
  assertNonNegativeMinor(right.amountMinor);
  if (leftCurrency !== rightCurrency) throw new TypeError('Money currencies must match.');
  return leftCurrency;
}
