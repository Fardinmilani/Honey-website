import { AdminSignIn } from '@/components/admin/admin-sign-in';
import { adminLocale, csrfConfig } from '@/lib/admin/server';
export const dynamic = 'force-dynamic';
export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ denied?: string }>;
}) {
  return (
    <AdminSignIn
      locale={adminLocale((await params).locale)}
      csrf={csrfConfig()}
      denied={(await searchParams).denied === '1'}
    />
  );
}
