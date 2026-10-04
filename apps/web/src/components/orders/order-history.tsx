'use client';

import {
  createTranslator,
  formatDate,
  formatMinorMoney,
  localizedHref,
  type Locale,
} from '@honey/i18n';
import NextLink from 'next/link';
import { useEffect, useState } from 'react';

import styles from './orders.module.css';

type Money = Readonly<{ amountMinor: string; currency: string }>;

type OrderSummary = Readonly<{
  number: string;
  status: string;
  paymentStatus: string;
  fulfilmentStatus: string;
  currency: string;
  grandTotal: Money;
  placedAt: string;
}>;

type OrderHistoryProps = Readonly<{
  locale: Locale;
}>;

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

function parseSummary(value: unknown): OrderSummary | null {
  if (!isRecord(value)) return null;
  const number = stringField(value, 'number');
  const status = stringField(value, 'status');
  const paymentStatus = stringField(value, 'paymentStatus');
  const fulfilmentStatus = stringField(value, 'fulfilmentStatus');
  const currency = stringField(value, 'currency');
  const grandTotal = parseMoney(value['grandTotal']);
  const placedAt = stringField(value, 'placedAt');
  if (
    number === null ||
    status === null ||
    paymentStatus === null ||
    fulfilmentStatus === null ||
    currency === null ||
    grandTotal === null ||
    placedAt === null
  ) {
    return null;
  }
  return { number, status, paymentStatus, fulfilmentStatus, currency, grandTotal, placedAt };
}

function parseList(value: unknown): readonly OrderSummary[] | null {
  if (!Array.isArray(value)) return null;
  const orders: OrderSummary[] = [];
  for (const item of value) {
    const parsed = parseSummary(item);
    if (parsed === null) return null;
    orders.push(parsed);
  }
  return orders;
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

type ListState = 'loading' | 'signedOut' | 'error' | 'ready';

export function OrderHistory({ locale }: OrderHistoryProps) {
  const t = createTranslator(locale);
  const [state, setState] = useState<ListState>('loading');
  const [orders, setOrders] = useState<readonly OrderSummary[]>([]);
  const productsHref = localizedHref('/products', locale);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    void (async () => {
      try {
        const response = await fetch('/api/bff/orders', {
          method: 'GET',
          headers: { accept: 'application/json', 'x-honey-locale': locale },
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (response.status === 404) {
          if (!cancelled) setState('signedOut');
          return;
        }
        const payload = await responseJson(response);
        if (!response.ok) {
          if (!cancelled) setState('error');
          return;
        }
        const list = parseList(payload);
        if (list === null) {
          if (!cancelled) setState('error');
          return;
        }
        if (!cancelled) {
          setOrders(list);
          setState('ready');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (state === 'loading') {
    return (
      <section className={styles['page']} aria-busy="true">
        <h1 className={styles['title']}>{t('checkout.ordersTitle')}</h1>
        <p className={styles['loading']}>{t('checkout.checkoutLoading')}</p>
      </section>
    );
  }

  if (state === 'signedOut' || state === 'error') {
    return (
      <section className={styles['page']}>
        <h1 className={styles['title']}>{t('checkout.ordersTitle')}</h1>
        <p className={styles['status']} role="alert">
          {t('checkout.orderUnavailable')}
        </p>
      </section>
    );
  }

  if (orders.length === 0) {
    return (
      <section className={styles['page']}>
        <h1 className={styles['title']}>{t('checkout.ordersTitle')}</h1>
        <div className={styles['empty']}>
          <p className={styles['emptyDescription']}>{t('checkout.ordersEmpty')}</p>
          <NextLink href={productsHref} className={styles['browseLink']}>
            {t('checkout.browseProducts')}
          </NextLink>
        </div>
      </section>
    );
  }

  return (
    <section className={styles['page']} aria-labelledby="orders-heading">
      <h1 id="orders-heading" className={styles['title']}>
        {t('checkout.ordersTitle')}
      </h1>
      <ul className={styles['list']}>
        {orders.map((order) => (
          <li key={order.number}>
            <NextLink
              className={styles['card']}
              href={localizedHref('/orders/[number]', locale, { number: order.number })}
            >
              <div className={styles['cardHeader']}>
                <span className={styles['cardNumber']}>{order.number}</span>
                <span className={styles['badge']}>{order.status}</span>
              </div>
              <p className={styles['cardMeta']}>
                {formatDate(locale, order.placedAt, { dateStyle: 'medium' })} ·{' '}
                {formatMinorMoney(locale, order.grandTotal)}
              </p>
            </NextLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
