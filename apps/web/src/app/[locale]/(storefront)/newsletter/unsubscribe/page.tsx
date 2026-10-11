import { Container } from '@honey/ui';
import { isLocale } from '@honey/i18n';
import { notFound } from 'next/navigation';
import { NewsletterAction } from '@/components/editorial/newsletter';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const token = (await searchParams).token ?? '';
  return (
    <Container>
      <NewsletterAction locale={locale} action="unsubscribe" token={token} />
    </Container>
  );
}
