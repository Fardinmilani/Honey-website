import { assertNonNegativeMinor, normalizeCurrency } from './money.js';

const BASIS_POINTS = 10_000n;
const MAX_TAX_BASIS_POINTS = 10_000;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/u;

export const COUPON_TYPES = ['PERCENT', 'FIXED', 'FREE_SHIPPING'] as const;
export const COUPON_APPLIES_TO = ['ALL', 'CATEGORY', 'COLLECTION', 'VARIANT'] as const;
export const COUPON_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED'] as const;

export type CouponType = (typeof COUPON_TYPES)[number];
export type CouponAppliesTo = (typeof COUPON_APPLIES_TO)[number];
export type CouponStatus = (typeof COUPON_STATUSES)[number];

export type VariantPriceRecord = Readonly<{
  id: string;
  variantId: string;
  currency: string;
  amountMinor: bigint;
  compareAtMinor: bigint | null;
  validFrom: Date;
  validTo: Date | null;
}>;

export type CurrentPriceResolutionInput = Readonly<{
  prices: readonly VariantPriceRecord[];
  variantId: string;
  currency: string;
  now: Date;
  variantExists: boolean;
  enabledCurrencies: readonly string[];
}>;

export type CouponRecord = Readonly<{
  id: string;
  code: string;
  type: CouponType;
  value: bigint;
  currency: string | null;
  minSubtotalMinor: bigint | null;
  maxDiscountMinor: bigint | null;
  startsAt: Date;
  endsAt: Date | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number | null;
  usedCount: number;
  appliesTo: CouponAppliesTo;
  targetIds: readonly string[];
  status: CouponStatus;
}>;

export type CouponLine = Readonly<{
  id: string;
  variantId: string;
  categoryIds: readonly string[];
  collectionIds: readonly string[];
  subtotalMinor: bigint;
}>;

export type CouponEligibilityInput = Readonly<{
  coupon: CouponRecord;
  currency: string;
  now: Date;
  cartSubtotalMinor: bigint;
  lines: readonly CouponLine[];
  customerRedemptionCount: number | null;
}>;

export type CouponIneligibilityReason =
  | 'COUPON_NOT_ACTIVE'
  | 'COUPON_NOT_STARTED'
  | 'COUPON_EXPIRED'
  | 'COUPON_CURRENCY_MISMATCH'
  | 'COUPON_USAGE_LIMIT_REACHED'
  | 'COUPON_PER_USER_LIMIT_REACHED'
  | 'COUPON_MINIMUM_SUBTOTAL_NOT_MET'
  | 'COUPON_TARGET_MISMATCH';

export type CouponEffect = Readonly<{
  type: CouponType;
  discountMinor: bigint;
  shippingEffect: 'NONE' | 'DEFERRED';
}>;

export type CouponEvaluation =
  | Readonly<{
      eligible: true;
      reason: null;
      eligibleLineIds: readonly string[];
      perUserLimitDeferred: boolean;
      effect: CouponEffect;
    }>
  | Readonly<{
      eligible: false;
      reason: CouponIneligibilityReason;
      eligibleLineIds: readonly string[];
      perUserLimitDeferred: false;
      effect: null;
    }>;

export type DiscountAllocationLine = Readonly<{
  id: string;
  subtotalMinor: bigint;
  eligible: boolean;
}>;

export type DiscountAllocation = Readonly<{
  id: string;
  subtotalMinor: bigint;
  discountMinor: bigint;
  finalTotalMinor: bigint;
}>;

export type DiscountAllocationResult = Readonly<{
  discountMinor: bigint;
  finalMerchandiseTotalMinor: bigint;
  lines: readonly DiscountAllocation[];
}>;

export type TaxRateRecord = Readonly<{
  id: string;
  code: string;
  rateBps: number;
  country: string;
  region: string | null;
  isInclusive: boolean;
  isActive: boolean;
}>;

export type TaxJurisdiction = Readonly<{
  country: string;
  region: string | null;
}>;

export type TaxResolutionInput = Readonly<{
  rates: readonly TaxRateRecord[];
  jurisdiction: TaxJurisdiction;
}>;

