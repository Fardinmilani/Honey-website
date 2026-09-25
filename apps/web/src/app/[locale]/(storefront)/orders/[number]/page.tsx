import { isLocale } from '@honey/i18n';
import { Container } from '@honey/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { OrderDetail } from '@/components/orders/order-detail';

const ORDER_NUMBER_RE = /^HNY-\d{4}-\d{6}$/u;

type OrderPageProps = Readonly<{
  params: Promise<{ locale: string; number: string }>;
}>;

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function OrderPage({ params }: OrderPageProps) {
  const { locale, number } = await params;
  if (!isLocale(locale) || !ORDER_NUMBER_RE.test(number)) {
    notFound();
  }

  return (
    <Container>
      <OrderDetail locale={locale} orderNumber={number} />
    </Container>
  );
}
