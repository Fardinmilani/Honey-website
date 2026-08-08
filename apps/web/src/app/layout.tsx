import type { ReactNode } from 'react';

/**
 * Root layout is a pass-through. Locale-specific `<html lang dir>` is owned by
 * `app/[locale]/layout.tsx`. The unsupported-locale rewrite uses a dedicated layout.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
