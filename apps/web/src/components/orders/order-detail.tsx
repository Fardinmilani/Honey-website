'use client';

import {
  createTranslator,
  formatDate,
  formatMinorMoney,
  localizedHref,
  type Locale,
} from '@honey/i18n';
import NextLink from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';

import styles from './orders.module.css';

type Money = Readonly<{ amountMinor: string; currency: string }>;

type OrderAddress = Readonly<{
  fullName: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  postalCode: string;
  line1: string;
  line2: string | null;
}>;

type OrderLine = Readonly<{
  productName: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: Money;
  discount: Money;
  tax: Money;
  lineTotal: Money;
}>;

type Shipment = Readonly<{
  id: string;
  status: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}>;

type CustomerOrder = Readonly<{
  number: string;
  status: string;
  paymentStatus: string;
  fulfilmentStatus: string;
  currency: string;
  subtotal: Money;
  discountTotal: Money;
  shippingTotal: Money;
  taxTotal: Money;
  grandTotal: Money;
  placedAt: string;
  shippingAddress: OrderAddress | null;
  lines: readonly OrderLine[];
  shipments: readonly Shipment[];
}>;

type OrderDetailProps = Readonly<{
  locale: Locale;
  orderNumber: string;
  csrfCookieName: string;
  csrfHeaderName: string;
}>;