export type TaxCalculation =
  | Readonly<{
      state: 'RESOLVED';
      rate: TaxRateRecord;
      taxableAmountMinor: bigint;
      netAmountMinor: bigint;
      taxAmountMinor: bigint;
      totalAmountMinor: bigint;
    }>
  | Readonly<{
      state: 'UNRESOLVED';
      rate: null;
      taxableAmountMinor: bigint;
      netAmountMinor: null;
      taxAmountMinor: null;
      totalAmountMinor: null;
    }>;

export function resolveCurrentPrice(input: CurrentPriceResolutionInput): VariantPriceRecord | null {
  const variantId = assertIdentifier(input.variantId, 'variantId');
  if (!input.variantExists) throw new TypeError('Variant must exist before resolving price.');
  const currency = assertEnabledCurrency(input.currency, input.enabledCurrencies);
  const now = timestamp(input.now, 'now');
  let selected: VariantPriceRecord | null = null;

  for (const price of input.prices) {
    if (price.variantId !== variantId || normalizeCurrency(price.currency) !== currency) continue;
    const validated = validateVariantPrice(price, input.enabledCurrencies, input.variantExists);
    const validFrom = timestamp(validated.validFrom, 'validFrom');
    const validTo = validated.validTo === null ? null : timestamp(validated.validTo, 'validTo');
    const isActive = validFrom <= now && (validTo === null || validTo > now);
    if (!isActive) continue;
    if (selected === null) {
      selected = validated;
      continue;
    }
    const selectedFrom = timestamp(selected.validFrom, 'validFrom');
    if (validFrom === selectedFrom) {
      throw new TypeError('Current price resolution is ambiguous.');
    }
    if (validFrom > selectedFrom) selected = validated;
  }

  return selected;
}

export function validateVariantPrice(
  input: VariantPriceRecord,
  enabledCurrencies: readonly string[],
  variantExists: boolean,
): VariantPriceRecord {
  if (!variantExists) throw new TypeError('Variant must exist before creating a price.');
  const id = assertIdentifier(input.id, 'priceId');
  const variantId = assertIdentifier(input.variantId, 'variantId');
  const currency = assertEnabledCurrency(input.currency, enabledCurrencies);
  const amountMinor = assertNonNegativeMinor(input.amountMinor, 'amountMinor');
  const compareAtMinor =
    input.compareAtMinor === null
      ? null
      : assertNonNegativeMinor(input.compareAtMinor, 'compareAtMinor');
  const validFrom = timestamp(input.validFrom, 'validFrom');
  const validTo = input.validTo === null ? null : timestamp(input.validTo, 'validTo');
  if (validTo !== null && validTo <= validFrom) {
    throw new TypeError('Price validity end must be after its validity start.');
  }
  return {
    id,
    variantId,
    currency,
    amountMinor,
    compareAtMinor,
    validFrom: input.validFrom,
    validTo: input.validTo,
  };
}

export function normalizeCouponCode(value: string): string {
  const candidate = value.normalize('NFKC').trim();
  if (
    candidate.length < 1 ||
    candidate.length > 64 ||
    CONTROL_CHARACTERS.test(candidate) ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(candidate)
  ) {
    throw new TypeError('Coupon code is invalid.');
  }
  return candidate.toUpperCase();
}

