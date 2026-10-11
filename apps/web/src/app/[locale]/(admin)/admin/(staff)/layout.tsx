import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { adminLocale, adminUser, csrfConfig } from '@/lib/admin/server';
export const dynamic = 'force-dynamic';
export default async function StaffLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = adminLocale((await params).locale);
  const user = await adminUser(locale);
  return (
    <AdminShell locale={locale} user={user} csrf={csrfConfig()}>
      {children}
    </AdminShell>
  );
}
