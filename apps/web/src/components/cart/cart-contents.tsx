'use client';

import { formatMinorMoney, type Locale } from '@honey/i18n';
import Image from 'next/image';
import NextLink from 'next/link';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { cartMessages } from './messages';
import styles from './cart.module.css';

type CartMoney = Readonly<{
  amountMinor: string;
  currency: string;
}>;

type CartLineState = 'PURCHASABLE' | 'OUT_OF_STOCK' | 'UNPUBLISHED' | 'PRICE_UNAVAILABLE';
type AvailabilityBand = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
type CouponState = 'APPLIED' | 'INELIGIBLE' | 'DEFERRED';

type CartLine = Readonly<{
  id: string;
  variantId: string;
  product: Readonly<{
    id: string;
    name: string;
    slug: string;
    imageUrl: string | null;
  }>;
  variant: Readonly<{
    name: string;
    netWeightGrams: number;
  }>;
  quantity: number;
  availabilityBand: AvailabilityBand;
  state: CartLineState;
  unitPrice: CartMoney | null;
  lineSubtotal: CartMoney;
  discount: CartMoney;
  lineTotal: CartMoney;
}>;

type CartCoupon = Readonly<{
  code: string;
  state: CouponState;
  reason: string | null;
}>;

type CartSnapshot = Readonly<{
  id: string;
  locale: string;
  currency: string;
  expiresAt: string;
  lines: readonly CartLine[];
  coupon: CartCoupon | null;
  subtotal: CartMoney;
  discountTotal: CartMoney;
  tax: Readonly<{
    state: 'UNRESOLVED' | 'RESOLVED';
    amount: CartMoney | null;
  }>;
  merchandiseTotal: CartMoney;
  adjustments: readonly Readonly<{
    code: 'QUANTITY_CLAMPED';
    lineId: string;
  }>[];
}>;

type CartContentsProps = Readonly<{
  locale: Locale;
  csrfCookieName: string;
  csrfHeaderName: string;
}>;

type CartRequestOptions = Readonly<{
  path: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  locale: Locale;
  currency?: string;
  csrfCookieName: string;
  csrfHeaderName: string;
  body?: unknown;
}>;

type FeedbackTarget = 'cart' | 'coupon';

class CartRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super('Cart request failed');
    this.name = 'CartRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return isString(value) ? value : null;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return isInteger(value) ? value : null;
}

function parseMoney(value: unknown): CartMoney | null {
  if (!isRecord(value)) return null;
  const amountMinor = stringField(value, 'amountMinor');
  const currency = stringField(value, 'currency');
  if (
    amountMinor === null ||
    currency === null ||
    !/^\d+$/u.test(amountMinor) ||
    !/^[A-Z]{3}$/u.test(currency)
  ) {
    return null;
  }
  return { amountMinor, currency };
}

function parseLineState(value: unknown): CartLineState | null {
  if (
    value === 'PURCHASABLE' ||
    value === 'OUT_OF_STOCK' ||
    value === 'UNPUBLISHED' ||
    value === 'PRICE_UNAVAILABLE'
  ) {
    return value;
  }
  return null;
}

function parseAvailabilityBand(value: unknown): AvailabilityBand | null {
  if (value === 'IN_STOCK' || value === 'LOW_STOCK' || value === 'OUT_OF_STOCK') {
    return value;
  }
  return null;
}

function parseCartLine(value: unknown): CartLine | null {
  if (!isRecord(value)) return null;
  const id = stringField(value, 'id');
  const variantId = stringField(value, 'variantId');
  const quantity = numberField(value, 'quantity');
  const state = parseLineState(value['state']);
  const availabilityBand = parseAvailabilityBand(value['availabilityBand']);
  const product = value['product'];
  const variant = value['variant'];
  const rawUnitPrice = value['unitPrice'];
  const unitPrice = rawUnitPrice === null ? null : parseMoney(rawUnitPrice);
  const lineSubtotal = parseMoney(value['lineSubtotal']);
  const discount = parseMoney(value['discount']);
  const lineTotal = parseMoney(value['lineTotal']);

  if (
    id === null ||
    variantId === null ||
    quantity === null ||
    quantity < 1 ||
    state === null ||
    availabilityBand === null ||
    !isRecord(product) ||
    !isRecord(variant) ||
    (rawUnitPrice !== null && unitPrice === null) ||
    lineSubtotal === null ||
    discount === null ||
    lineTotal === null
  ) {
    return null;
  }

  const productId = stringField(product, 'id');
  const productName = stringField(product, 'name');
  const productSlug = stringField(product, 'slug');
  const imageUrl = product['imageUrl'];
  const variantName = stringField(variant, 'name');
  const netWeightGrams = numberField(variant, 'netWeightGrams');
  if (
    productId === null ||
    productName === null ||
    productSlug === null ||
    variantName === null ||
    netWeightGrams === null ||
    netWeightGrams < 1
  ) {
    return null;
  }

  let parsedImageUrl: string | null;
  if (imageUrl === null) {
    parsedImageUrl = null;
  } else if (isString(imageUrl)) {
    parsedImageUrl = imageUrl;
  } else {
    return null;
  }

  return {
    id,
    variantId,
    product: { id: productId, name: productName, slug: productSlug, imageUrl: parsedImageUrl },
    variant: { name: variantName, netWeightGrams },
    quantity,
    availabilityBand,
    state,
    unitPrice,
    lineSubtotal,
    discount,
    lineTotal,
  };
}

