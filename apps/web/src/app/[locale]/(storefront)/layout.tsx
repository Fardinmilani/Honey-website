import type { ReactNode } from 'react';

import { isLocale } from '@honey/i18n';
import { notFound } from 'next/navigation';

import { SiteFooter } from '@/components/shell/site-footer';
import { LocaleHrefsProvider } from '@/components/shell/locale-hrefs-context';
import { SiteHeader } from '@/components/shell/site-header';
import { SkipToContent } from '@/components/shell/skip-to-content';

import '@/styles/catalog.css';

/** Catalog pages fetch the API at request time with tagged caching; skip build-time prerender. */
export const dynamic = 'force-dynamic';

type StorefrontLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function StorefrontLayout({ children, params }: StorefrontLayoutProps) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <LocaleHrefsProvider>
      <div className="site-shell">
        <SkipToContent locale={locale} />
        <SiteHeader locale={locale} />
        <main id="main-content" className="site-main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter locale={locale} />
      </div>
    </LocaleHrefsProvider>
  );
}
