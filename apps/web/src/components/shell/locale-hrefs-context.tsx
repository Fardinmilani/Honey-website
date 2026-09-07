'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { Locale } from '@honey/i18n';

export type LocaleHrefs = Partial<Record<Locale, string>>;

type LocaleHrefsContextValue = {
  readonly localeHrefs: LocaleHrefs | undefined;
  readonly setLocaleHrefs: (hrefs: LocaleHrefs | undefined) => void;
};

const LocaleHrefsContext = createContext<LocaleHrefsContextValue | null>(null);

export function LocaleHrefsProvider({ children }: { readonly children: ReactNode }) {
  const [localeHrefs, setLocaleHrefs] = useState<LocaleHrefs | undefined>(undefined);
  const value = useMemo(
    () => ({
      localeHrefs,
      setLocaleHrefs,
    }),
    [localeHrefs],
  );

  return <LocaleHrefsContext.Provider value={value}>{children}</LocaleHrefsContext.Provider>;
}

export function useLocaleHrefs(): LocaleHrefsContextValue {
  const context = useContext(LocaleHrefsContext);
  if (context === null) {
    throw new Error('useLocaleHrefs must be used within LocaleHrefsProvider');
  }
  return context;
}
