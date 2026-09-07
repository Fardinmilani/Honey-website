'use client';

import { useEffect } from 'react';

import type { LocaleHrefs } from './locale-hrefs-context';
import { useLocaleHrefs } from './locale-hrefs-context';

type SetEntityLocaleHrefsProps = {
  readonly hrefs: LocaleHrefs;
};

/**
 * Registers per-locale entity paths for the header language switcher.
 * Clears on unmount so listing pages fall back to segment remapping.
 */
export function SetEntityLocaleHrefs({ hrefs }: SetEntityLocaleHrefsProps) {
  const { setLocaleHrefs } = useLocaleHrefs();

  useEffect(() => {
    setLocaleHrefs(hrefs);
    return () => {
      setLocaleHrefs(undefined);
    };
  }, [hrefs, setLocaleHrefs]);

  return null;
}
