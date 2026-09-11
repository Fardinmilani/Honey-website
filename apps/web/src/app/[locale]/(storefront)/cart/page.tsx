import { isLocale } from '@honey/i18n';
import { Container } from '@honey/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CartContents } from '@/components/cart/cart-contents';
import { getWebEnv } from '@/lib/env';

type CartPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CartPage({ params }: CartPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }

  const env = getWebEnv();
  return (
    <Container>
      <CartContents
        locale={locale}
        csrfCookieName={env.csrfCookieName}
        csrfHeaderName={env.csrfHeaderName}
      />
    </Container>
  );
}
