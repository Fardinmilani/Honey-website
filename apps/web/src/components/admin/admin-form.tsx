'use client';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { getNamespace, type AdminMessages, type Locale } from '@honey/i18n';
import { adminMutation, AdminRequestError } from '@/lib/admin/client';
import type { CsrfConfig } from '@/lib/admin/types';
import { stateLabel } from '@/lib/admin/labels';

export type FormContext = Readonly<{ locale: Locale; csrf: CsrfConfig }>;
export type Label = keyof AdminMessages;
const Issues = createContext<readonly string[]>([]);
export function value(data: FormData, name: string): string {
  const result = data.get(name);
  if (typeof result !== 'string') throw new Error('ADMIN_FIELD_INVALID');
  return result.trim().normalize('NFC');
}
export function nullable(data: FormData, name: string): string | null {
  return value(data, name) || null;
}
export function integer(data: FormData, name: string): number {
  const raw = value(data, name);
  if (!/^-?\d{1,12}$/u.test(raw)) throw new Error('ADMIN_FIELD_INVALID');
  const result = Number(raw);
  if (!Number.isSafeInteger(result)) throw new Error('ADMIN_FIELD_INVALID');
  return result;
}
export function nullableInteger(data: FormData, name: string): number | null {
  return value(data, name) === '' ? null : integer(data, name);
}
export function checked(data: FormData, name: string): boolean {
  return data.get(name) === 'on';
}
export function list(data: FormData, name: string): string[] {
  return value(data, name)
    .split(/[,\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}
export function timestamp(data: FormData, name: string): string {
  const raw = value(data, name);
  const date = new Date(`${raw}Z`);
  if (raw === '' || !Number.isFinite(date.getTime())) throw new Error('ADMIN_FIELD_INVALID');
  return date.toISOString();
}
export function nullableTimestamp(data: FormData, name: string): string | null {
  return value(data, name) === '' ? null : timestamp(data, name);
}
export function localTimestamp(value: unknown): string {
  if (typeof value !== 'string') return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

export function Field({
  locale,
  label,
  name = label,
  initial,
  type = 'text',
  required = true,
  options,
  multiline = false,
  maxLength,
  min,
  max,
  step,
  hint,
  readOnly = false,
}: {
  locale: Locale;
  label: Label;
  name?: string;
  initial?: string | number | null;
  type?: 'text' | 'email' | 'number' | 'datetime-local' | 'url';
  required?: boolean;
  options?: readonly string[];
  multiline?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  hint?: Label;
  readOnly?: boolean;
}) {
  const m = getNamespace(locale, 'admin');
  const id = useId();
  const issues = useContext(Issues);
  const invalid = issues.some((path) => path === name || path.startsWith(`${name}.`));
  const props = {
    id,
    name,
    defaultValue: initial ?? '',
    required,
    'aria-invalid': invalid || undefined,
    'aria-describedby': invalid ? `${id}-error` : hint === undefined ? undefined : `${id}-hint`,
  };
  return (
    <div className="admin-field">
      <label htmlFor={id}>
        {m[label]}
        {!required && <span className="admin-help"> · {m.optional}</span>}
      </label>
      {options !== undefined ? (
        <select {...props}>
          {!required && <option value="">{m.optional}</option>}
          {options.map((option) => (
            <option key={option} value={option}>
              {stateLabel(m, option)}
            </option>
          ))}
        </select>
      ) : multiline ? (
        <textarea {...props} maxLength={maxLength ?? 5000} />
      ) : (
        <input
          {...props}
          type={type}
          maxLength={maxLength ?? 200}
          min={min}
          max={max}
          step={step}
          readOnly={readOnly}
          dir={
            ['email', 'url', 'datetime-local', 'number'].includes(type) ||
            /(?:Id|Minor|sku|code|barcode|currency)$/u.test(name)
              ? 'ltr'
              : undefined
          }
        />
      )}
      {hint !== undefined && (
        <p className="admin-help" id={`${id}-hint`}>
          {m[hint]}
        </p>
      )}
      {invalid && (
        <span className="admin-field-error" id={`${id}-error`}>
          {m.invalidField}
        </span>
      )}
    </div>
  );
}
export function Check({
  locale,
  label,
  name = label,
  initial = false,
}: {
  locale: Locale;
  label: Label;
  name?: string;
  initial?: boolean;
}) {
  const id = useId();
  return (
    <label className="admin-check" htmlFor={id}>
      <input id={id} name={name} type="checkbox" defaultChecked={initial} />
      {getNamespace(locale, 'admin')[label]}
    </label>
  );
}
export function Panel({
  locale,
  title,
  children,
}: {
  locale: Locale;
  title: Label;
  children: ReactNode;
}) {
  return (
    <section className="admin-panel">
      <h2>{getNamespace(locale, 'admin')[title]}</h2>
      {children}
    </section>
  );
}

export function AdminForm({
  locale,
  csrf,
  path,
  method = 'POST',
  build,
  children,
  submit = 'save',
  idempotent = false,
  danger = false,
  onSuccess,
}: FormContext & {
  path: string;
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  build: (data: FormData) => unknown;
  children?: ReactNode;
  submit?: Label;
  idempotent?: boolean;
  danger?: boolean;
  onSuccess?: (result: unknown) => void;
}) {
  const m = getNamespace(locale, 'admin');
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const summary = useRef<HTMLDivElement>(null);
  const dialogError = useRef<HTMLParagraphElement>(null);
  const locked = useRef(false);
  const retry = useRef<{ body: unknown; key?: string } | null>(null);
  const key = useRef<{ serialized: string; key: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [issues, setIssues] = useState<readonly string[]>([]);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<'confirm' | 'step-up' | null>(null);
  useEffect(() => {
    if (mode !== null) dialog.current?.showModal();
    else dialog.current?.close();
  }, [mode]);
  useEffect(() => {
    if (error !== null) (mode === null ? summary.current : dialogError.current)?.focus();
  }, [error, mode]);
  useEffect(() => {
    if (!dirty) return;
    const before = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const click = (event: MouseEvent) => {
      const element = event.target;
      if (!(element instanceof Element)) return;
      const anchor = element.closest('a');
      if (anchor?.href && !anchor.href.endsWith('#admin-main') && !window.confirm(m.unsaved)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', before);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', before);
      document.removeEventListener('click', click, true);
    };
  }, [dirty, m.unsaved]);
  function report(failure: unknown) {
    if (failure instanceof AdminRequestError) {
      if (failure.status === 401) {
        window.location.replace(`/${locale}/admin/sign-in`);
        return;
      }
      setRequestId(failure.requestId);
      setIssues(failure.issues.map((issue) => issue.path));
      setError(
        failure.status === 403
          ? m.forbidden
          : failure.status === 409
            ? m.conflict
            : [400, 422].includes(failure.status)
              ? m.validationError
              : m.genericError,
      );
    } else setError(m.validationError);
  }
  async function run(item: { body: unknown; key?: string }) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError(null);
    setRequestId(null);
    setIssues([]);
    setSaved(false);
    try {
      const result = await adminMutation(path, item.body, csrf, method, item.key);
      retry.current = null;
      key.current = null;
      setMode(null);
      setDirty(false);
      setSaved(true);
      onSuccess?.(result);
      router.refresh();
    } catch (failure) {
      if (failure instanceof AdminRequestError && failure.code === 'STEP_UP_REQUIRED') {
        retry.current = item;
        setMode('step-up');
      } else report(failure);
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    try {
      const body = build(new FormData(event.currentTarget));
      const serialized = JSON.stringify(body);
      if (idempotent && key.current?.serialized !== serialized)
        key.current = { serialized, key: crypto.randomUUID() };
      const item = {
        body,
        ...(idempotent && key.current !== null ? { key: key.current.key } : {}),
      };
      if (danger) {
        retry.current = item;
        setMode('confirm');
      } else void run(item);
    } catch (failure) {
      report(failure);
    }
  }
  async function confirmStepUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || retry.current === null) return;
    const item = retry.current;
    const stepUpForm = event.currentTarget;
    locked.current = true;
    setPending(true);
    setError(null);
    try {
      await adminMutation(
        '/api/bff/admin/auth/step-up',
        { code: value(new FormData(stepUpForm), 'code') },
        csrf,
      );
      stepUpForm.reset();
      locked.current = false;
      setPending(false);
      setMode(null);
      await run(item);
    } catch (failure) {
      report(failure);
      locked.current = false;
      setPending(false);
    }
  }
  function cancel() {
    if (pending) return;
    retry.current = null;
    setMode(null);
  }
  return (
    <>
      <Issues.Provider value={issues}>
        <form
          ref={form}
          onSubmit={submitForm}
          onChange={() => {
            setDirty(true);
            setSaved(false);
          }}
          className="admin-form"
          data-admin-action={path}
          aria-busy={pending}
        >
          {children}
          {error !== null && (
            <div
              ref={summary}
              role="alert"
              tabIndex={-1}
              className="admin-message admin-message-error"
            >
              <p>{error}</p>
              {requestId !== null && (
                <p>
                  {m.requestId}: <bdi dir="ltr">{requestId}</bdi>
                </p>
              )}
            </div>
          )}
          {saved && (
            <p role="status" className="admin-message">
              {m.saved}
            </p>
          )}
          <div className="admin-inline">
            <button
              className={danger ? 'admin-danger' : 'admin-primary'}
              type="submit"
              disabled={pending}
            >
              {pending ? m.pending : m[submit]}
            </button>
            {error !== null && (
              <button type="button" onClick={() => router.refresh()}>
                {m.refresh}
              </button>
            )}
          </div>
        </form>
      </Issues.Provider>
      <dialog
        ref={dialog}
        className="admin-dialog"
        onCancel={(event) => {
          event.preventDefault();
          cancel();
        }}
        aria-labelledby={heading}
      >
        <DialogContents
          locale={locale}
          heading={heading}
          mode={mode}
          pending={pending}
          error={error}
          errorRef={dialogError}
          onCancel={cancel}
          onConfirm={() => {
            const item = retry.current;
            if (item !== null) {
              setMode(null);
              void run(item);
            }
          }}
          onStepUp={(event) => void confirmStepUp(event)}
        />
      </dialog>
    </>
  );
}
function DialogContents({
  locale,
  heading,
  mode,
  pending,
  error,
  errorRef,
  onCancel,
  onConfirm,
  onStepUp,
}: {
  locale: Locale;
  heading: string;
  mode: 'confirm' | 'step-up' | null;
  pending: boolean;
  error: string | null;
  errorRef: React.RefObject<HTMLParagraphElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
  onStepUp: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const m = getNamespace(locale, 'admin');
  const id = useId();
  return (
    <>
      <h2 id={heading}>{mode === 'step-up' ? m.stepUp : m.confirm}</h2>
      <p>{mode === 'step-up' ? m.stepUpHelp : m.confirmDanger}</p>
      {error !== null && (
        <p ref={errorRef} tabIndex={-1} role="alert">
          {error}
        </p>
      )}
      {mode === 'step-up' ? (
        <form onSubmit={onStepUp} className="admin-form">
          <label htmlFor={id}>{m.totp}</label>
          <input
            id={id}
            name="code"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            required
            maxLength={6}
            autoFocus
          />
          <div className="admin-inline">
            <button type="submit" disabled={pending}>
              {pending ? m.pending : m.stepUpConfirm}
            </button>
            <button type="button" onClick={onCancel} disabled={pending}>
              {m.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="admin-inline">
          <button type="button" className="admin-danger" onClick={onConfirm} disabled={pending}>
            {m.confirm}
          </button>
          <button type="button" onClick={onCancel} disabled={pending}>
            {m.cancel}
          </button>
        </div>
      )}
    </>
  );
}
