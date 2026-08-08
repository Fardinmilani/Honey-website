import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Structural admin layout. No admin pages exist in Phase 9 — visiting
 * `/[locale]/admin` without a child page yields Next.js not-found.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div data-admin-shell="true">{children}</div>;
}
