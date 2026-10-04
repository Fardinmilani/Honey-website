'use client';

import {
  createTranslator,
  formatDate,
  formatMinorMoney,
  localizedHref,
  type CheckoutMessages,
  type Locale,
  type Translator,
} from '@honey/i18n';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';

import styles from './checkout.module.css';

type Money = Readonly<{ amountMinor: string; currency: string }>;

type CheckoutAddress = Readonly<{
  id: string;
  fullName: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  postalCode: string;
  line1: string;
  line2: string | null;
}>;

type CheckoutStatus = 'OPEN' | 'AWAITING_PAYMENT' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';

type CheckoutPricing = Readonly<{
  currency: string;
  subtotal: Money;
  discount: Money;
  merchandiseTotal: Money;
  tax: Money;
  total: Money;
}>;

type CheckoutShippingQuote = Readonly<{
  methodCode: 'STANDARD';
  amount: Money;
  discount: Money;
  total: Money;
  expiresAt: string;
}>;

type CheckoutProjection = Readonly<{
  id: string;
  status: CheckoutStatus;
  email: string;
  phone: string | null;
  shippingAddress: CheckoutAddress | null;
  billingAddress: CheckoutAddress | null;
  sameAsShipping: boolean;
  shippingQuote: CheckoutShippingQuote | null;
  reservationExpiresAt: string | null;
  pricing: CheckoutPricing | null;
}>;

type AddressFormValues = {
  fullName: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  postalCode: string;
  line1: string;
  line2: string;
};

type ContactFormValues = {
  email: string;
  phone: string;
  shippingAddress: AddressFormValues;
  sameAsShipping: boolean;
  billingAddress: AddressFormValues;
};

type Phase = 'loading' | 'form' | 'review' | 'confirming' | 'success' | 'blocked';

type CheckoutFlowProps = Readonly<{
  locale: Locale;
  csrfCookieName: string;
  csrfHeaderName: string;
}>;

const STORAGE_CHECKOUT_ID = 'honey-checkout-id';
const STORAGE_START_KEY = 'honey-checkout-start-key';
const STORAGE_CONFIRM_KEY = 'honey-checkout-confirm-key';

function emptyAddress(): AddressFormValues {
  return {
    fullName: '',
    phone: '',
    country: '',
    province: '',
    city: '',
    postalCode: '',
    line1: '',
    line2: '',
  };
}

function emptyContact(): ContactFormValues {
  return {
    email: '',
    phone: '',
    shippingAddress: emptyAddress(),
    sameAsShipping: true,
    billingAddress: emptyAddress(),
  };
}

class CheckoutRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super('Checkout request failed');
    this.name = 'CheckoutRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return isString(value) ? value : null;
}

function parseMoney(value: unknown): Money | null {
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

function parseAddress(value: unknown): CheckoutAddress | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const id = stringField(value, 'id');
  const fullName = stringField(value, 'fullName');
  const phone = stringField(value, 'phone');
  const country = stringField(value, 'country');
  const province = stringField(value, 'province');
  const city = stringField(value, 'city');
  const postalCode = stringField(value, 'postalCode');
  const line1 = stringField(value, 'line1');
  const line2Raw = value['line2'];
  if (
    id === null ||
    fullName === null ||
    phone === null ||
    country === null ||
    province === null ||
    city === null ||
    postalCode === null ||
    line1 === null ||
    (line2Raw !== null && !isString(line2Raw))
  ) {
    return undefined;
  }
  return {
    id,
    fullName,
    phone,
    country,
    province,
    city,
    postalCode,
    line1,
    line2: line2Raw === null ? null : line2Raw,
  };
}

function parseShippingQuote(value: unknown): CheckoutShippingQuote | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const methodCode = value['methodCode'];
  const amount = parseMoney(value['amount']);
  const discount = parseMoney(value['discount']);
  const total = parseMoney(value['total']);
  const expiresAt = stringField(value, 'expiresAt');
  if (
    methodCode !== 'STANDARD' ||
    amount === null ||
    discount === null ||
    total === null ||
    expiresAt === null
  ) {
    return undefined;
  }
  return { methodCode, amount, discount, total, expiresAt };
}

