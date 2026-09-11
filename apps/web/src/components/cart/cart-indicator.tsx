'use client';

import { createTranslator, localizedHref, type Locale } from '@honey/i18n';
import NextLink from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type CartIndicatorProps = Readonly<{
  locale: Locale;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function selectedQuantity(value: unknown): number | null {
  const cart = isRecord(value) && isRecord(value['data']) ? value['data'] : value;
  if (!isRecord(cart) || !Array.isArray(cart['lines'])) return null;

  let total = 0;
  for (const line of cart['lines']) {
    if (!isRecord(line) || typeof line['quantity'] !== 'number') return null;
    if (!Number.isSafeInteger(line['quantity']) || line['quantity'] < 1) return null;
    total += line['quantity'];
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

async function currentSelectedQuantity(locale: Locale): Promise<number | null> {
  const response = await fetch('/api/bff/cart', {
    method: 'GET',
    headers: { accept: 'application/json', 'x-honey-locale': locale },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) return null;

  try {
    return selectedQuantity((await response.json()) as unknown);
  } catch {
    return null;
  }
}

/** Refreshes its count only after a server-backed cart mutation. */
export function CartIndicator({ locale }: CartIndicatorProps) {
  const t = createTranslator(locale);
  const [count, setCount] = useState<number | null>(null);
  const refresh = useCallback(() => {
    void currentSelectedQuantity(locale).then(setCount);
  }, [locale]);

  useEffect(() => {
    window.addEventListener('honey-cart-updated', refresh);
    return () => window.removeEventListener('honey-cart-updated', refresh);
  }, [refresh]);

  const label = count === null ? t('navigation.cart') : t('navigation.cartItemCount', { count });
  return (
    <NextLink href={localizedHref('/cart', locale)} className="site-nav__link" aria-label={label}>
      {t('navigation.cart')}
      {count !== null && count > 0 ? <span aria-hidden="true"> ({count})</span> : null}
    </NextLink>
  );
}
