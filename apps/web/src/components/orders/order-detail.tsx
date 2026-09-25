'use client';

import { createTranslator, formatDate, formatMinorMoney, localizedHref, type Locale } from '@honey/i18n';
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
}>;

type OrderDetailProps = Readonly<{
  locale: Locale;
  orderNumber: string;
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
    !Array.isArray(linesRaw)
  ) {
    return null;
  }

  const lines: OrderLine[] = [];
  for (const item of linesRaw) {
    const line = parseLine(item);
    if (line === null) return null;
    lines.push(line);
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

export function OrderDetail({ locale, orderNumber }: OrderDetailProps) {
  const t = createTranslator(locale);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const productsHref = localizedHref('/products', locale);

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
              <p className={styles['metaValue']}>
                <span className={styles['badge']}>{order.fulfilmentStatus}</span>
              </p>
            </div>
          </div>
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
              {order.shippingAddress.city}, {order.shippingAddress.province} {order.shippingAddress.postalCode}
              <br />
              {order.shippingAddress.country} · {order.shippingAddress.phone}
            </p>
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
              <span className={styles['amount']}>−{formatMinorMoney(locale, order.discountTotal)}</span>
            </div>
          ) : null}
          <div className={styles['summaryRow']}>
            <span>{t('checkout.shipping')}</span>
            <span className={styles['amount']}>{formatMinorMoney(locale, order.shippingTotal)}</span>
          </div>
          <div className={styles['summaryRow']}>
            <span>{t('checkout.tax')}</span>
            <span className={styles['amount']}>{formatMinorMoney(locale, order.taxTotal)}</span>
          </div>
          <div className={`${styles['summaryRow']} ${styles['summaryTotal']}`}>
            <strong>{t('checkout.total')}</strong>
            <strong className={styles['amount']}>{formatMinorMoney(locale, order.grandTotal)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
