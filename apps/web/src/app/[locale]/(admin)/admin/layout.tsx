import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Shared admin structure; the staff child group owns the session UX guard.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div data-admin-shell="true">{children}</div>;
}