export function evaluateCoupon(input: CouponEligibilityInput): CouponEvaluation {
  const coupon = validateCoupon(input.coupon);
  const currency = normalizeCurrency(input.currency);
  const now = timestamp(input.now, 'now');
  const cartSubtotalMinor = assertNonNegativeMinor(input.cartSubtotalMinor, 'cartSubtotalMinor');
  const lines = normalizeCouponLines(input.lines);
  const eligibleLineIds = matchingCouponLineIds(coupon, lines);
  const customerRedemptionCount =
    input.customerRedemptionCount === null
      ? null
      : boundedNonNegativeInteger(input.customerRedemptionCount, 'customerRedemptionCount');

  if (coupon.status !== 'ACTIVE') return ineligible('COUPON_NOT_ACTIVE', eligibleLineIds);
  if (timestamp(coupon.startsAt, 'startsAt') > now) {
    return ineligible('COUPON_NOT_STARTED', eligibleLineIds);
  }
  if (coupon.endsAt !== null && timestamp(coupon.endsAt, 'endsAt') <= now) {
    return ineligible('COUPON_EXPIRED', eligibleLineIds);
  }
  if (coupon.currency !== null && coupon.currency !== currency) {
    return ineligible('COUPON_CURRENCY_MISMATCH', eligibleLineIds);
  }
  if (coupon.usageLimitTotal !== null && coupon.usedCount >= coupon.usageLimitTotal) {
    return ineligible('COUPON_USAGE_LIMIT_REACHED', eligibleLineIds);
  }
  if (
    coupon.usageLimitPerUser !== null &&
    customerRedemptionCount !== null &&
    customerRedemptionCount >= coupon.usageLimitPerUser
  ) {
    return ineligible('COUPON_PER_USER_LIMIT_REACHED', eligibleLineIds);
  }
  if (coupon.minSubtotalMinor !== null && cartSubtotalMinor < coupon.minSubtotalMinor) {
    return ineligible('COUPON_MINIMUM_SUBTOTAL_NOT_MET', eligibleLineIds);
  }
  if (eligibleLineIds.length === 0) return ineligible('COUPON_TARGET_MISMATCH', eligibleLineIds);

  const eligibleSubtotalMinor = sumMinor(
    lines.filter((line) => eligibleLineIds.includes(line.id)).map((line) => line.subtotalMinor),
  );
  return {
    eligible: true,
    reason: null,
    eligibleLineIds,
    perUserLimitDeferred: coupon.usageLimitPerUser !== null && customerRedemptionCount === null,
    effect: calculateCouponEffect({ coupon, currency, eligibleSubtotalMinor }),
  };
}

export function calculateCouponEffect(
  input: Readonly<{
    coupon: CouponRecord;
    currency: string;
    eligibleSubtotalMinor: bigint;
  }>,
): CouponEffect {
  const coupon = validateCoupon(input.coupon);
  const currency = normalizeCurrency(input.currency);
  const eligibleSubtotalMinor = assertNonNegativeMinor(
    input.eligibleSubtotalMinor,
    'eligibleSubtotalMinor',
  );
  if (coupon.currency !== null && coupon.currency !== currency) {
    throw new TypeError('Coupon currency does not match cart currency.');
  }
  if (coupon.type === 'FREE_SHIPPING') {
    return { type: coupon.type, discountMinor: 0n, shippingEffect: 'DEFERRED' };
  }
  const requestedDiscountMinor =
    coupon.type === 'PERCENT'
      ? divideRoundHalfUp(eligibleSubtotalMinor * coupon.value, BASIS_POINTS)
      : coupon.value;
  const cap = coupon.maxDiscountMinor ?? requestedDiscountMinor;
  const discountMinor = minimum(eligibleSubtotalMinor, minimum(requestedDiscountMinor, cap));
  return { type: coupon.type, discountMinor, shippingEffect: 'NONE' };
}

export function allocateProportionalDiscount(
  lines: readonly DiscountAllocationLine[],
  discountMinor: bigint,
): DiscountAllocationResult {
  const normalizedLines = normalizeAllocationLines(lines);
  const requestedDiscountMinor = assertNonNegativeMinor(discountMinor, 'discountMinor');
  const eligibleSubtotalMinor = sumMinor(
    normalizedLines.filter((line) => line.eligible).map((line) => line.subtotalMinor),
  );
  if (requestedDiscountMinor > eligibleSubtotalMinor) {
    throw new RangeError('Discount cannot exceed eligible line subtotal.');
  }
  if (requestedDiscountMinor === 0n || eligibleSubtotalMinor === 0n) {
    return allocationResult(normalizedLines, new Map<string, bigint>(), requestedDiscountMinor);
  }

  const shares = new Map<string, bigint>();
  let allocatedMinor = 0n;
  const eligibleLines = normalizedLines.filter((line) => line.eligible && line.subtotalMinor > 0n);
  for (const line of eligibleLines) {
    const share = (requestedDiscountMinor * line.subtotalMinor) / eligibleSubtotalMinor;
    shares.set(line.id, share);
    allocatedMinor += share;
  }

  let remainder = requestedDiscountMinor - allocatedMinor;
  for (const line of eligibleLines) {
    if (remainder === 0n) break;
    const share = shares.get(line.id);
    if (share === undefined) throw new Error('Discount allocation state is invalid.');
    shares.set(line.id, share + 1n);
    remainder -= 1n;
  }
  if (remainder !== 0n) throw new Error('Discount allocation remainder was not exhausted.');
  return allocationResult(normalizedLines, shares, requestedDiscountMinor);
}

