import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Admin route-group access-boundary foundation only.
 * No admin screens ship in Phase 9. Authorization remains API-side.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminGroupLayout({ children }: { children: ReactNode }) {
  return (
    <div data-surface="admin" className="admin-boundary">
      {children}
    </div>
  );
}