function parsePricing(value: unknown): CheckoutPricing | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const currency = stringField(value, 'currency');
  const subtotal = parseMoney(value['subtotal']);
  const discount = parseMoney(value['discount']);
  const merchandiseTotal = parseMoney(value['merchandiseTotal']);
  const tax = parseMoney(value['tax']);
  const total = parseMoney(value['total']);
  if (
    currency === null ||
    subtotal === null ||
    discount === null ||
    merchandiseTotal === null ||
    tax === null ||
    total === null
  ) {
    return undefined;
  }
  return { currency, subtotal, discount, merchandiseTotal, tax, total };
}

function parseCheckout(value: unknown): CheckoutProjection | null {
  if (!isRecord(value)) return null;
  const id = stringField(value, 'id');
  const status = value['status'];
  const email = stringField(value, 'email');
  const phoneRaw = value['phone'];
  const shippingAddress = parseAddress(value['shippingAddress']);
  const billingAddress = parseAddress(value['billingAddress']);
  const sameAsShipping = value['sameAsShipping'];
  const shippingQuote = parseShippingQuote(value['shippingQuote']);
  const reservationExpiresAtRaw = value['reservationExpiresAt'];
  const pricing = parsePricing(value['pricing']);

  if (
    id === null ||
    (status !== 'OPEN' &&
      status !== 'AWAITING_PAYMENT' &&
      status !== 'COMPLETED' &&
      status !== 'EXPIRED' &&
      status !== 'CANCELLED') ||
    email === null ||
    (phoneRaw !== null && !isString(phoneRaw)) ||
    shippingAddress === undefined ||
    billingAddress === undefined ||
    typeof sameAsShipping !== 'boolean' ||
    shippingQuote === undefined ||
    (reservationExpiresAtRaw !== null && !isString(reservationExpiresAtRaw)) ||
    pricing === undefined
  ) {
    return null;
  }

  return {
    id,
    status,
    email,
    phone: phoneRaw === null ? null : phoneRaw,
    shippingAddress,
    billingAddress,
    sameAsShipping,
    shippingQuote,
    reservationExpiresAt: reservationExpiresAtRaw === null ? null : reservationExpiresAtRaw,
    pricing,
  };
}

function parseConfirmResult(
  value: unknown,
): Readonly<{ checkout: CheckoutProjection; orderNumber: string }> | null {
  if (!isRecord(value)) return null;
  const checkout = parseCheckout(value['checkout']);
  const orderNumber = stringField(value, 'orderNumber');
  if (checkout === null || orderNumber === null) return null;
  return { checkout, orderNumber };
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

type CheckoutRequestOptions = Readonly<{
  path: string;
  method: 'GET' | 'POST';
  locale: Locale;
  csrfCookieName: string;
  csrfHeaderName: string;
  idempotencyKey?: string;
  body?: unknown;
}>;

async function requestCheckout(options: CheckoutRequestOptions): Promise<unknown> {
  const headers = new Headers({ accept: 'application/json', 'x-honey-locale': options.locale });
  if (options.method === 'POST') {
    const csrf = readCookieValue(options.csrfCookieName);
    if (csrf !== undefined && csrf !== '') headers.set(options.csrfHeaderName, csrf);
  }
  if (options.idempotencyKey !== undefined) headers.set('idempotency-key', options.idempotencyKey);

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
  if (!response.ok) throw new CheckoutRequestError(response.status, errorCode(payload));
  return payload;
}

function readStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // A blocked or full sessionStorage cannot corrupt the checkout; the flow
    // degrades to re-issuing a fresh idempotency key on next attempt instead.
  }
}

function clearStorage(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to clean up if storage access itself failed.
  }
}

function newKey(): string {
  return crypto.randomUUID();
}

function addressFromValues(values: AddressFormValues) {
  const trimmedLine2 = values.line2.trim();
  return {
    fullName: values.fullName.trim(),
    phone: values.phone.trim(),
    country: values.country.trim().toUpperCase(),
    province: values.province.trim(),
    city: values.city.trim(),
    postalCode: values.postalCode.trim(),
    line1: values.line1.trim(),
    ...(trimmedLine2 === '' ? {} : { line2: trimmedLine2 }),
  };
}

type CheckoutMessageKey = keyof CheckoutMessages;