export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  assertNonNegativeMinor(numerator, 'numerator');
  if (denominator <= 0n) throw new RangeError('denominator must be positive.');
  return (numerator + denominator / 2n) / denominator;
}

export function resolveTaxRate(input: TaxResolutionInput): TaxRateRecord | null {
  const jurisdiction = normalizeJurisdiction(input.jurisdiction);
  const rates = input.rates.map(validateTaxRate);
  const countryRates = rates.filter(
    (rate) => rate.isActive && rate.country === jurisdiction.country,
  );
  if (jurisdiction.region !== null) {
    const regional = countryRates.filter((rate) => rate.region === jurisdiction.region);
    if (regional.length > 1)
      throw new TypeError('Tax-rate selection is ambiguous for this region.');
    const regionalRate = regional[0];
    if (regionalRate !== undefined) return regionalRate;
  }
  const countryWide = countryRates.filter((rate) => rate.region === null);
  if (countryWide.length > 1)
    throw new TypeError('Tax-rate selection is ambiguous for this country.');
  return countryWide[0] ?? null;
}

export function calculateTax(
  input: Readonly<{
    taxableAmountMinor: bigint;
    rate: TaxRateRecord | null;
  }>,
): TaxCalculation {
  const taxableAmountMinor = assertNonNegativeMinor(input.taxableAmountMinor, 'taxableAmountMinor');
  if (input.rate === null) {
    return {
      state: 'UNRESOLVED',
      rate: null,
      taxableAmountMinor,
      netAmountMinor: null,
      taxAmountMinor: null,
      totalAmountMinor: null,
    };
  }
  const rate = validateTaxRate(input.rate);
  const rateBps = BigInt(rate.rateBps);
  if (rate.isInclusive) {
    const taxAmountMinor = divideRoundHalfUp(taxableAmountMinor * rateBps, BASIS_POINTS + rateBps);
    return {
      state: 'RESOLVED',
      rate,
      taxableAmountMinor,
      netAmountMinor: taxableAmountMinor - taxAmountMinor,
      taxAmountMinor,
      totalAmountMinor: taxableAmountMinor,
    };
  }
  const taxAmountMinor = divideRoundHalfUp(taxableAmountMinor * rateBps, BASIS_POINTS);
  return {
    state: 'RESOLVED',
    rate,
    taxableAmountMinor,
    netAmountMinor: taxableAmountMinor,
    taxAmountMinor,
    totalAmountMinor: taxableAmountMinor + taxAmountMinor,
  };
}

export function validateTaxRate(input: TaxRateRecord): TaxRateRecord {
  const id = assertIdentifier(input.id, 'taxRateId');
  const code = normalizeTaxCode(input.code);
  const country = normalizeCountry(input.country);
  const region = input.region === null ? null : normalizeRegion(input.region);
  if (
    !Number.isSafeInteger(input.rateBps) ||
    input.rateBps < 0 ||
    input.rateBps > MAX_TAX_BASIS_POINTS
  ) {
    throw new TypeError('Tax rate basis points are invalid.');
  }
  return {
    id,
    code,
    rateBps: input.rateBps,
    country,
    region,
    isInclusive: input.isInclusive,
    isActive: input.isActive,
  };
}

