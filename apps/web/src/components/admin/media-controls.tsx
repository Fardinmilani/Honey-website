'use client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { getNamespace } from '@honey/i18n';
import { adminMutation, AdminRequestError } from '@/lib/admin/client';
import { identifier, optionalText, record, text, type AdminRecord } from '@/lib/admin/validation';
import { AdminForm, Field, value, type FormContext } from './admin-form';

function safeMediaUrl(raw: unknown, origin: string): string {
  const url = new URL(text(raw));
  if (
    url.origin !== origin ||
    url.username !== '' ||
    url.password !== '' ||
    !['http:', 'https:'].includes(url.protocol)
  )
    throw new Error('ADMIN_MEDIA_URL_INVALID');
  return url.href;
}
export function MediaUpload({
  locale,
  csrf,
  uploadOrigin,
  limits,
}: FormContext & { uploadOrigin: string; limits: { image: number; video: number } }) {
  const m = getNamespace(locale, 'admin');
  const router = useRouter();
  const locked = useRef(false);
  const [pending, setPending] = useState<'uploading' | 'processing' | null>(null);
  const [error, setError] = useState<'genericError' | 'uploadInvalid' | null>(null);
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setError('uploadInvalid');
      return;
    }
    const image = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type);
    const video = ['video/mp4', 'video/webm'].includes(file.type);
    if ((!image && !video) || file.size > (image ? limits.image : limits.video)) {
      setError('uploadInvalid');
      return;
    }
    locked.current = true;
    setPending('uploading');
    setError(null);
    setSaved(false);
    try {
      const intent = record(
        await adminMutation(
          '/api/bff/admin/media/upload-intents',
          {
            declaredMimeType: file.type,
            declaredBytes: file.size,
            visibility: value(data, 'visibility'),
            altTextByLocale: { fa: value(data, 'fa'), en: value(data, 'en') },
          },
          csrf,
        ),
      );
      const upload = record(intent['upload']);
      if (upload['method'] !== 'POST') throw new Error('ADMIN_MEDIA_RESPONSE_INVALID');
      const payload = new FormData();
      for (const [key, entry] of Object.entries(record(upload['fields'])))
        payload.append(key, text(entry));
      payload.append('file', file);
      const response = await fetch(safeMediaUrl(upload['url'], uploadOrigin), {
        method: 'POST',
        body: payload,
        credentials: 'omit',
        mode: 'cors',
      });
      if (!response.ok) throw new Error('ADMIN_MEDIA_UPLOAD_FAILED');
      setPending('processing');
      await adminMutation(
        `/api/bff/admin/media/upload-intents/${identifier(intent['uploadId'])}/complete`,
        {},
        csrf,
      );
      form.reset();
      setSaved(true);
      router.refresh();
    } catch (failure) {
      if (failure instanceof AdminRequestError && failure.status === 401) {
        window.location.replace(`/${locale}/admin/sign-in`);
        return;
      }
      setError('genericError');
    } finally {
      locked.current = false;
      setPending(null);
    }
  }
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="admin-form"
      data-admin-action="media-upload"
      aria-busy={pending !== null}
    >
      <div className="admin-grid">
        <div className="admin-field">
          <label htmlFor="admin-upload-file">{m.file}</label>
          <input
            id="admin-upload-file"
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
            required
          />
          <p className="admin-help">{m.fileHelp}</p>
        </div>
        <Field locale={locale} label="visibility" options={['PUBLIC', 'PRIVATE']} />
        <Field locale={locale} label="faTranslation" name="fa" maxLength={300} />
        <Field locale={locale} label="enTranslation" name="en" maxLength={300} />
      </div>
      {error && (
        <p className="admin-message admin-message-error" role="alert">
          {m[error]}
        </p>
      )}
      {saved && <p role="status">{m.saved}</p>}
      <button className="admin-primary" type="submit" disabled={pending !== null}>
        {pending === null ? m.upload : m[pending]}
      </button>
    </form>
  );
}
export function MediaCard({
  locale,
  csrf,
  row,
  mediaOrigin,
  privateOrigin,
}: FormContext & { row: AdminRecord; mediaOrigin: string; privateOrigin: string }) {
  const m = getNamespace(locale, 'admin');
  const id = identifier(row['id']);
  const [privateUrl, setPrivateUrl] = useState<string | null>(null);
  const url = row['url'] === null ? null : safeMediaUrl(row['url'], mediaOrigin);
  const alt = record(row['altTextByLocale']);
  return (
    <article className="admin-panel">
      {url !== null &&
        (row['kind'] === 'IMAGE' ? (
          <Image
            unoptimized
            src={url}
            alt={optionalText(alt[locale]) ?? ''}
            width={480}
            height={360}
            className="admin-media-preview"
          />
        ) : (
          <video
            src={url}
            controls
            preload="metadata"
            className="admin-media-preview"
            aria-label={optionalText(alt[locale]) ?? m.preview}
          />
        ))}
      <p>
        <bdi dir="ltr">{id}</bdi>
      </p>
      <p>
        {m.kind}: {text(row['kind'])} · {m.bytes}: <bdi>{String(row['bytes'])}</bdi>
      </p>
      {url === null && (
        <>
          <p>{m.privateMedia}</p>
          <AdminForm
            locale={locale}
            csrf={csrf}
            path={`/api/bff/admin/media/${id}/private-url`}
            build={() => ({})}
            submit="privateLink"
            onSuccess={(result) =>
              setPrivateUrl(safeMediaUrl(record(result)['url'], privateOrigin))
            }
          />
          {privateUrl !== null && (
            <a
              className="admin-button"
              href={privateUrl}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              {m.preview}
            </a>
          )}
        </>
      )}
      <details>
        <summary>{m.altText}</summary>
        <AdminForm
          locale={locale}
          csrf={csrf}
          path={`/api/bff/admin/media/${id}/alt-text`}
          method="PATCH"
          build={(data) => ({ altTextByLocale: { fa: value(data, 'fa'), en: value(data, 'en') } })}
        >
          <Field
            locale={locale}
            label="faTranslation"
            name="fa"
            initial={optionalText(alt['fa'])}
            maxLength={300}
          />
          <Field
            locale={locale}
            label="enTranslation"
            name="en"
            initial={optionalText(alt['en'])}
            maxLength={300}
          />
        </AdminForm>
      </details>
      <p className="admin-help">{m.deleteMediaHelp}</p>
      <AdminForm
        locale={locale}
        csrf={csrf}
        path={`/api/bff/admin/media/${id}`}
        method="DELETE"
        build={() => ({})}
        danger
        submit="delete"
      />
    </article>
  );
}
