import { isLocale } from '@honey/i18n';
import { Container } from '@honey/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CheckoutFlow } from '@/components/checkout/checkout-flow';
import { getWebEnv } from '@/lib/env';

type CheckoutPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }

  const env = getWebEnv();
  return (
    <Container>
      <CheckoutFlow
        locale={locale}
        csrfCookieName={env.csrfCookieName}
        csrfHeaderName={env.csrfHeaderName}
      />
    </Container>
  );
}