export function validateCoupon(input: CouponRecord): CouponRecord {
  const id = assertIdentifier(input.id, 'couponId');
  const code = normalizeCouponCode(input.code);
  if (!COUPON_TYPES.includes(input.type)) throw new TypeError('Coupon type is invalid.');
  if (!COUPON_APPLIES_TO.includes(input.appliesTo))
    throw new TypeError('Coupon target is invalid.');
  if (!COUPON_STATUSES.includes(input.status)) throw new TypeError('Coupon status is invalid.');
  const value = assertNonNegativeMinor(input.value, 'coupon value');
  if (input.type === 'PERCENT' && value > BASIS_POINTS) {
    throw new TypeError('Percentage coupon value exceeds 100 percent.');
  }
  const currency = input.currency === null ? null : normalizeCurrency(input.currency);
  if (input.type === 'FIXED' && currency === null) {
    throw new TypeError('Fixed coupons require a currency.');
  }
  const minSubtotalMinor =
    input.minSubtotalMinor === null
      ? null
      : assertNonNegativeMinor(input.minSubtotalMinor, 'minSubtotalMinor');
  const maxDiscountMinor =
    input.maxDiscountMinor === null
      ? null
      : assertNonNegativeMinor(input.maxDiscountMinor, 'maxDiscountMinor');
  const startsAt = timestamp(input.startsAt, 'startsAt');
  const endsAt = input.endsAt === null ? null : timestamp(input.endsAt, 'endsAt');
  if (endsAt !== null && endsAt <= startsAt) {
    throw new TypeError('Coupon end must be after its start.');
  }
  const usageLimitTotal = nullableNonNegativeInteger(input.usageLimitTotal, 'usageLimitTotal');
  const usageLimitPerUser = nullableNonNegativeInteger(
    input.usageLimitPerUser,
    'usageLimitPerUser',
  );
  const usedCount = boundedNonNegativeInteger(input.usedCount, 'usedCount');
  const targetIds = normalizeTargetIds(input.targetIds);
  if (input.appliesTo !== 'ALL' && targetIds.length === 0) {
    throw new TypeError('Targeted coupons require at least one target.');
  }
  return {
    id,
    code,
    type: input.type,
    value,
    currency,
    minSubtotalMinor,
    maxDiscountMinor,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    usageLimitTotal,
    usageLimitPerUser,
    usedCount,
    appliesTo: input.appliesTo,
    targetIds,
    status: input.status,
  };
}

function normalizeCouponLines(lines: readonly CouponLine[]): readonly CouponLine[] {
  const ids = new Set<string>();
  return [...lines]
    .map((line) => {
      const id = assertIdentifier(line.id, 'coupon line id');
      if (ids.has(id)) throw new TypeError('Coupon line ids must be unique.');
      ids.add(id);
      return {
        id,
        variantId: assertIdentifier(line.variantId, 'coupon line variantId'),
        categoryIds: normalizeTargetIds(line.categoryIds),
        collectionIds: normalizeTargetIds(line.collectionIds),
        subtotalMinor: assertNonNegativeMinor(line.subtotalMinor, 'coupon line subtotalMinor'),
      };
    })
    .sort(compareLineIds);
}

function matchingCouponLineIds(
  coupon: CouponRecord,
  lines: readonly CouponLine[],
): readonly string[] {
  return lines
    .filter((line) => couponAppliesToLine(coupon, line))
    .map((line) => line.id)
    .sort(compareStrings);
}

function couponAppliesToLine(coupon: CouponRecord, line: CouponLine): boolean {
  if (coupon.appliesTo === 'ALL') return true;
  if (coupon.appliesTo === 'VARIANT') return coupon.targetIds.includes(line.variantId);
  const targetIds = coupon.appliesTo === 'CATEGORY' ? line.categoryIds : line.collectionIds;
  return targetIds.some((targetId) => coupon.targetIds.includes(targetId));
}

function ineligible(
  reason: CouponIneligibilityReason,
  eligibleLineIds: readonly string[],
): CouponEvaluation {
  return {
    eligible: false,
    reason,
    eligibleLineIds,
    perUserLimitDeferred: false,
    effect: null,
  };
}