class OrderRequestError extends Error {
  constructor(readonly status: number) {
    super('Order request failed');
    this.name = 'OrderRequestError';
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

function parseAddress(value: unknown): OrderAddress | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const fullName = stringField(value, 'fullName');
  const phone = stringField(value, 'phone');
  const country = stringField(value, 'country');
  const province = stringField(value, 'province');
  const city = stringField(value, 'city');
  const postalCode = stringField(value, 'postalCode');
  const line1 = stringField(value, 'line1');
  const line2Raw = value['line2'];
  if (
    fullName === null ||
    phone === null ||
    country === null ||
    province === null ||
    city === null ||
    postalCode === null ||
    line1 === null ||
    (line2Raw !== undefined && line2Raw !== null && !isString(line2Raw))
  ) {
    return undefined;
  }
  return {
    fullName,
    phone,
    country,
    province,
    city,
    postalCode,
    line1,
    line2: line2Raw === undefined || line2Raw === null ? null : line2Raw,
  };
}

function parseLine(value: unknown): OrderLine | null {
  if (!isRecord(value)) return null;
  const productName = stringField(value, 'productName');
  const variantName = stringField(value, 'variantName');
  const sku = stringField(value, 'sku');
  const imageUrlRaw = value['imageUrl'];
  const quantity = value['quantity'];
  const unitPrice = parseMoney(value['unitPrice']);
  const discount = parseMoney(value['discount']);
  const tax = parseMoney(value['tax']);
  const lineTotal = parseMoney(value['lineTotal']);
  if (
    productName === null ||
    variantName === null ||
    sku === null ||
    (imageUrlRaw !== null && !isString(imageUrlRaw)) ||
    !isInteger(quantity) ||
    quantity < 1 ||
    unitPrice === null ||
    discount === null ||
    tax === null ||
    lineTotal === null
  ) {
    return null;
  }
  return {
    productName,
    variantName,
    sku,
    imageUrl: imageUrlRaw === null ? null : imageUrlRaw,
    quantity,
    unitPrice,
    discount,
    tax,
    lineTotal,
  };
}

function safeTrackingUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function parseShipment(value: unknown): Shipment | null {
  if (!isRecord(value)) return null;
  const id = stringField(value, 'id');
  const status = stringField(value, 'status');
  const trackingNumberRaw = value['trackingNumber'];
  const shippedAtRaw = value['shippedAt'];
  const deliveredAtRaw = value['deliveredAt'];
  if (
    id === null ||
    status === null ||
    (trackingNumberRaw !== null && !isString(trackingNumberRaw)) ||
    (shippedAtRaw !== null && !isString(shippedAtRaw)) ||
    (deliveredAtRaw !== null && !isString(deliveredAtRaw))
  ) {
    return null;
  }
  return {
    id,
    status,
    trackingNumber: trackingNumberRaw === null ? null : trackingNumberRaw,
    trackingUrl: safeTrackingUrl(value['trackingUrl']),
    shippedAt: shippedAtRaw === null ? null : shippedAtRaw,
    deliveredAt: deliveredAtRaw === null ? null : deliveredAtRaw,
  };
}

function parseOrder(value: unknown): CustomerOrder | null {
  if (!isRecord(value)) return null;
  const number = stringField(value, 'number');
  const status = stringField(value, 'status');
  const paymentStatus = stringField(value, 'paymentStatus');
  const fulfilmentStatus = stringField(value, 'fulfilmentStatus');
  const currency = stringField(value, 'currency');
  const subtotal = parseMoney(value['subtotal']);
  const discountTotal = parseMoney(value['discountTotal']);
  const shippingTotal = parseMoney(value['shippingTotal']);
  const taxTotal = parseMoney(value['taxTotal']);
  const grandTotal = parseMoney(value['grandTotal']);
  const placedAt = stringField(value, 'placedAt');
  const shippingAddress = parseAddress(value['shippingAddress']);
  const linesRaw = value['lines'];
  const shipmentsRaw = value['shipments'];

  if (
    number === null ||
    status === null ||
    paymentStatus === null ||
    fulfilmentStatus === null ||
    currency === null ||
    subtotal === null ||
    discountTotal === null ||
    shippingTotal === null ||
    taxTotal === null ||
    grandTotal === null ||
    placedAt === null ||
    shippingAddress === undefined ||
    !Array.isArray(linesRaw) ||
    (shipmentsRaw !== undefined && !Array.isArray(shipmentsRaw))
  ) {
    return null;
  }

  const lines: OrderLine[] = [];
  for (const item of linesRaw) {
    const line = parseLine(item);
    if (line === null) return null;
    lines.push(line);
  }

  const shipments: Shipment[] = [];
  if (Array.isArray(shipmentsRaw)) {
    for (const item of shipmentsRaw) {
      const shipment = parseShipment(item);
      if (shipment === null) return null;
      shipments.push(shipment);
    }
  }

  return {
    number,
    status,
    paymentStatus,
    fulfilmentStatus,
    currency,
    subtotal,
    discountTotal,
    shippingTotal,
    taxTotal,
    grandTotal,
    placedAt,
    shippingAddress,
    lines,
    shipments,
  };
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

async function requestOrder(orderNumber: string, locale: Locale): Promise<CustomerOrder> {
  const response = await fetch(`/api/bff/orders/${encodeURIComponent(orderNumber)}`, {
    method: 'GET',
    headers: { accept: 'application/json', 'x-honey-locale': locale },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const payload = await responseJson(response);
  if (!response.ok) throw new OrderRequestError(response.status);
  const order = parseOrder(payload);
  if (order === null) throw new OrderRequestError(502);
  return order;
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

export function OrderDetail({
  locale,
  orderNumber,
  csrfCookieName,
  csrfHeaderName,
}: OrderDetailProps) {
  const t = createTranslator(locale);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const productsHref = localizedHref('/products', locale);

  async function startPayment(): Promise<void> {
    setPaying(true);
    setPayError(null);
    const headers = new Headers({
      accept: 'application/json',
      'content-type': 'application/json',
      'x-honey-locale': locale,
      'idempotency-key': crypto.randomUUID().replaceAll('-', '') + 'paystart',
    });
    const csrf = readCookieValue(csrfCookieName);
    if (csrf !== undefined && csrf !== '') headers.set(csrfHeaderName, csrf);
    try {
      const response = await fetch('/api/bff/payments', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ orderNumber }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(body) || typeof body['redirectUrl'] !== 'string') {
        setPayError(
          isRecord(body) && body['code'] === 'PAYMENT_PROVIDER_UNAVAILABLE'
            ? t('payments.providerUnavailable')
            : t('payments.genericError'),
        );
        setPaying(false);
        return;
      }
      window.location.assign(body['redirectUrl']);
    } catch {
      setPayError(t('payments.genericError'));
      setPaying(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setFailed(false);
    void requestOrder(orderNumber, locale)
      .then((next) => {
        if (!cancelled) setOrder(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locale, orderNumber]);

  if (isLoading) {
    return (
      <section className={styles['page']} aria-busy="true">
        <h1 className={styles['title']}>{t('checkout.orderTitle', { number: orderNumber })}</h1>
        <p className={styles['loading']}>{t('checkout.checkoutLoading')}</p>
      </section>
    );
  }

  if (failed || order === null) {
    return (
      <section className={styles['page']}>
        <h1 className={styles['title']}>{t('checkout.orderTitle', { number: orderNumber })}</h1>
        <p className={styles['status']} role="alert">
          {t('checkout.orderUnavailable')}
        </p>
        <NextLink href={productsHref} className={styles['browseLink']}>
          {t('checkout.browseProducts')}
        </NextLink>
      </section>
    );
  }

  return (
    <section className={styles['page']} aria-labelledby="order-heading">
      <h1 id="order-heading" className={styles['title']}>
        {t('checkout.orderTitle', { number: order.number })}
      </h1>
      <div className={styles['detail']}>
        <div className={styles['section']}>
          <h2 className={styles['sectionTitle']}>{t('checkout.orderCreatedHeading')}</h2>
          <p className={styles['cardMeta']}>{t('checkout.orderCreatedDescription')}</p>
          <div className={styles['metaGrid']}>
            <div className={styles['metaRow']}>
              <p className={styles['metaLabel']}>{t('checkout.orderNumber')}</p>
              <p className={styles['metaValue']}>{order.number}</p>
            </div>
            <div className={styles['metaRow']}>
              <p className={styles['metaLabel']}>{t('checkout.placedAt')}</p>
              <p className={styles['metaValue']}>
                {formatDate(locale, order.placedAt, { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
            <div className={styles['metaRow']}>
              <p className={styles['metaLabel']}>{t('checkout.paymentStatus')}</p>
              <p className={styles['metaValue']}>
                <span className={styles['badge']}>{order.paymentStatus}</span>
              </p>
            </div>
            <div className={styles['metaRow']}>
              <p className={styles['metaLabel']}>{t('checkout.fulfilmentStatus')}</p>
              <p className={styles['metaValue']} role="status">
                <span className={styles['badge']}>
                  {order.fulfilmentStatus === 'FULFILLED'
                    ? t('checkout.fulfilmentFulfilled')
                    : order.fulfilmentStatus === 'PARTIAL'
                      ? t('checkout.fulfilmentPartial')
                      : order.paymentStatus === 'PAID'
                        ? t('checkout.fulfilmentUnfulfilled')
                        : t('checkout.fulfilmentAwaitingPayment')}
                </span>
              </p>
            </div>
          </div>
          {order.status === 'PENDING_PAYMENT' && order.paymentStatus === 'UNPAID' ? (
            <div className={styles['payActions']}>
              <button
                type="button"
                className={styles['payButton']}
                disabled={paying}
                onClick={() => {
                  void startPayment();
                }}
              >
                {paying ? t('payments.paying') : t('payments.payNow')}
              </button>
              {payError !== null ? (
                <p className={styles['payStatus']} role="alert">
                  {payError}
                </p>
              ) : paying ? (
                <p className={styles['payStatus']} role="status">
                  {t('payments.redirecting')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {order.shippingAddress !== null ? (
          <div className={styles['section']}>
            <h2 className={styles['sectionTitle']}>{t('checkout.shippingAddressHeading')}</h2>
            <p className={styles['addressPreview']}>
              {order.shippingAddress.fullName}
              <br />
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 !== null ? <>, {order.shippingAddress.line2}</> : null}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.province}{' '}
              {order.shippingAddress.postalCode}
              <br />
              {order.shippingAddress.country} · {order.shippingAddress.phone}
            </p>
          </div>
        ) : null}

        {order.shipments.length > 0 ? (
          <div className={styles['section']}>
            <h2 className={styles['sectionTitle']}>{t('checkout.trackingHeading')}</h2>
            <ul className={styles['lines']}>
              {order.shipments.map((shipment) => (
                <li className={styles['line']} key={shipment.id}>
                  <div className={styles['lineInfo']}>
                    <p className={styles['lineTitle']} role="status">
                      {shipment.status === 'DELIVERED'
                        ? t('checkout.shipmentDelivered')
                        : shipment.status === 'IN_TRANSIT'
                          ? t('checkout.shipmentInTransit')
                          : shipment.status === 'FAILED' || shipment.status === 'RETURNED'
                            ? t('checkout.shipmentFailed')
                            : t('checkout.shipmentPending')}
                    </p>
                    {shipment.trackingNumber !== null ? (
                      <p className={styles['lineMeta']}>
                        {t('checkout.trackingNumber')}: <bdi>{shipment.trackingNumber}</bdi>
                      </p>
                    ) : null}
                    {shipment.shippedAt !== null ? (
                      <p className={styles['lineMeta']}>
                        {t('checkout.shippedAt')}:{' '}
                        {formatDate(locale, shipment.shippedAt, { dateStyle: 'medium' })}
                      </p>
                    ) : null}
                    {shipment.deliveredAt !== null ? (
                      <p className={styles['lineMeta']}>
                        {t('checkout.deliveredAt')}:{' '}
                        {formatDate(locale, shipment.deliveredAt, { dateStyle: 'medium' })}
                      </p>
                    ) : null}
                    {shipment.trackingUrl !== null ? (
                      <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                        {t('checkout.trackingHeading')}
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={styles['section']}>
          <h2 className={styles['sectionTitle']}>{t('checkout.orderItems')}</h2>
          <ul className={styles['lines']}>
            {order.lines.map((line, index) => (
              <li key={`${line.sku}-${index}`} className={styles['line']}>
                {line.imageUrl !== null ? (
                  <Image src={line.imageUrl} alt={line.productName} width={56} height={56} />
                ) : null}
                <div className={styles['lineInfo']}>
                  <p className={styles['lineTitle']}>{line.productName}</p>
                  <p className={styles['lineMeta']}>{line.variantName}</p>
                  <p className={styles['lineMeta']}>
                    {t('checkout.quantity')}: {line.quantity}
                  </p>
                </div>
                <div className={styles['lineAmounts']}>
                  <p className={styles['amount']}>
                    {t('checkout.unitPrice')}: {formatMinorMoney(locale, line.unitPrice)}
                  </p>
                  <p className={styles['amount']}>
                    {t('checkout.lineTotal')}: {formatMinorMoney(locale, line.lineTotal)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className={styles['summaryRow']}>
            <span>{t('checkout.subtotal')}</span>
            <span className={styles['amount']}>{formatMinorMoney(locale, order.subtotal)}</span>
          </div>
          {order.discountTotal.amountMinor !== '0' ? (
            <div className={styles['summaryRow']}>
              <span>{t('checkout.discount')}</span>
              <span className={styles['amount']}>
                −{formatMinorMoney(locale, order.discountTotal)}
              </span>
            </div>
          ) : null}
          <div className={styles['summaryRow']}>
            <span>{t('checkout.shipping')}</span>
            <span className={styles['amount']}>
              {formatMinorMoney(locale, order.shippingTotal)}
            </span>
          </div>
          <div className={styles['summaryRow']}>
            <span>{t('checkout.tax')}</span>
            <span className={styles['amount']}>{formatMinorMoney(locale, order.taxTotal)}</span>
          </div>
          <div className={`${styles['summaryRow']} ${styles['summaryTotal']}`}>
            <strong>{t('checkout.total')}</strong>
            <strong className={styles['amount']}>
              {formatMinorMoney(locale, order.grandTotal)}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}
