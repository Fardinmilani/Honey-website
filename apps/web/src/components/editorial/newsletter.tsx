'use client';
import { getNamespace, type Locale } from '@honey/i18n';
import { useId, useState, type FormEvent } from 'react';
export function Newsletter({ locale }: { locale: Locale }) {
  const m = getNamespace(locale, 'editorial');
  const id = useId();
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === 'pending') return;
    const data = new FormData(e.currentTarget);
    setState('pending');
    try {
      const response = await fetch('/api/bff/newsletter/subscribe', {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: data.get('email'),
          locale,
          consent: data.get('consent') === 'on',
        }),
      });
      if (!response.ok) throw new Error('NEWSLETTER_FAILED');
      setState('done');
    } catch {
      setState('error');
    }
  }
  return (
    <section className="editorial-newsletter" aria-labelledby={id + '-heading'}>
      <h2 id={id + '-heading'}>{m.newsletter}</h2>
      <form
        onSubmit={(e) => void submit(e)}
        aria-busy={state === 'pending'}
        className="editorial-form"
      >
        <label htmlFor={id + '-email'}>{m.email}</label>
        <input
          id={id + '-email'}
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          maxLength={254}
          required
          aria-describedby={state === 'error' ? id + '-result' : undefined}
        />
        <label className="editorial-check" htmlFor={id + '-consent'}>
          <input id={id + '-consent'} name="consent" type="checkbox" required />
          {m.consent}
        </label>
        <button type="submit" disabled={state === 'pending'}>
          {state === 'pending' ? m.pending : m.subscribe}
        </button>
        {state === 'done' && (
          <p role="status" id={id + '-result'}>
            {m.subscribeResult}
          </p>
        )}
        {state === 'error' && (
          <p role="alert" id={id + '-result'}>
            {m.error}
          </p>
        )}
      </form>
    </section>
  );
}
export function NewsletterAction({
  locale,
  action,
  token,
}: {
  locale: Locale;
  action: 'confirm' | 'unsubscribe';
  token: string;
}) {
  const m = getNamespace(locale, 'editorial');
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const valid = /^[A-Za-z0-9_-]{43}$/u.test(token);
  async function submit() {
    if (state === 'pending') return;
    setState('pending');
    try {
      const r = await fetch('/api/bff/newsletter/' + action, {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!r.ok) throw new Error('NEWSLETTER_FAILED');
      window.history.replaceState(null, '', window.location.pathname);
      setState('done');
    } catch {
      setState('error');
    }
  }
  return (
    <section className="editorial-page">
      <h1>{m[action]}</h1>
      <p>{valid ? m.tokenHelp : m.invalidToken}</p>
      {valid && state !== 'done' && (
        <button type="button" onClick={() => void submit()} disabled={state === 'pending'}>
          {state === 'pending' ? m.pending : m[action]}
        </button>
      )}
      {state === 'done' && <p role="status">{m.actionResult}</p>}
      {state === 'error' && <p role="alert">{m.error}</p>}
    </section>
  );
}
