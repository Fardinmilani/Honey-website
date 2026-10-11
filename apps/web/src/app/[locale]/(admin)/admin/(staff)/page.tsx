import Link from 'next/link';
import { getNamespace } from '@honey/i18n';
import { AdminPage } from '@/components/admin/admin-page';
import { adminSections } from '@/lib/admin/navigation';
import { adminLocale, adminUser } from '@/lib/admin/server';
export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const locale = adminLocale((await params).locale);
  const m = getNamespace(locale, 'admin');
  const user = await adminUser(locale);
  const sections = adminSections.filter((section) => user.permissions.includes(section.permission));
  return (
    <AdminPage locale={locale} title="overview" description="overviewDescription">
      <div className="admin-hub">
        {sections.map((section) => (
          <Link key={section.path} href={`/${locale}/admin/${section.path}`} prefetch={false}>
            <span>{m[section.path]}</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </Link>
        ))}
      </div>
      {sections.length === 0 && <p className="admin-empty">{m.noPermissions}</p>}
    </AdminPage>
  );
}
