'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { getNamespace, type Locale } from '@honey/i18n';
import type { AdminUser, CsrfConfig } from '@/lib/admin/types';
import { adminSections } from '@/lib/admin/navigation';
import { adminMutation } from '@/lib/admin/client';

export function AdminShell({
  locale,
  user,
  csrf,
  children,
}: {
  locale: Locale;
  user: AdminUser;
  csrf: CsrfConfig;
  children: ReactNode;
}) {
  const m = getNamespace(locale, 'admin');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const otherLocale = locale === 'fa' ? 'en' : 'fa';
  const switchHref = `${pathname.replace(/^\/(?:fa|en)(?=\/)/u, `/${otherLocale}`)}${searchParams.size === 0 ? '' : `?${searchParams}`}`;
  async function signOut() {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      await adminMutation('/api/bff/admin/auth/logout', {}, csrf);
      window.location.replace(`/${locale}/admin/sign-in`);
    } catch {
      setError(true);
      setPending(false);
      router.refresh();
    }
  }
  return (
    <div className="admin-shell">
      <a className="admin-skip" href="#admin-main">
        {m.skip}
      </a>
      <aside className={`admin-sidebar${open ? ' admin-sidebar-open' : ''}`}>
        <Link className="admin-brand" href={`/${locale}/admin`} prefetch={false}>
          <span className="admin-brand-mark" aria-hidden="true">
            H
          </span>
          <span>
            {m.title}
            <small>{m.workspace}</small>
          </span>
        </Link>
        <button
          className="admin-menu-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="admin-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? m.closeMenu : m.openMenu}
        </button>
        <nav id="admin-navigation" aria-label={m.navigation} className="admin-navigation">
          <Link
            href={`/${locale}/admin`}
            aria-current={pathname === `/${locale}/admin` ? 'page' : undefined}
            prefetch={false}
            onClick={() => setOpen(false)}
          >
            {m.overview}
          </Link>
          {adminSections
            .filter((section) => user.permissions.includes(section.permission))
            .map((section) => (
              <Link
                key={section.path}
                href={`/${locale}/admin/${section.path}`}
                aria-current={
                  pathname.startsWith(`/${locale}/admin/${section.path}`) ? 'page' : undefined
                }
                prefetch={false}
                onClick={() => setOpen(false)}
              >
                {m[section.path]}
              </Link>
            ))}
        </nav>
        <div className="admin-staff">
          <span className="admin-eyebrow">{m.staff}</span>
          <strong>{user.displayName ?? user.email}</strong>
          <bdi dir="ltr">{user.email}</bdi>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <span>{m.workspace}</span>
          <div className="admin-inline">
            <a href={switchHref} hrefLang={otherLocale} aria-label={m.language}>
              {otherLocale === 'fa' ? m.persian : m.english}
            </a>
            <button type="button" onClick={() => void signOut()} disabled={pending}>
              {pending ? m.pending : m.signOut}
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="admin-message admin-message-error">
            {m.genericError}
          </p>
        )}
        <main id="admin-main" className="admin-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
