import { isLocale } from '@honey/i18n';
import { Container } from '@honey/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { OrderHistory } from '@/components/orders/order-history';

type OrdersPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function OrdersPage({ params }: OrdersPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <Container>
      <OrderHistory locale={locale} />
    </Container>
  );
}