function parseCoupon(value: unknown): CartCoupon | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const code = stringField(value, 'code');
  const state = value['state'];
  const reason = value['reason'];
  if (
    code === null ||
    (state !== 'APPLIED' && state !== 'INELIGIBLE' && state !== 'DEFERRED') ||
    (reason !== null && !isString(reason))
  ) {
    return undefined;
  }
  return { code, state, reason };
}

function parseCart(value: unknown): CartSnapshot | null {
  const envelope = isRecord(value) && isRecord(value['data']) ? value['data'] : value;
  if (!isRecord(envelope)) return null;

  const id = stringField(envelope, 'id');
  const locale = stringField(envelope, 'locale');
  const currency = stringField(envelope, 'currency');
  const expiresAt = stringField(envelope, 'expiresAt');
  const linesRaw = envelope['lines'];
  const coupon = parseCoupon(envelope['coupon']);
  const subtotal = parseMoney(envelope['subtotal']);
  const discountTotal = parseMoney(envelope['discountTotal']);
  const merchandiseTotal = parseMoney(envelope['merchandiseTotal']);
  const tax = envelope['tax'];
  const adjustments = envelope['adjustments'];

  if (
    id === null ||
    locale === null ||
    currency === null ||
    expiresAt === null ||
    !Array.isArray(linesRaw) ||
    coupon === undefined ||
    subtotal === null ||
    discountTotal === null ||
    merchandiseTotal === null ||
    !isRecord(tax) ||
    !Array.isArray(adjustments)
  ) {
    return null;
  }

  const lines: CartLine[] = [];
  for (const item of linesRaw) {
    const line = parseCartLine(item);
    if (line === null) return null;
    lines.push(line);
  }

  const taxState = tax['state'];
  const taxAmount = tax['amount'] === null ? null : parseMoney(tax['amount']);
  if (
    (taxState !== 'UNRESOLVED' && taxState !== 'RESOLVED') ||
    (taxAmount === null && tax['amount'] !== null)
  ) {
    return null;
  }

  const parsedAdjustments: Array<Readonly<{ code: 'QUANTITY_CLAMPED'; lineId: string }>> = [];
  for (const adjustment of adjustments) {
    if (!isRecord(adjustment) || adjustment['code'] !== 'QUANTITY_CLAMPED') return null;
    const lineId = stringField(adjustment, 'lineId');
    if (lineId === null) return null;
    parsedAdjustments.push({ code: 'QUANTITY_CLAMPED', lineId });
  }

  return {
    id,
    locale,
    currency,
    expiresAt,
    lines,
    coupon,
    subtotal,
    discountTotal,
    tax: { state: taxState, amount: taxAmount },
    merchandiseTotal,
    adjustments: parsedAdjustments,
  };
}

function errorCode(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const code = value['code'];
  return isString(code) ? code : null;
}

async function responseJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (body === '') return null;
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed;
  } catch {
    return null;
  }
}

