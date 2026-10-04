import { isLocale } from '@honey/i18n';
import { Container } from '@honey/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PaymentResult } from '@/components/payments/payment-result';
import { getWebEnv } from '@/lib/env';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type PaymentReturnPageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PaymentReturnPage({ params, searchParams }: PaymentReturnPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const query = await searchParams;
  const raw = query['paymentId'];
  const paymentId = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (paymentId === undefined || !UUID_RE.test(paymentId)) notFound();

  const env = getWebEnv();
  return (
    <Container>
      <PaymentResult
        locale={locale}
        paymentId={paymentId}
        csrfCookieName={env.csrfCookieName}
        csrfHeaderName={env.csrfHeaderName}
      />
    </Container>
  );
}
