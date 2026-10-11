'use client';
import { useState, type FormEvent } from 'react';
import { getNamespace, type Locale } from '@honey/i18n';
import { adminMutation, AdminRequestError } from '@/lib/admin/client';
import type { CsrfConfig } from '@/lib/admin/types';
import { flag, record, text } from '@/lib/admin/validation';

export function AdminSignIn({
  locale,
  csrf,
  denied,
}: {
  locale: Locale;
  csrf: CsrfConfig;
  denied: boolean;
}) {
  const m = getNamespace(locale, 'admin');
  const [stage, setStage] = useState<'password' | 'totp'>('password');
  const [setupKey, setSetupKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(denied ? m.forbidden : null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    try {
      const result = record(
        await adminMutation(
          stage === 'password' ? '/api/bff/admin/auth/login' : '/api/bff/admin/auth/totp',
          stage === 'password'
            ? { email: String(data.get('email')).trim(), password: String(data.get('password')) }
            : { code: String(data.get('code')).trim() },
          csrf,
        ),
      );
      const next = text(result['next']);
      if (next === 'AUTHENTICATED') {
        if (!flag(record(result['user'])['isStaff'])) {
          await adminMutation('/api/bff/admin/auth/logout', {}, csrf);
          form.reset();
          setError(m.forbidden);
          setPending(false);
          return;
        }
        setSetupKey(null);
        form.reset();
        window.location.replace(`/${locale}/admin`);
        return;
      }
      if (next !== 'TOTP_REQUIRED' && next !== 'TOTP_ENROLLMENT_REQUIRED')
        throw new Error('ADMIN_AUTH_RESPONSE_INVALID');
      if (next === 'TOTP_ENROLLMENT_REQUIRED') {
        const uri = new URL(text(result['provisioningUri']));
        const secret = uri.searchParams.get('secret');
        if (uri.protocol !== 'otpauth:' || secret === null || !/^[A-Z2-7]{16,128}$/u.test(secret))
          throw new Error('ADMIN_AUTH_RESPONSE_INVALID');
        setSetupKey(secret);
      }
      form.reset();
      setStage('totp');
      setPending(false);
    } catch (failure) {
      setError(
        failure instanceof AdminRequestError && failure.status === 429
          ? m.unavailable
          : m.genericError,
      );
      setPending(false);
    }
  }
  return (
    <main className="admin-sign-in">
      <section className="admin-auth-card">
        <p className="admin-eyebrow">{m.workspace}</p>
        <h1>{stage === 'password' ? m.signIn : setupKey === null ? m.totp : m.enroll}</h1>
        <p>{m.signInDescription}</p>
        {error !== null && (
          <p className="admin-message admin-message-error" role="alert">
            {error}
          </p>
        )}
        {setupKey !== null && (
          <div className="admin-message">
            <p>{m.enrollHelp}</p>
            <label htmlFor="admin-setup-key">{m.setupKey}</label>
            <input id="admin-setup-key" dir="ltr" readOnly value={setupKey} autoComplete="off" />
          </div>
        )}
        <form onSubmit={(event) => void submit(event)} className="admin-form" key={stage}>
          {stage === 'password' ? (
            <>
              <label htmlFor="admin-email">{m.email}</label>
              <input
                id="admin-email"
                name="email"
                type="email"
                dir="ltr"
                autoComplete="username"
                required
                maxLength={254}
                autoFocus
              />
              <label htmlFor="admin-password">{m.password}</label>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
              />
            </>
          ) : (
            <>
              <label htmlFor="admin-code">{m.totp}</label>
              <input
                id="admin-code"
                name="code"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
                maxLength={6}
                autoFocus
              />
              <p className="admin-help">{m.totpHelp}</p>
            </>
          )}
          <button className="admin-primary" type="submit" disabled={pending}>
            {pending ? m.pending : stage === 'password' ? m.continue : m.verify}
          </button>
        </form>
        <a
          href={`/${locale === 'fa' ? 'en' : 'fa'}/admin/sign-in`}
          hrefLang={locale === 'fa' ? 'en' : 'fa'}
        >
          {locale === 'fa' ? m.english : m.persian}
        </a>
      </section>
    </main>
  );
}