function readCookieValue(name: string): string | undefined {
  const cookie = document.cookie.split(';').map((item) => item.trim());
  const prefix = `${name}=`;
  const matching = cookie.find((item) => item.startsWith(prefix));
  if (matching === undefined) return undefined;
  const raw = matching.slice(prefix.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function requestCart(options: CartRequestOptions): Promise<CartSnapshot> {
  const headers = new Headers({
    accept: 'application/json',
    'x-honey-locale': options.locale,
  });
  if (options.currency !== undefined && /^[A-Z]{3}$/u.test(options.currency)) {
    headers.set('x-currency', options.currency);
  }

  const csrf = readCookieValue(options.csrfCookieName);
  if (csrf !== undefined && csrf !== '') {
    headers.set(options.csrfHeaderName, csrf);
  }

  const init: RequestInit = {
    method: options.method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  };
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(options.path, init);
  const payload = await responseJson(response);
  if (!response.ok) {
    throw new CartRequestError(response.status, errorCode(payload));
  }
  const cart = parseCart(payload);
  if (cart === null) {
    throw new CartRequestError(502, null);
  }
  return cart;
}

function productHref(locale: Locale, slug: string): string {
  const segment = locale === 'fa' ? 'mahsoulat' : 'products';
  return `/${locale}/${segment}/${encodeURIComponent(slug)}`;
}

function lineStateLabel(
  state: CartLineState,
  availability: AvailabilityBand,
  locale: Locale,
): string {
  const copy = cartMessages(locale);
  if (state === 'UNPUBLISHED') return copy.unpublished;
  if (state === 'PRICE_UNAVAILABLE') return copy.priceUnavailable;
  if (state === 'OUT_OF_STOCK') return copy.outOfStock;
  if (availability === 'LOW_STOCK') return copy.lowStock;
  if (availability === 'OUT_OF_STOCK') return copy.outOfStock;
  return copy.available;
}

function cartErrorMessage(error: unknown, locale: Locale): string {
  const copy = cartMessages(locale);
  if (!(error instanceof CartRequestError)) return copy.requestError;
  if (error.status === 429) return copy.rateLimitError;
  if (error.code === 'COUPON_INVALID' || error.code === 'COUPON_INELIGIBLE') {
    return copy.invalidCouponError;
  }
  if (error.status === 409 || error.code === 'INSUFFICIENT_AVAILABILITY') {
    return copy.unavailableError;
  }
  return copy.requestError;
}

function couponErrorMessage(error: unknown, locale: Locale): string {
  if (
    error instanceof CartRequestError &&
    error.status === 422 &&
    error.code === 'VALIDATION_FAILED'
  ) {
    return cartMessages(locale).invalidCouponError;
  }
  return cartErrorMessage(error, locale);
}

function couponStatusLabel(coupon: CartCoupon, locale: Locale): string {
  const copy = cartMessages(locale);
  if (coupon.state === 'APPLIED') return copy.couponApplied;
  if (coupon.state === 'DEFERRED') return copy.couponDeferred;
  return copy.couponIneligible;
}

export function CartContents({ locale, csrfCookieName, csrfHeaderName }: CartContentsProps) {
  const copy = useMemo(() => cartMessages(locale), [locale]);
  const couponInputId = useId();
  const couponErrorId = useId();
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadCart = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);
    setCouponError(null);
    try {
      const next = await requestCart({
        path: '/api/bff/cart',
        method: 'GET',
        locale,
        csrfCookieName,
        csrfHeaderName,
      });
      setCart(next);
    } catch (error) {
      setMessage(cartErrorMessage(error, locale));
    } finally {
      setIsLoading(false);
    }
  }, [csrfCookieName, csrfHeaderName, locale]);

  useEffect(() => {
    void loadCart();
  }, [loadCart]);

  const perform = useCallback(
    async (operation: () => Promise<CartSnapshot>, feedbackTarget: FeedbackTarget = 'cart') => {
      setIsUpdating(true);
      setMessage(null);
      setCouponError(null);
      try {
        const next = await operation();
        setCart(next);
        window.dispatchEvent(new CustomEvent('honey-cart-updated'));
      } catch (error) {
        if (feedbackTarget === 'coupon') {
          setCouponError(couponErrorMessage(error, locale));
        } else {
          setMessage(cartErrorMessage(error, locale));
        }
      } finally {
        setIsUpdating(false);
      }
    },
    [locale],
  );

  const updateQuantity = useCallback(
    async (line: CartLine, quantity: number) => {
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity === line.quantity) {
        setQuantities((current) => {
          const next = { ...current };
          delete next[line.id];
          return next;
        });
        return;
      }
      await perform(async () => {
        const next = await requestCart({
          path: `/api/bff/cart/lines/${encodeURIComponent(line.id)}`,
          method: 'PATCH',
          locale,
          ...(cart?.currency !== undefined ? { currency: cart.currency } : {}),
          csrfCookieName,
          csrfHeaderName,
          body: { quantity },
        });
        setQuantities((current) => {
          const updated = { ...current };
          delete updated[line.id];
          return updated;
        });
        return next;
      });
    },
    [cart?.currency, csrfCookieName, csrfHeaderName, locale, perform],
  );

  const onCouponSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const code = couponCode.trim();
      if (code === '') return;
      void perform(async () => {
        const next = await requestCart({
          path: '/api/bff/cart/coupon',
          method: 'POST',
          locale,
          ...(cart?.currency !== undefined ? { currency: cart.currency } : {}),
          csrfCookieName,
          csrfHeaderName,
          body: { code },
        });
        setCouponCode('');
        return next;
      }, 'coupon');
    },
    [cart?.currency, couponCode, csrfCookieName, csrfHeaderName, locale, perform],
  );

  if (isLoading) {
    return (
      <section className={styles['cart']} aria-labelledby="cart-heading" aria-busy="true">
        <h1 id="cart-heading" className={styles['title']}>
          {copy.title}
        </h1>
        <p className={styles['loading']}>{copy.loading}</p>
      </section>
    );
  }

  if (cart === null) {
    return (
      <section className={styles['cart']} aria-labelledby="cart-heading">
        <h1 id="cart-heading" className={styles['title']}>
          {copy.title}
        </h1>
        <p className={styles['status']} role="alert">
          {message ?? copy.requestError}
        </p>
        <button type="button" className={styles['retryButton']} onClick={() => void loadCart()}>
          {copy.retry}
        </button>
      </section>
    );
  }

  const hasLines = cart.lines.length > 0;
  const hasQuantityAdjustment = cart.adjustments.some(
    (adjustment) => adjustment.code === 'QUANTITY_CLAMPED',
  );

  return (
    <section className={styles['cart']} aria-labelledby="cart-heading" aria-busy={isUpdating}>
      <h1 id="cart-heading" className={styles['title']}>
        {copy.title}
      </h1>
      <p
        className={styles['status']}
        aria-live="polite"
        role={message === null ? 'status' : 'alert'}
      >
        {message ??
          (isUpdating ? copy.updating : hasQuantityAdjustment ? copy.quantityAdjusted : '')}
      </p>

      {!hasLines ? (
        <div className={styles['empty']}>
          <h2 className={styles['emptyTitle']}>{copy.emptyTitle}</h2>
          <p className={styles['emptyDescription']}>{copy.emptyDescription}</p>
          <NextLink
            href={locale === 'fa' ? '/fa/mahsoulat' : '/en/products'}
            className={styles['browseLink']}
          >
            {copy.browseProducts}
          </NextLink>
        </div>
      ) : (
        <div className={styles['layout']}>
          <ul className={styles['lines']} aria-label={copy.title}>
            {cart.lines.map((line) => {
              const editable = line.state === 'PURCHASABLE';
              const displayedQuantity = quantities[line.id] ?? String(line.quantity);
              return (
                <li
                  key={line.id}
                  className={styles['line']}
                  data-has-image={line.product.imageUrl !== null}
                >
                  {line.product.imageUrl !== null ? (
                    <div className={styles['lineMedia']}>
                      <Image
                        src={line.product.imageUrl}
                        alt={line.product.name}
                        fill
                        sizes="80px"
                        className={styles['lineImage']}
                      />
                    </div>
                  ) : null}
                  <div className={styles['lineInfo']}>
                    <NextLink
                      href={productHref(locale, line.product.slug)}
                      className={styles['lineTitle']}
                    >
                      {line.product.name}
                    </NextLink>
                    <p className={styles['variant']}>
                      {line.variant.name} · {line.variant.netWeightGrams} g
                    </p>
                    <p className={styles['availability']} data-state={line.state}>
                      {lineStateLabel(line.state, line.availabilityBand, locale)}
                    </p>
                    <p className={styles['linePrice']}>
                      {copy.unitPrice}:{' '}
                      {line.unitPrice === null
                        ? copy.priceUnavailable
                        : formatMinorMoney(locale, line.unitPrice)}
                    </p>
                    {editable ? (
                      <div className={styles['quantityControl']}>
                        <button
                          type="button"
                          className={styles['quantityButton']}
                          disabled={isUpdating || line.quantity <= 1}
                          aria-label={`${copy.decreaseQuantity}: ${line.product.name}`}
                          onClick={() => void updateQuantity(line, line.quantity - 1)}
                        >
                          −
                        </button>
                        <input
                          className={styles['quantityInput']}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={displayedQuantity}
                          disabled={isUpdating}
                          aria-label={`${copy.quantity}: ${line.product.name}`}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => {
                            setQuantities((current) => ({
                              ...current,
                              [line.id]: event.target.value,
                            }));
                          }}
                          onBlur={(event) => {
                            const value = Number.parseInt(event.currentTarget.value, 10);
                            void updateQuantity(line, value);
                          }}
                          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                            if (event.key === 'Enter') {
                              event.currentTarget.blur();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className={styles['quantityButton']}
                          disabled={isUpdating}
                          aria-label={`${copy.increaseQuantity}: ${line.product.name}`}
                          onClick={() => void updateQuantity(line, line.quantity + 1)}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <p className={styles['variant']}>
                        {copy.quantity}: {line.quantity}
                      </p>
                    )}
                  </div>
                  <div className={styles['lineActions']}>
                    <p className={styles['linePrice']}>
                      {copy.lineTotal}: {formatMinorMoney(locale, line.lineTotal)}
                    </p>
                    <button
                      type="button"
                      className={styles['remove']}
                      disabled={isUpdating}
                      onClick={() => {
                        void perform(() =>
                          requestCart({
                            path: `/api/bff/cart/lines/${encodeURIComponent(line.id)}`,
                            method: 'DELETE',
                            locale,
                            currency: cart.currency,
                            csrfCookieName,
                            csrfHeaderName,
                          }),
                        );
                      }}
                    >
                      {copy.removeLine}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <aside className={styles['summary']} aria-labelledby="cart-summary-heading">
            <h2 id="cart-summary-heading" className={styles['summaryTitle']}>
              {copy.summary}
            </h2>
            <div className={styles['summaryRow']}>
              <span className={styles['summaryLabel']}>{copy.subtotal}</span>
              <span className={styles['amount']}>{formatMinorMoney(locale, cart.subtotal)}</span>
            </div>
            {cart.discountTotal.amountMinor !== '0' ? (
              <div className={styles['summaryRow']}>
                <span className={styles['summaryLabel']}>{copy.discount}</span>
                <span className={styles['amount']}>
                  −{formatMinorMoney(locale, cart.discountTotal)}
                </span>
              </div>
            ) : null}
            {cart.tax.state === 'RESOLVED' && cart.tax.amount !== null ? (
              <div className={styles['summaryRow']}>
                <span className={styles['summaryLabel']}>{copy.tax}</span>
                <span className={styles['amount']}>
                  {formatMinorMoney(locale, cart.tax.amount)}
                </span>
              </div>
            ) : (
              <p className={styles['taxNote']}>{copy.taxUnresolved}</p>
            )}
            <div className={`${styles['summaryRow']} ${styles['summaryTotal']}`}>
              <strong>{copy.total}</strong>
              <strong className={styles['amount']}>
                {formatMinorMoney(locale, cart.merchandiseTotal)}
              </strong>
            </div>

            <form className={styles['couponForm']} onSubmit={onCouponSubmit}>
              <div className={styles['couponField']}>
                <label htmlFor={couponInputId} className={styles['summaryLabel']}>
                  {copy.coupon}
                </label>
                <input
                  id={couponInputId}
                  className={styles['couponInput']}
                  type="text"
                  value={couponCode}
                  disabled={isUpdating || cart.coupon !== null}
                  placeholder={copy.couponPlaceholder}
                  autoComplete="off"
                  aria-describedby={couponError === null ? undefined : couponErrorId}
                  aria-invalid={couponError === null ? undefined : true}
                  onChange={(event) => {
                    setCouponError(null);
                    setCouponCode(event.target.value);
                  }}
                />
                {couponError === null ? null : (
                  <p id={couponErrorId} className={styles['notice']} role="alert">
                    {couponError}
                  </p>
                )}
              </div>
              {cart.coupon !== null ? (
                <>
                  <p className={styles['notice']}>{couponStatusLabel(cart.coupon, locale)}</p>
                  <div className={styles['couponActions']}>
                    <button
                      type="button"
                      className={`${styles['couponButton']} ${styles['couponRemove']}`}
                      disabled={isUpdating}
                      onClick={() => {
                        void perform(() =>
                          requestCart({
                            path: '/api/bff/cart/coupon',
                            method: 'DELETE',
                            locale,
                            currency: cart.currency,
                            csrfCookieName,
                            csrfHeaderName,
                          }),
                        );
                      }}
                    >
                      {copy.removeCoupon}
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles['couponActions']}>
                  <button
                    type="submit"
                    className={styles['couponButton']}
                    disabled={isUpdating || couponCode.trim() === ''}
                  >
                    {copy.applyCoupon}
                  </button>
                </div>
              )}
            </form>
          </aside>
        </div>
      )}
    </section>
  );
}
