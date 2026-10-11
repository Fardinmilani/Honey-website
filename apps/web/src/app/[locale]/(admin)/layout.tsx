import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/styles/admin.css';

/**
 * Phase 17 admin surface. Staff guards are inside the protected child group;
 * the sign-in page uses the same noindex boundary. API authorization is authoritative.
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