function requestErrorMessageKey(error: unknown): CheckoutMessageKey {
  if (!(error instanceof CheckoutRequestError)) return 'requestError';
  if (error.status === 429) return 'rateLimitError';
  if (error.status === 404) return 'checkoutNotFound';
  if (error.code === 'CHECKOUT_CART_EMPTY') return 'cartEmpty';
  if (
    error.code === 'CHECKOUT_CART_EXPIRED' ||
    error.code === 'CHECKOUT_CART_NOT_ACTIVE' ||
    error.code === 'CHECKOUT_CART_CHANGED'
  ) {
    return 'checkoutUnavailable';
  }
  if (
    error.code === 'INSUFFICIENT_STOCK' ||
    error.code === 'CHECKOUT_VARIANT_NOT_AVAILABLE' ||
    error.code === 'CHECKOUT_PRICE_UNAVAILABLE'
  ) {
    return 'unavailableItems';
  }
  if (
    error.code === 'RESERVATION_EXPIRED' ||
    error.code === 'CHECKOUT_NOT_CONFIRMABLE' ||
    error.code === 'CHECKOUT_NOT_EXTENDABLE' ||
    error.code === 'RESERVATION_NOT_ACTIVE'
  ) {
    return 'reservationExpired';
  }
  if (error.code === 'PRICE_CHANGED') return 'priceChanged';
  if (error.code === 'VALIDATION_FAILED') return 'invalidForm';
  return 'requestError';
}

