'use client';

import { createTranslator, localizedHref, type Locale } from '@honey/i18n';
import NextLink from 'next/link';
import { useEffect, useState } from 'react';

import styles from '../orders/orders.module.css';

type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'AUTHORIZED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

type PaymentProjection = Readonly<{
  id: string;
  orderNumber: string;
  status: PaymentStatus;
  provider: string;
  redirectUrl: string | null;
  paidAt: string | null;
}>;

type PaymentResultProps = Readonly<{
  locale: Locale;
  paymentId: string;
  csrfCookieName: string;
  csrfHeaderName: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function parsePayment(value: unknown): PaymentProjection | null {
  if (!isRecord(value)) return null;
  const id = value['id'];
  const orderNumber = value['orderNumber'];
  const status = value['status'];
  const provider = value['provider'];
  const redirectUrl = value['redirectUrl'];
  const paidAt = value['paidAt'];
  if (
    typeof id !== 'string' ||
    typeof orderNumber !== 'string' ||
    typeof status !== 'string' ||
    typeof provider !== 'string' ||
    (redirectUrl !== null && typeof redirectUrl !== 'string') ||
    (paidAt !== null && typeof paidAt !== 'string')
  ) {
    return null;
  }
  return {
    id,
    orderNumber,
    status: status as PaymentStatus,
    provider,
    redirectUrl,
    paidAt,
  };
}

function messageForStatus(t: ReturnType<typeof createTranslator>, status: PaymentStatus): string {
  if (status === 'PAID') return t('payments.paid');
  if (status === 'FAILED') return t('payments.failed');
  if (status === 'CANCELLED') return t('payments.cancelled');
  if (status === 'EXPIRED') return t('payments.expired');
  return t('payments.pending');
}

export function PaymentResult({
  locale,
  paymentId,
  csrfCookieName,
  csrfHeaderName,
}: PaymentResultProps) {
  const t = createTranslator(locale);
  const [payment, setPayment] = useState<PaymentProjection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const headers = new Headers({ accept: 'application/json', 'x-honey-locale': locale });
    const csrf = readCookieValue(csrfCookieName);
    if (csrf !== undefined && csrf !== '') headers.set(csrfHeaderName, csrf);

    void fetch(`/api/bff/payments/${paymentId}/return`, {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        const parsed = parsePayment(body);
        if (!response.ok || parsed === null) {
          throw new Error(
            isRecord(body) && body['code'] === 'PAYMENT_PROVIDER_UNAVAILABLE'
              ? t('payments.providerUnavailable')
              : t('payments.genericError'),
          );
        }
        return parsed;
      })
      .then((next) => {
        if (!cancelled) setPayment(next);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : t('payments.genericError'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [csrfCookieName, csrfHeaderName, locale, paymentId, t]);

  const orderHref =
    payment === null
      ? localizedHref('/orders', locale)
      : localizedHref('/orders/[number]', locale, { number: payment.orderNumber });

  return (
    <section className={styles['page']} aria-labelledby="payment-result-heading">
      <h1 id="payment-result-heading" className={styles['title']}>
        {t('payments.resultTitle')}
      </h1>
      {error !== null ? (
        <p className={styles['status']} role="alert">
          {error}
        </p>
      ) : payment === null ? (
        <p className={styles['loading']}>{t('payments.redirecting')}</p>
      ) : (
        <>
          <p className={styles['status']} role="status" aria-live="polite">
            <span className={styles['badge']}>{payment.status}</span>{' '}
            {messageForStatus(t, payment.status)}
          </p>
          <p className={styles['cardMeta']}>{t('payments.statusLabel')}</p>
          {payment.status !== 'PAID' &&
          payment.status !== 'REFUNDED' &&
          payment.status !== 'PARTIALLY_REFUNDED' ? (
            <NextLink href={orderHref} className={styles['payButton']}>
              {t('payments.retry')}
            </NextLink>
          ) : null}
        </>
      )}
      <NextLink href={orderHref} className={styles['browseLink']}>
        {t('payments.returnToOrder')}
      </NextLink>
    </section>
  );
}
