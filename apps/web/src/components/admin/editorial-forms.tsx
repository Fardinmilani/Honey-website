'use client';
import { getNamespace, type Locale } from '@honey/i18n';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { identifier, record, text, page } from '@/lib/admin/validation';
import type { CsrfConfig } from '@/lib/admin/types';
import { type Block, type ContentKind } from '@/lib/editorial/types';
import { AdminForm, Field, value, nullable } from './admin-form';
import { ContentBlocks } from '@/components/editorial/blocks';
import { editorialImages, type EditorialImage } from '@/lib/editorial/media';
type Context = { locale: Locale; csrf: CsrfConfig };
export function ContentCreate({ locale, csrf, kind }: Context & { kind: ContentKind }) {
  const router = useRouter();
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={'/api/bff/admin/content/' + kind}
      submit="create"
      build={(d) => ({ key: value(d, 'code') })}
      onSuccess={(r) =>
        router.push(`/${locale}/admin/content/${kind}/${identifier(record(r)['id'])}`)
      }
    >
      <Field locale={locale} label="code" maxLength={80} />
    </AdminForm>
  );
}
export function ContentTransition({
  locale,
  csrf,
  kind,
  id,
  action,
}: Context & { kind: ContentKind; id: string; action: 'publish' | 'archive' }) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/content/${kind}/${id}/${action}`}
      build={() => ({})}
      submit={action}
      danger={action === 'archive'}
    />
  );
}
type EditBlock = Readonly<{ key: string; value: Block }>;
export function TranslationEditor({
  locale,
  csrf,
  kind,
  id,
  translationLocale,
  initial,
  images: initialImages,
  nextMediaCursor,
}: {
  locale: Locale;
  csrf: CsrfConfig;
  kind: ContentKind;
  id: string;
  translationLocale: Locale;
  initial: Readonly<{
    title: string;
    slug: string;
    metaTitle: string | null;
    metaDescription: string | null;
    blocks: readonly Block[];
  }>;
  images: readonly EditorialImage[];
  nextMediaCursor: string | null;
}) {
  const m = getNamespace(locale, 'editorial');
  const [images, setImages] = useState(initialImages);
  const [cursor, setCursor] = useState(nextMediaCursor);
  const [loading, setLoading] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const uid = useId();
  const [items, setItems] = useState<readonly EditBlock[]>(
    initial.blocks.map((b, i) => ({ key: uid + '-' + i, value: b })),
  );
  const [adding, setAdding] = useState<Block['type']>('paragraph');
  const [preview, setPreview] = useState(false);
  function change(key: string, b: Block) {
    setItems((old) => old.map((item) => (item.key === key ? { key, value: b } : item)));
  }
  function move(index: number, by: number) {
    setItems((old) => {
      const next = [...old];
      const a = next[index],
        b = next[index + by];
      if (a === undefined || b === undefined) return old;
      next[index] = b;
      next[index + by] = a;
      return next;
    });
  }
  async function loadImages() {
    if (cursor === null || loading) return;
    setLoading(true);
    setMediaError(false);
    try {
      const response = await fetch(
        '/api/bff/admin/media?kind=IMAGE&visibility=PUBLIC&limit=100&cursor=' +
          encodeURIComponent(cursor),
        { cache: 'no-store', credentials: 'same-origin' },
      );
      if (!response.ok) throw new Error('MEDIA_READ_FAILED');
      const raw: unknown = await response.json();
      const result = page(raw);
      setImages((old) => [
        ...old,
        ...editorialImages(result.items).filter((i) => !old.some((o) => o.id === i.id)),
      ]);
      setCursor(result.nextCursor);
    } catch {
      setMediaError(true);
    } finally {
      setLoading(false);
    }
  }
  function add() {
    if (items.length >= 60) return;
    const b: Block =
      adding === 'image'
        ? { type: 'image', mediaAssetId: images[0]?.id ?? '', alt: '' }
        : adding === 'heading'
          ? { type: 'heading', level: 2, text: '' }
          : { type: adding, text: '' };
    setItems((old) => [...old, { key: crypto.randomUUID(), value: b }]);
  }
  return (
    <AdminForm
      controlledVersion={items}
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/content/${kind}/${id}/translations`}
      method="PUT"
      build={(d) => ({
        locale: translationLocale,
        title: value(d, 'title'),
        slug: kind === 'faq' ? id : value(d, 'slug'),
        metaTitle: kind === 'faq' ? null : nullable(d, 'metaTitle'),
        metaDescription: kind === 'faq' ? null : nullable(d, 'metaDescription'),
        blocks: items.map((i) => i.value),
      })}
    >
      <div
        lang={translationLocale}
        dir={translationLocale === 'fa' ? 'rtl' : 'ltr'}
        className="admin-form"
      >
        <label>
          {kind === 'faq' ? m.question : m.title}
          <input name="title" defaultValue={initial.title} required maxLength={200} />
        </label>
        {kind !== 'faq' && (
          <>
            <label>
              {m.slug}
              <input name="slug" defaultValue={initial.slug} required maxLength={160} />
            </label>
            <label>
              {m.metaTitle}
              <input name="metaTitle" defaultValue={initial.metaTitle ?? ''} maxLength={200} />
            </label>
            <label>
              {m.metaDescription}
              <textarea
                name="metaDescription"
                defaultValue={initial.metaDescription ?? ''}
                maxLength={320}
              />
            </label>
          </>
        )}
        {cursor !== null && (
          <button type="button" disabled={loading} onClick={() => void loadImages()}>
            {loading ? m.pending : m.more}
          </button>
        )}
        {mediaError && <p role="alert">{m.error}</p>}
        <fieldset>
          <legend>{kind === 'faq' ? m.answer : m.blocks}</legend>
          {items.map((item, index) => (
            <div className="editorial-block-editor" key={item.key}>
              {item.value.type === 'image' ? (
                <>
                  <label>
                    {m.media}
                    <select
                      value={item.value.mediaAssetId}
                      required
                      onChange={(e) =>
                        change(item.key, {
                          type: 'image',
                          mediaAssetId: e.target.value,
                          alt: item.value.type === 'image' ? item.value.alt : '',
                        })
                      }
                    >
                      {images.length === 0 && <option value="">{m.noMedia}</option>}
                      {images.map((image) => (
                        <option key={image.id} value={image.id}>
                          {image.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {m.alt}
                    <input
                      value={item.value.alt}
                      required
                      maxLength={300}
                      onChange={(e) =>
                        change(item.key, {
                          type: 'image',
                          mediaAssetId: item.value.type === 'image' ? item.value.mediaAssetId : '',
                          alt: e.target.value,
                        })
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    {m[item.value.type]}
                    <textarea
                      value={item.value.text}
                      required
                      maxLength={item.value.type === 'heading' ? 200 : 5000}
                      onChange={(e) => {
                        if (item.value.type !== 'image')
                          change(item.key, { ...item.value, text: e.target.value });
                      }}
                    />
                  </label>
                  {item.value.type === 'heading' && (
                    <label>
                      {m.level}
                      <select
                        value={item.value.level}
                        onChange={(e) => {
                          if (item.value.type === 'heading')
                            change(item.key, {
                              ...item.value,
                              level: e.target.value === '3' ? 3 : 2,
                            });
                        }}
                      >
                        <option value="2">2</option>
                        <option value="3">3</option>
                      </select>
                    </label>
                  )}
                </>
              )}
              {kind !== 'faq' && (
                <div className="admin-inline">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={m.up + ' ' + (index + 1)}
                  >
                    {m.up}
                  </button>
                  <button
                    type="button"
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={m.down + ' ' + (index + 1)}
                  >
                    {m.down}
                  </button>
                  <button
                    type="button"
                    disabled={items.length <= 1}
                    onClick={() => setItems((old) => old.filter((i) => i.key !== item.key))}
                    aria-label={m.remove + ' ' + (index + 1)}
                  >
                    {m.remove}
                  </button>
                </div>
              )}
            </div>
          ))}
        </fieldset>
        {kind !== 'faq' && (
          <div className="admin-inline">
            <label>
              {m.add}
              <select
                value={adding}
                onChange={(e) => {
                  const t = e.target.value;
                  if (t === 'heading' || t === 'paragraph' || t === 'quote' || t === 'image')
                    setAdding(t);
                }}
              >
                {(['paragraph', 'heading', 'quote', 'image'] as const).map((type) => (
                  <option
                    key={type}
                    value={type}
                    disabled={type === 'image' && images.length === 0}
                  >
                    {m[type]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={items.length >= 60 || (adding === 'image' && images.length === 0)}
              onClick={add}
            >
              {m.add}
            </button>
          </div>
        )}
        <button type="button" aria-expanded={preview} onClick={() => setPreview(!preview)}>
          {m.preview}
        </button>
        {preview && <ContentBlocks blocks={items.map((i) => i.value)} media={images} />}
      </div>
    </AdminForm>
  );
}
export function ModerationAction({
  locale,
  csrf,
  id,
  action,
}: Context & { id: string; action: 'approve' | 'reject' }) {
  const m = getNamespace(locale, 'editorial');
  return (
    <div>
      <h3>{m[action]}</h3>
      <AdminForm
        locale={locale}
        csrf={csrf}
        path={`/api/bff/admin/reviews/${id}/${action}`}
        build={() => ({})}
        submit="confirm"
        danger={action === 'reject'}
      />
    </div>
  );
}
export function TemplateEditor({
  locale,
  csrf,
  initial,
  write,
  allowedVariables,
  complete,
}: Context & {
  write: boolean;
  allowedVariables: readonly string[];
  complete: boolean;
  initial: Readonly<{
    code: string;
    locale: string;
    channel: 'EMAIL' | 'SMS';
    subject: string | null;
    body: string;
  }>;
}) {
  const m = getNamespace(locale, 'editorial');
  const [preview, setPreview] = useState<Readonly<{
    subject: string | null;
    text: string;
    allowedVariables: readonly string[];
  }> | null>(null);
  const fields = (
    <>
      <label>
        {m.subject}
        <input
          name="subject"
          defaultValue={initial.subject ?? ''}
          maxLength={200}
          required={initial.channel === 'EMAIL'}
          disabled={initial.channel === 'SMS'}
        />
      </label>
      <label>
        {m.body}
        <textarea
          name="body"
          defaultValue={initial.body}
          maxLength={initial.channel === 'SMS' ? 1000 : 12000}
          required
        />
      </label>
    </>
  );
  const build = (d: FormData) => ({
    ...initial,
    subject: initial.channel === 'SMS' ? null : value(d, 'subject'),
    body: value(d, 'body'),
  });
  return (
    <section className="admin-panel">
      <h2>
        <bdi>{initial.code}</bdi> · <bdi>{initial.locale}</bdi> · <bdi>{initial.channel}</bdi>
      </h2>
      <p>{complete ? m.complete : m.incomplete}</p>
      <p>
        {m.allowedVariables}:{' '}
        {allowedVariables.map((v) => (
          <bdi key={v}>{'{{' + v + '}} '}</bdi>
        ))}
      </p>
      {initial.channel === 'SMS' && <p>{m.smsDisabled}</p>}
      {write ? (
        <AdminForm
          locale={locale}
          csrf={csrf}
          path="/api/bff/admin/notifications/templates"
          method="PUT"
          build={build}
        >
          {fields}
        </AdminForm>
      ) : (
        <>
          <p>{initial.subject}</p>
          <pre className="editorial-preview">{initial.body}</pre>
        </>
      )}
      <details>
        <summary>{m.preview}</summary>
        <AdminForm
          locale={locale}
          csrf={csrf}
          path="/api/bff/admin/notifications/templates/preview"
          build={build}
          submit="view"
          onSuccess={(r) => {
            const row = record(r),
              variables = row['allowedVariables'];
            if (!Array.isArray(variables) || variables.length > 10)
              throw new Error('TEMPLATE_RESPONSE_INVALID');
            setPreview({
              subject: row['subject'] === null ? null : text(row['subject']),
              text: text(row['text']),
              allowedVariables: variables.map(text),
            });
          }}
        >
          {fields}
        </AdminForm>
        {preview && (
          <div role="status">
            <h3>{preview.subject}</h3>
            <pre
              className="editorial-preview"
              lang={initial.locale}
              dir={initial.locale === 'fa' ? 'rtl' : 'ltr'}
            >
              {preview.text}
            </pre>
            <p>
              {m.allowedVariables}:{' '}
              {preview.allowedVariables.map((v) => (
                <bdi key={v}>{'{{' + v + '}} '}</bdi>
              ))}
            </p>
          </div>
        )}
      </details>
    </section>
  );
}
