import { getNamespace, type AdminMessages, type Locale } from '@honey/i18n';
import type { ReactNode } from 'react';
export function AdminPage({
  locale,
  title,
  description,
  children,
}: {
  locale: Locale;
  title: keyof AdminMessages;
  description?: keyof AdminMessages;
  children: ReactNode;
}) {
  const m = getNamespace(locale, 'admin');
  return (
    <>
      <div className="admin-page-heading">
        <span className="admin-eyebrow">{m.workspace}</span>
        <h1>{m[title]}</h1>
        {description !== undefined && <p>{m[description]}</p>}
      </div>
      {children}
    </>
  );
}
export function AdminDenied({ locale }: { locale: Locale }) {
  const m = getNamespace(locale, 'admin');
  return (
    <section className="admin-empty" role="alert">
      <h1>{m.forbidden}</h1>
    </section>
  );
}
