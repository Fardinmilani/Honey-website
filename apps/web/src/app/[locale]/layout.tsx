import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { createTranslator, getLocaleConfig, isLocale, type Locale } from '@honey/i18n';
import '@honey/ui/styles.css';

import { getWebEnv } from '../../lib/env';
import '../../styles/global.css';

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateStaticParams() {
  return [{ locale: 'fa' }, { locale: 'en' }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) {
    return { title: 'Honey' };
  }
  const t = createTranslator(raw);
  const config = getLocaleConfig(raw);
  const { publicSiteUrl } = getWebEnv();
  return {
    title: {
      default: t('home.title'),
      template: `%s · ${t('common.brandName')}`,
    },
    description: t('home.supporting'),
    metadataBase: publicSiteUrl,
    alternates: {
      languages: {
        'fa-IR': '/fa',
        en: '/en',
      },
    },
    openGraph: {
      locale: config.ogLocale,
      siteName: t('common.brandName'),
    },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) {
    notFound();
  }
  const locale: Locale = raw;
  const config = getLocaleConfig(locale);

  return (
    <html lang={config.bcp47} dir={config.dir}>
      <body style={{ fontFamily: config.fontFamily }} data-locale={locale} data-font={config.font}>
        {children}
      </body>
    </html>
  );
}