function normalizeAllocationLines(
  lines: readonly DiscountAllocationLine[],
): readonly DiscountAllocationLine[] {
  const ids = new Set<string>();
  return [...lines]
    .map((line) => {
      const id = assertIdentifier(line.id, 'discount line id');
      if (ids.has(id)) throw new TypeError('Discount line ids must be unique.');
      ids.add(id);
      return {
        id,
        subtotalMinor: assertNonNegativeMinor(line.subtotalMinor, 'discount line subtotalMinor'),
        eligible: line.eligible,
      };
    })
    .sort(compareLineIds);
}

function allocationResult(
  lines: readonly DiscountAllocationLine[],
  shares: ReadonlyMap<string, bigint>,
  discountMinor: bigint,
): DiscountAllocationResult {
  const allocations = lines.map((line) => {
    const lineDiscountMinor = shares.get(line.id) ?? 0n;
    if (lineDiscountMinor > line.subtotalMinor) {
      throw new Error('Discount allocation exceeds its line subtotal.');
    }
    return {
      id: line.id,
      subtotalMinor: line.subtotalMinor,
      discountMinor: lineDiscountMinor,
      finalTotalMinor: line.subtotalMinor - lineDiscountMinor,
    };
  });
  const allocatedMinor = sumMinor(allocations.map((line) => line.discountMinor));
  if (allocatedMinor !== discountMinor) throw new Error('Discount allocation is not exact.');
  return {
    discountMinor,
    finalMerchandiseTotalMinor: sumMinor(allocations.map((line) => line.finalTotalMinor)),
    lines: allocations,
  };
}

function normalizeJurisdiction(input: TaxJurisdiction): TaxJurisdiction {
  return {
    country: normalizeCountry(input.country),
    region: input.region === null ? null : normalizeRegion(input.region),
  };
}

function assertEnabledCurrency(value: string, enabledCurrencies: readonly string[]): string {
  const currency = normalizeCurrency(value);
  const enabled = new Set(enabledCurrencies.map(normalizeCurrency));
  if (!enabled.has(currency)) throw new TypeError('Currency is not enabled.');
  return currency;
}

function assertIdentifier(value: string, field: string): string {
  const normalized = value.normalize('NFC').trim();
  if (normalized.length < 1 || normalized.length > 255 || CONTROL_CHARACTERS.test(normalized)) {
    throw new TypeError(`${field} is invalid.`);
  }
  return normalized;
}

function timestamp(value: Date, field: string): number {
  const result = value.getTime();
  if (!Number.isFinite(result)) throw new TypeError(`${field} is invalid.`);
  return result;
}

function nullableNonNegativeInteger(value: number | null, field: string): number | null {
  return value === null ? null : boundedNonNegativeInteger(value, field);
}

function boundedNonNegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${field} is invalid.`);
  return value;
}

function normalizeTargetIds(values: readonly string[]): readonly string[] {
  const normalized = values
    .map((value) => assertIdentifier(value, 'targetId'))
    .sort(compareStrings);
  if (new Set(normalized).size !== normalized.length)
    throw new TypeError('Target ids must be unique.');
  return normalized;
}

function normalizeCountry(value: string): string {
  const candidate = value.normalize('NFKC').trim();
  if (!/^[A-Za-z]{2}$/u.test(candidate)) throw new TypeError('Tax country is invalid.');
  return candidate.toUpperCase();
}

function normalizeRegion(value: string): string {
  const candidate = value.normalize('NFKC').trim();
  if (
    candidate.length < 1 ||
    candidate.length > 64 ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(candidate)
  ) {
    throw new TypeError('Tax region is invalid.');
  }
  return candidate.toUpperCase();
}

function normalizeTaxCode(value: string): string {
  const candidate = value.normalize('NFKC').trim();
  if (
    candidate.length < 1 ||
    candidate.length > 64 ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(candidate)
  ) {
    throw new TypeError('Tax code is invalid.');
  }
  return candidate.toUpperCase();
}

function sumMinor(values: readonly bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, 0n);
}

function minimum(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function compareLineIds(left: Readonly<{ id: string }>, right: Readonly<{ id: string }>): number {
  return compareStrings(left.id, right.id);
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
