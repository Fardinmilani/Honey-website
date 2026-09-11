'use client';

import type { Locale } from '@honey/i18n';
import { createTranslator } from '@honey/i18n';
import { useRef, useState } from 'react';

type AddToCartProps = Readonly<{
  variantId: string;
  locale: Locale;
  csrfCookieName: string;
  csrfHeaderName: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasQuantityAdjustmentForVariant(response: unknown, variantId: string): boolean {
  if (
    !isRecord(response) ||
    !Array.isArray(response['adjustments']) ||
    !Array.isArray(response['lines'])
  ) {
    return false;
  }
  const adjustedLineIds = new Set<string>();
  for (const adjustment of response['adjustments']) {
    if (!isRecord(adjustment) || adjustment['code'] !== 'QUANTITY_CLAMPED') continue;
    const lineId = adjustment['lineId'];
    if (typeof lineId === 'string') adjustedLineIds.add(lineId);
  }
  return response['lines'].some(
    (line) =>
      isRecord(line) &&
      line['variantId'] === variantId &&
      typeof line['id'] === 'string' &&
      adjustedLineIds.has(line['id']),
  );
}

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (match === undefined) return undefined;
  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return match.slice(prefix.length);
  }
}

async function bootstrapCart(locale: Locale): Promise<void> {
  const response = await fetch('/api/bff/cart', {
    method: 'GET',
    headers: { accept: 'application/json', 'x-honey-locale': locale },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Cart bootstrap failed');
}

export function AddToCart({ variantId, locale, csrfCookieName, csrfHeaderName }: AddToCartProps) {
  const t = createTranslator(locale);
  const [state, setState] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [quantityAdjusted, setQuantityAdjusted] = useState(false);
  const retryKey = useRef<string | null>(null);

  async function add(): Promise<void> {
    setState('pending');
    setQuantityAdjusted(false);
    try {
      await bootstrapCart(locale);
      const csrf = readCookie(csrfCookieName);
      if (csrf === undefined || csrf === '') throw new Error('CSRF cookie unavailable');
      const idempotencyKey = retryKey.current ?? crypto.randomUUID();
      retryKey.current = idempotencyKey;
      const response = await fetch('/api/bff/cart/lines', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
          'x-honey-locale': locale,
          [csrfHeaderName]: csrf,
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ variantId, quantity: 1 }),
      });
      if (!response.ok) throw new Error('Cart add failed');
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        // A successful mutation remains successful even if a malformed proxy response
        // prevents optional adjustment feedback from being read.
      }
      retryKey.current = null;
      window.dispatchEvent(new CustomEvent('honey-cart-updated'));
      setQuantityAdjusted(hasQuantityAdjustmentForVariant(payload, variantId));
      setState('success');
    } catch {
      setQuantityAdjusted(false);
      setState('error');
    }
  }

  const label =
    state === 'pending'
      ? t('product.addingToCart')
      : state === 'success'
        ? t('product.addedToCart')
        : t('product.addToCart');
  const feedback =
    state === 'error'
      ? t('product.addToCartFailed')
      : state === 'success'
        ? quantityAdjusted
          ? t('product.addToCartQuantityAdjusted')
          : label
        : '';

  return (
    <div className="product-add-to-cart">
      <button
        type="button"
        className="product-add-to-cart__button"
        disabled={state === 'pending'}
        onClick={() => void add()}
      >
        {label}
      </button>
      <p className="product-add-to-cart__feedback" aria-live="polite">
        {feedback}
      </p>
    </div>
  );
}
