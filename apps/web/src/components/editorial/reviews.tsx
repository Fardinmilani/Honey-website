'use client';
import { getNamespace, type Locale } from '@honey/i18n';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { reviewPage, type ReviewPage } from '@/lib/editorial/types';
import { csrfHeaders } from '@/lib/admin/client';
import type { CsrfConfig } from '@/lib/admin/types';
export function Reviews({
  locale,
  productId,
  initial,
  csrf,
}: {
  locale: Locale;
  productId: string;
  initial: ReviewPage;
  csrf: CsrfConfig;
}) {
  const m = getNamespace(locale, 'editorial');
  const id = useId();
  const [rows, setRows] = useState(initial);
  const [eligible, setEligible] = useState(false);
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const [loading, setLoading] = useState(false);
  const [moreError, setMoreError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/bff/me/reviews/eligibility?productId=' + encodeURIComponent(productId), {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: abort.signal,
    })
      .then(async (r) => {
        if (!r.ok) return;
        const raw: unknown = await r.json();
        if (typeof raw === 'object' && raw !== null && 'eligible' in raw && raw.eligible === true)
          setEligible(true);
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, [productId]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === 'pending') return;
    const d = new FormData(e.currentTarget);
    setState('pending');
    try {
      const r = await fetch('/api/bff/me/reviews', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...csrfHeaders(csrf) },
        body: JSON.stringify({
          productId,
          locale,
          rating: Number(d.get('rating')),
          title: d.get('title'),
          body: d.get('body'),
        }),
      });
      if (!r.ok) throw new Error('REVIEW_FAILED');
      setState('done');
      setEligible(false);
    } catch {
      setState('error');
    }
  }
  async function more() {
    if (loading || rows.nextCursor === null) return;
    setLoading(true);
    setMoreError(false);
    try {
      const r = await fetch(
        '/api/bff/products/' + productId + '/reviews?cursor=' + encodeURIComponent(rows.nextCursor),
        { cache: 'no-store' },
      );
      if (!r.ok) throw new Error('REVIEW_FAILED');
      const raw: unknown = await r.json();
      const p = reviewPage(raw);
      setRows((previous) => ({
        ...p,
        items: [
          ...previous.items,
          ...p.items.filter((row) => !previous.items.some((old) => old.id === row.id)),
        ],
      }));
    } catch {
      setMoreError(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="editorial-reviews" aria-labelledby={id + '-heading'}>
      <h2 id={id + '-heading'}>{m.reviews}</h2>
      {rows.aggregate && (
        <p>
          {m.average}:{' '}
          <bdi>
            {new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
              rows.aggregate.average,
            )}
          </bdi>{' '}
          / 5 · {m.count}: <bdi>{new Intl.NumberFormat(locale).format(rows.aggregate.count)}</bdi>
        </p>
      )}
      {rows.items.length === 0 ? (
        <p>{m.noReviews}</p>
      ) : (
        <ul className="editorial-review-list">
          {rows.items.map((row) => (
            <li key={row.id}>
              <article lang={row.locale} dir={row.locale === 'fa' ? 'rtl' : 'ltr'}>
                <h3>{row.title}</h3>
                <p>
                  {m.verified} · <bdi>{row.rating}</bdi> / 5
                </p>
                <p>{row.body}</p>
              </article>
            </li>
          ))}
        </ul>
      )}
      {rows.nextCursor && (
        <button type="button" disabled={loading} onClick={() => void more()}>
          {loading ? m.pending : m.more}
        </button>
      )}
      {moreError && <p role="alert">{m.error}</p>}
      {state === 'done' ? (
        <p role="status">{m.submitted}</p>
      ) : eligible ? (
        <form
          className="editorial-form"
          aria-busy={state === 'pending'}
          onSubmit={(e) => void submit(e)}
        >
          <h3>{m.reviewEligible}</h3>
          <p id={id + '-guidance'}>{m.reviewGuidance}</p>
          <fieldset>
            <legend>{m.rating}</legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="editorial-rating">
                <input type="radio" name="rating" value={n} required /> <bdi>{n}</bdi>{' '}
                <span aria-hidden="true">★</span>
              </label>
            ))}
          </fieldset>
          <label htmlFor={id + '-title'}>{m.reviewTitle}</label>
          <input
            name="title"
            id={id + '-title'}
            maxLength={160}
            required
            aria-describedby={state === 'error' ? id + '-error' : undefined}
          />
          <label htmlFor={id + '-body'}>{m.reviewBody}</label>
          <textarea
            name="body"
            id={id + '-body'}
            maxLength={5000}
            required
            aria-describedby={id + '-guidance' + (state === 'error' ? ' ' + id + '-error' : '')}
          />
          <button disabled={state === 'pending'} type="submit">
            {state === 'pending' ? m.pending : m.submit}
          </button>
          {state === 'error' && (
            <p role="alert" id={id + '-error'}>
              {m.error}
            </p>
          )}
        </form>
      ) : (
        <p>{m.reviewUnavailable}</p>
      )}
    </section>
  );
}