export function CheckoutFlow({ locale, csrfCookieName, csrfHeaderName }: CheckoutFlowProps) {
  const t = createTranslator(locale);
  const router = useRouter();
  const emailId = useId();
  const phoneId = useId();

  const [phase, setPhase] = useState<Phase>('loading');
  const [contact, setContact] = useState<ContactFormValues>(emptyContact);
  const [checkout, setCheckout] = useState<CheckoutProjection | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resumedRef = useRef(false);

  const cartHref = localizedHref('/cart', locale);

  const resetToForm = useCallback(() => {
    clearStorage(STORAGE_CHECKOUT_ID);
    clearStorage(STORAGE_START_KEY);
    clearStorage(STORAGE_CONFIRM_KEY);
    setCheckout(null);
    setPhase('form');
  }, []);

  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const existingId = readStorage(STORAGE_CHECKOUT_ID);
    if (existingId === null) {
      setPhase('form');
      return;
    }
    void (async () => {
      try {
        const current = parseCheckout(
          await requestCheckout({
            path: `/api/bff/checkout/${encodeURIComponent(existingId)}`,
            method: 'GET',
            locale,
            csrfCookieName,
            csrfHeaderName,
          }),
        );
        if (current === null || current.status !== 'OPEN') {
          resetToForm();
          return;
        }
        // Explicit, one-time re-entry extension (never on a timer or on a
        // background poll): the customer returned to an already-open
        // checkout, so the hold is extended once toward the 30-minute
        // maximum. `extend` is itself idempotent and self-limiting, so this
        // single call on mount cannot be used to hold stock indefinitely.
        let extended = current;
        try {
          const afterExtend = parseCheckout(
            await requestCheckout({
              path: `/api/bff/checkout/${encodeURIComponent(existingId)}/extend`,
              method: 'POST',
              locale,
              csrfCookieName,
              csrfHeaderName,
            }),
          );
          if (afterExtend !== null) extended = afterExtend;
        } catch {
          // A failed extension leaves the existing, still-authoritative
          // expiry in place; the review screen simply shows the unextended
          // time and the user can still confirm before it elapses.
        }
        setCheckout(extended);
        setPhase('review');
      } catch {
        resetToForm();
      }
    })();
  }, [csrfCookieName, csrfHeaderName, locale, resetToForm]);

  const onContactSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setMessage(null);
      setIsSubmitting(true);
      void (async () => {
        try {
          const startKey = readStorage(STORAGE_START_KEY) ?? newKey();
          writeStorage(STORAGE_START_KEY, startKey);
          const shippingAddress = addressFromValues(contact.shippingAddress);
          const billingAddress = contact.sameAsShipping
            ? undefined
            : addressFromValues(contact.billingAddress);
          const trimmedPhone = contact.phone.trim();
          const body = {
            email: contact.email.trim(),
            ...(trimmedPhone === '' ? {} : { phone: trimmedPhone }),
            shippingAddress,
            ...(billingAddress === undefined ? {} : { billingAddress }),
            sameAsShipping: contact.sameAsShipping,
          };
          const started = parseCheckout(
            await requestCheckout({
              path: '/api/bff/checkout',
              method: 'POST',
              locale,
              csrfCookieName,
              csrfHeaderName,
              idempotencyKey: startKey,
              body,
            }),
          );
          if (started === null) throw new CheckoutRequestError(502, null);
          writeStorage(STORAGE_CHECKOUT_ID, started.id);
          clearStorage(STORAGE_START_KEY);
          setCheckout(started);
          setPhase('review');
        } catch (error) {
          const key = requestErrorMessageKey(error);
          setMessage(t(`checkout.${key}`));
          if (key === 'cartEmpty') setPhase('blocked');
        } finally {
          setIsSubmitting(false);
        }
      })();
    },
    [contact, csrfCookieName, csrfHeaderName, locale, t],
  );

  const onConfirm = useCallback(() => {
    if (checkout === null) return;
    setMessage(null);
    setIsSubmitting(true);
    setPhase('confirming');
    void (async () => {
      try {
        const confirmKey = readStorage(STORAGE_CONFIRM_KEY) ?? newKey();
        writeStorage(STORAGE_CONFIRM_KEY, confirmKey);
        const result = parseConfirmResult(
          await requestCheckout({
            path: `/api/bff/checkout/${encodeURIComponent(checkout.id)}/confirm`,
            method: 'POST',
            locale,
            csrfCookieName,
            csrfHeaderName,
            idempotencyKey: confirmKey,
          }),
        );
        if (result === null) throw new CheckoutRequestError(502, null);
        clearStorage(STORAGE_CHECKOUT_ID);
        clearStorage(STORAGE_CONFIRM_KEY);
        setPhase('success');
        router.push(localizedHref('/orders/[number]', locale, { number: result.orderNumber }));
      } catch (error) {
        if (error instanceof CheckoutRequestError && error.code === 'PRICE_CHANGED') {
          // A materially different order (new totals) requires a genuinely
          // new confirmation attempt, not a replay of the stale one.
          clearStorage(STORAGE_CONFIRM_KEY);
          try {
            const refreshed = parseCheckout(
              await requestCheckout({
                path: `/api/bff/checkout/${encodeURIComponent(checkout.id)}`,
                method: 'GET',
                locale,
                csrfCookieName,
                csrfHeaderName,
              }),
            );
            if (refreshed !== null) setCheckout(refreshed);
          } catch {
            // Keep showing the last known checkout state if the refresh itself fails.
          }
          setMessage(t('checkout.priceChanged'));
          setPhase('review');
          return;
        }
        const key = requestErrorMessageKey(error);
        setMessage(t(`checkout.${key}`));
        if (key === 'checkoutNotFound' || key === 'reservationExpired') {
          resetToForm();
        } else {
          setPhase('review');
        }
      } finally {
        setIsSubmitting(false);
      }
    })();
  }, [checkout, csrfCookieName, csrfHeaderName, locale, resetToForm, router, t]);

  const shippingValues = contact.shippingAddress;
  const billingValues = contact.billingAddress;

  const setShippingField = useCallback((field: keyof AddressFormValues, value: string) => {
    setContact((current) => ({
      ...current,
      shippingAddress: { ...current.shippingAddress, [field]: value },
    }));
  }, []);

  const setBillingField = useCallback((field: keyof AddressFormValues, value: string) => {
    setContact((current) => ({
      ...current,
      billingAddress: { ...current.billingAddress, [field]: value },
    }));
  }, []);

  const reservationLabel = useMemo(() => {
    if (checkout?.reservationExpiresAt == null) return t('checkout.reservationUnavailable');
    const time = formatDate(locale, checkout.reservationExpiresAt, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return t('checkout.reservationExpires', { time });
  }, [checkout?.reservationExpiresAt, locale, t]);

  if (phase === 'loading') {
    return (
      <section className={styles['checkout']} aria-labelledby="checkout-heading" aria-busy="true">
        <h1 id="checkout-heading" className={styles['title']}>
          {t('checkout.checkoutTitle')}
        </h1>
        <p className={styles['loading']}>{t('checkout.checkoutLoading')}</p>
      </section>
    );
  }

  if (phase === 'blocked') {
    return (
      <section className={styles['checkout']} aria-labelledby="checkout-heading">
        <h1 id="checkout-heading" className={styles['title']}>
          {t('checkout.checkoutTitle')}
        </h1>
        <div className={styles['blocked']}>
          <p className={styles['status']} role="alert">
            {message ?? t('checkout.checkoutUnavailable')}
          </p>
          <NextLink href={cartHref} className={styles['secondaryLink']}>
            {t('checkout.returnToCart')}
          </NextLink>
        </div>
      </section>
    );
  }

  if (phase === 'form') {
    return (
      <section className={styles['checkout']} aria-labelledby="checkout-heading">
        <h1 id="checkout-heading" className={styles['title']}>
          {t('checkout.checkoutTitle')}
        </h1>
        <p className={styles['description']}>{t('checkout.checkoutDescription')}</p>
        <p
          className={styles['status']}
          aria-live="polite"
          role={message === null ? 'status' : 'alert'}
        >
          {message ?? ''}
        </p>
        <form className={styles['form']} onSubmit={onContactSubmit}>
          <fieldset className={styles['fieldset']}>
            <legend className={styles['fieldsetTitle']}>{t('checkout.contactHeading')}</legend>
            <div className={styles['fieldGrid']}>
              <div className={styles['field']}>
                <label htmlFor={emailId} className={styles['label']}>
                  {t('checkout.emailLabel')}
                </label>
                <input
                  id={emailId}
                  className={styles['input']}
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  value={contact.email}
                  onChange={(event) =>
                    setContact((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </div>
              <div className={styles['field']}>
                <label htmlFor={phoneId} className={styles['label']}>
                  {t('checkout.phoneLabel')}
                </label>
                <input
                  id={phoneId}
                  className={styles['input']}
                  type="tel"
                  maxLength={40}
                  autoComplete="tel"
                  value={contact.phone}
                  onChange={(event) =>
                    setContact((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </div>
            </div>
          </fieldset>

          <AddressFieldset
            legend={t('checkout.shippingAddressHeading')}
            values={shippingValues}
            onChange={setShippingField}
            copy={t}
            idPrefix="shipping"
          />

          <div className={styles['checkboxField']}>
            <input
              id="same-as-shipping"
              type="checkbox"
              checked={contact.sameAsShipping}
              onChange={(event) =>
                setContact((current) => ({ ...current, sameAsShipping: event.target.checked }))
              }
            />
            <label htmlFor="same-as-shipping" className={styles['label']}>
              {t('checkout.sameAsShipping')}
            </label>
          </div>

          {contact.sameAsShipping ? null : (
            <AddressFieldset
              legend={t('checkout.billingAddressHeading')}
              values={billingValues}
              onChange={setBillingField}
              copy={t}
              idPrefix="billing"
            />
          )}

          <div className={styles['actions']}>
            <button type="submit" className={styles['primaryButton']} disabled={isSubmitting}>
              {t('checkout.continueToReview')}
            </button>
            <NextLink href={cartHref} className={styles['secondaryLink']}>
              {t('checkout.returnToCart')}
            </NextLink>
          </div>
        </form>
      </section>
    );
  }

  if (checkout === null) {
    return (
      <section className={styles['checkout']} aria-labelledby="checkout-heading">
        <h1 id="checkout-heading" className={styles['title']}>
          {t('checkout.checkoutTitle')}
        </h1>
        <p className={styles['status']} role="alert">
          {message ?? t('checkout.checkoutUnavailable')}
        </p>
        <button type="button" className={styles['retryButton']} onClick={resetToForm}>
          {t('checkout.checkoutRetry')}
        </button>
      </section>
    );
  }

  if (phase === 'success') {
    return (
      <section className={styles['checkout']} aria-labelledby="checkout-heading">
        <h1 id="checkout-heading" className={styles['title']}>
          {t('checkout.orderCreatedHeading')}
        </h1>
        <div className={styles['success']}>
          <p className={styles['successDescription']}>{t('checkout.orderCreatedDescription')}</p>
        </div>
      </section>
    );
  }

  const shippingAddress = checkout.shippingAddress;
  const billingAddress = checkout.sameAsShipping
    ? checkout.shippingAddress
    : checkout.billingAddress;

  return (
    <section
      className={styles['checkout']}
      aria-labelledby="checkout-heading"
      aria-busy={phase === 'confirming'}
    >
      <h1 id="checkout-heading" className={styles['title']}>
        {t('checkout.reviewHeading')}
      </h1>
      <p
        className={styles['status']}
        aria-live="polite"
        role={message === null ? 'status' : 'alert'}
      >
        {message ?? (phase === 'confirming' ? t('checkout.confirmingOrder') : '')}
      </p>

      <div className={styles['layout']}>
        <div>
          {shippingAddress !== null ? (
            <div className={styles['fieldset']}>
              <h2 className={styles['fieldsetTitle']}>{t('checkout.shippingAddressHeading')}</h2>
              <p className={styles['addressPreview']}>
                {shippingAddress.fullName}
                <br />
                {shippingAddress.line1}
                {shippingAddress.line2 !== null ? <>, {shippingAddress.line2}</> : null}
                <br />
                {shippingAddress.city}, {shippingAddress.province} {shippingAddress.postalCode}
                <br />
                {shippingAddress.country} · {shippingAddress.phone}
              </p>
            </div>
          ) : null}
          {billingAddress !== null && !checkout.sameAsShipping ? (
            <div className={`${styles['fieldset']} ${styles['billingPreview']}`}>
              <h2 className={styles['fieldsetTitle']}>{t('checkout.billingAddressHeading')}</h2>
              <p className={styles['addressPreview']}>
                {billingAddress.fullName}
                <br />
                {billingAddress.line1}
                {billingAddress.line2 !== null ? <>, {billingAddress.line2}</> : null}
                <br />
                {billingAddress.city}, {billingAddress.province} {billingAddress.postalCode}
              </p>
            </div>
          ) : null}
          <div className={`${styles['actions']} ${styles['reviewActions']}`}>
            <button
              type="button"
              className={styles['secondaryLink']}
              onClick={resetToForm}
              disabled={isSubmitting}
            >
              {t('checkout.startOver')}
            </button>
          </div>
        </div>

        <aside className={styles['summary']} aria-labelledby="checkout-summary-heading">
          <h2 id="checkout-summary-heading" className={styles['summaryTitle']}>
            {t('checkout.summaryHeading')}
          </h2>
          {checkout.pricing !== null ? (
            <>
              <div className={styles['summaryRow']}>
                <span className={styles['summaryLabel']}>{t('checkout.subtotal')}</span>
                <span className={styles['amount']}>
                  {formatMinorMoney(locale, checkout.pricing.subtotal)}
                </span>
              </div>
              {checkout.pricing.discount.amountMinor !== '0' ? (
                <div className={styles['summaryRow']}>
                  <span className={styles['summaryLabel']}>{t('checkout.discount')}</span>
                  <span className={styles['amount']}>
                    −{formatMinorMoney(locale, checkout.pricing.discount)}
                  </span>
                </div>
              ) : null}
              <div className={styles['summaryRow']}>
                <span className={styles['summaryLabel']}>{t('checkout.shipping')}</span>
                <span className={styles['amount']}>
                  {checkout.shippingQuote === null
                    ? t('checkout.noShippingQuote')
                    : formatMinorMoney(locale, checkout.shippingQuote.total)}
                </span>
              </div>
              <div className={styles['summaryRow']}>
                <span className={styles['summaryLabel']}>{t('checkout.tax')}</span>
                <span className={styles['amount']}>
                  {formatMinorMoney(locale, checkout.pricing.tax)}
                </span>
              </div>
              <div className={`${styles['summaryRow']} ${styles['summaryTotal']}`}>
                <strong>{t('checkout.total')}</strong>
                <strong className={styles['amount']}>
                  {formatMinorMoney(locale, checkout.pricing.total)}
                </strong>
              </div>
            </>
          ) : (
            <p className={styles['summaryLabel']}>{t('checkout.checkoutUnavailable')}</p>
          )}
          <p className={styles['reservationNote']}>{reservationLabel}</p>
          <div className={styles['actions']}>
            <button
              type="button"
              className={styles['primaryButton']}
              disabled={isSubmitting || checkout.pricing === null}
              onClick={onConfirm}
            >
              {phase === 'confirming' ? t('checkout.confirmingOrder') : t('checkout.confirmOrder')}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

type AddressFieldsetProps = Readonly<{
  legend: string;
  values: AddressFormValues;
  onChange: (field: keyof AddressFormValues, value: string) => void;
  copy: Translator;
  idPrefix: string;
}>;

function AddressFieldset({ legend, values, onChange, copy, idPrefix }: AddressFieldsetProps) {
  return (
    <fieldset className={styles['fieldset']}>
      <legend className={styles['fieldsetTitle']}>{legend}</legend>
      <div className={styles['fieldGrid']}>
        <div className={styles['field']}>
          <label htmlFor={`${idPrefix}-fullName`} className={styles['label']}>
            {copy('checkout.fullNameLabel')}
          </label>
          <input
            id={`${idPrefix}-fullName`}
            className={styles['input']}
            type="text"
            required
            maxLength={160}
            autoComplete="name"
            value={values.fullName}
            onChange={(event) => onChange('fullName', event.target.value)}
          />
        </div>
        <div className={styles['field']}>
          <label htmlFor={`${idPrefix}-phone`} className={styles['label']}>
            {copy('checkout.addressPhoneLabel')}
          </label>
          <input
            id={`${idPrefix}-phone`}
            className={styles['input']}
            type="tel"
            required
            maxLength={40}
            autoComplete="tel"
            value={values.phone}
            onChange={(event) => onChange('phone', event.target.value)}
          />
        </div>
        <div className={styles['field']}>
          <label htmlFor={`${idPrefix}-country`} className={styles['label']}>
            {copy('checkout.countryLabel')}
          </label>
          <input
            id={`${idPrefix}-country`}
            className={styles['input']}
            type="text"
            required
            minLength={2}
            maxLength={2}
            pattern="[A-Za-z]{2}"
            placeholder="IR"
            autoComplete="country"
            value={values.country}
            onChange={(event) => onChange('country', event.target.value)}
          />
        </div>
        <div className={styles['field']}>
          <label htmlFor={`${idPrefix}-province`} className={styles['label']}>
            {copy('checkout.provinceLabel')}
          </label>
          <input
            id={`${idPrefix}-province`}
            className={styles['input']}
            type="text"
            required
            maxLength={120}
            autoComplete="address-level1"
            value={values.province}
            onChange={(event) => onChange('province', event.target.value)}
          />
        </div>
        <div className={styles['field']}>
          <label htmlFor={`${idPrefix}-city`} className={styles['label']}>
            {copy('checkout.cityLabel')}
          </label>
          <input
            id={`${idPrefix}-city`}
            className={styles['input']}
            type="text"
            required
            maxLength={120}
            autoComplete="address-level2"
            value={values.city}
            onChange={(event) => onChange('city', event.target.value)}
          />
        </div>
        <div className={styles['field']}>
          <label htmlFor={`${idPrefix}-postalCode`} className={styles['label']}>
            {copy('checkout.postalCodeLabel')}
          </label>
          <input
            id={`${idPrefix}-postalCode`}
            className={styles['input']}
            type="text"
            required
            maxLength={32}
            autoComplete="postal-code"
            value={values.postalCode}
            onChange={(event) => onChange('postalCode', event.target.value)}
          />
        </div>
        <div className={styles['field']}>
          <label htmlFor={`${idPrefix}-line1`} className={styles['label']}>
            {copy('checkout.addressLine1Label')}
          </label>
          <input
            id={`${idPrefix}-line1`}
            className={styles['input']}
            type="text"
            required
            maxLength={240}
            autoComplete="address-line1"
            value={values.line1}
            onChange={(event) => onChange('line1', event.target.value)}
          />
        </div>
        <div className={styles['field']}>
          <label htmlFor={`${idPrefix}-line2`} className={styles['label']}>
            {copy('checkout.addressLine2Label')}
          </label>
          <input
            id={`${idPrefix}-line2`}
            className={styles['input']}
            type="text"
            maxLength={240}
            autoComplete="address-line2"
            value={values.line2}
            onChange={(event) => onChange('line2', event.target.value)}
          />
          <p className={styles['hint']}>{copy('checkout.addressLine2Hint')}</p>
        </div>
      </div>
    </fieldset>
  );
}
