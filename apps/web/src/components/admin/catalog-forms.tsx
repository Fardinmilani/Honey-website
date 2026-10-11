'use client';
import { useRouter } from 'next/navigation';
import { getNamespace } from '@honey/i18n';
import {
  identifier,
  number,
  optionalText,
  record,
  records,
  text,
  type AdminRecord,
} from '@/lib/admin/validation';
import {
  AdminForm,
  Check,
  Field,
  checked,
  integer,
  list,
  nullable,
  value,
  type FormContext,
} from './admin-form';
export function ProductForm({ locale, csrf, row }: FormContext & { row?: AdminRecord }) {
  const router = useRouter();
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={
        row === undefined
          ? '/api/bff/admin/catalog/products'
          : `/api/bff/admin/catalog/products/${identifier(row['id'])}`
      }
      method={row === undefined ? 'POST' : 'PUT'}
      submit={row === undefined ? 'create' : 'save'}
      onSuccess={
        row === undefined
          ? (result) =>
              router.push(`/${locale}/admin/catalog/products/${identifier(record(result)['id'])}`)
          : () => undefined
      }
      build={(data) => ({
        sku: nullable(data, 'sku'),
        brandLine: nullable(data, 'brandLine'),
        honeyVarietal: nullable(data, 'honeyVarietal'),
        floralSources: list(data, 'floralSources'),
        originRegion: nullable(data, 'originRegion'),
        originAltitudeBand: nullable(data, 'originAltitudeBand'),
        harvestSeason: nullable(data, 'harvestSeason'),
        sourcingType: value(data, 'sourcingType'),
        apiaryId: nullable(data, 'apiaryId'),
        sortWeight: integer(data, 'sortWeight'),
      })}
    >
      <div className="admin-grid">
        {(
          [
            'sku',
            'brandLine',
            'honeyVarietal',
            'originRegion',
            'originAltitudeBand',
            'harvestSeason',
            'apiaryId',
          ] as const
        ).map((label) => (
          <Field
            key={label}
            locale={locale}
            label={label}
            initial={optionalText(row?.[label])}
            required={false}
          />
        ))}
        <Field
          locale={locale}
          label="floralSources"
          initial={row === undefined ? '' : stringList(row['floralSources'])}
          required={false}
          multiline
          hint="listHelp"
        />
        <Field
          locale={locale}
          label="sourcingType"
          options={['OWN_PRODUCTION', 'SELECTED_SUPPLIER']}
          initial={row === undefined ? 'OWN_PRODUCTION' : text(row['sourcingType'])}
        />
        <Field
          locale={locale}
          label="sortWeight"
          type="number"
          initial={row === undefined ? 0 : number(row['sortWeight'])}
        />
      </div>
    </AdminForm>
  );
}
function stringList(raw: unknown): string {
  if (!Array.isArray(raw)) throw new Error('ADMIN_RESPONSE_INVALID');
  return raw.map(text).join('\n');
}
export function ProductTranslationForms({
  locale,
  csrf,
  product,
}: FormContext & { product: AdminRecord }) {
  const m = getNamespace(locale, 'admin');
  const translations = records(product['translations']);
  return (
    <div className="admin-grid">
      {(['fa', 'en'] as const).map((language) => {
        const row = translations.find((entry) => entry['locale'] === language);
        const complete =
          row !== undefined &&
          optionalText(row['name']) !== null &&
          optionalText(row['slug']) !== null;
        return (
          <section key={language}>
            <h3>
              {language === 'fa' ? m.faTranslation : m.enTranslation}{' '}
              <span className="admin-badge">{complete ? m.complete : m.incomplete}</span>
            </h3>
            <AdminForm
              locale={locale}
              csrf={csrf}
              path={`/api/bff/admin/catalog/products/${identifier(product['id'])}/translations`}
              method="PUT"
              build={(data) => ({
                locale: language,
                name: value(data, 'name'),
                slug: value(data, 'slug'),
                shortDescription: nullable(data, 'shortDescription'),
                description: nullable(data, 'description'),
                tastingNotes: nullable(data, 'tastingNotes'),
                pairingSuggestions: nullable(data, 'pairingSuggestions'),
                storyHtml: nullable(data, 'storyHtml'),
                metaTitle: nullable(data, 'metaTitle'),
                metaDescription: nullable(data, 'metaDescription'),
              })}
            >
              {(
                [
                  'name',
                  'slug',
                  'shortDescription',
                  'description',
                  'tastingNotes',
                  'pairingSuggestions',
                  'storyHtml',
                  'metaTitle',
                  'metaDescription',
                ] as const
              ).map((label) => (
                <Field
                  key={label}
                  locale={locale}
                  label={label}
                  initial={optionalText(row?.[label])}
                  required={label === 'name' || label === 'slug'}
                  multiline={[
                    'description',
                    'tastingNotes',
                    'pairingSuggestions',
                    'storyHtml',
                  ].includes(label)}
                  maxLength={
                    label === 'storyHtml'
                      ? 20000
                      : label === 'metaTitle'
                        ? 70
                        : label === 'metaDescription'
                          ? 170
                          : label === 'name'
                            ? 200
                            : label === 'slug'
                              ? 160
                              : 5000
                  }
                />
              ))}
            </AdminForm>
          </section>
        );
      })}
    </div>
  );
}
export function VariantForm({
  locale,
  csrf,
  productId,
  row,
}: FormContext & { productId: string; row?: AdminRecord }) {
  const dimensions = row?.['dimensionsMm'];
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/catalog/products/${productId}/variants${row === undefined ? '' : `/${identifier(row['id'])}`}`}
      method={row === undefined ? 'POST' : 'PUT'}
      submit={row === undefined ? 'create' : 'save'}
      build={(data) => ({
        sku: value(data, 'sku'),
        netWeightGrams: integer(data, 'netWeightGrams'),
        jarSizeLabelKey: value(data, 'jarSizeLabelKey'),
        packagingTypeKey: value(data, 'packagingTypeKey'),
        barcode: nullable(data, 'barcode'),
        weightGramsShipping: integer(data, 'weightGramsShipping'),
        dimensionsMm: ['length', 'width', 'height'].map((name) => integer(data, name)),
        position: integer(data, 'position'),
      })}
    >
      <div className="admin-grid">
        {(['sku', 'jarSizeLabelKey', 'packagingTypeKey', 'barcode'] as const).map((label) => (
          <Field
            key={label}
            locale={locale}
            label={label}
            initial={optionalText(row?.[label])}
            required={label !== 'barcode'}
          />
        ))}
        {(['netWeightGrams', 'weightGramsShipping', 'position'] as const).map((label) => (
          <Field
            key={label}
            locale={locale}
            label={label}
            type="number"
            min={label === 'position' ? 0 : 1}
            initial={row === undefined ? '' : number(row[label])}
          />
        ))}
        {(['length', 'width', 'height'] as const).map((label, index) => (
          <Field
            key={label}
            locale={locale}
            label={label}
            type="number"
            min={1}
            max={10000}
            initial={Array.isArray(dimensions) ? number(dimensions[index]) : ''}
          />
        ))}
      </div>
    </AdminForm>
  );
}
export function VariantTranslations({
  locale,
  csrf,
  productId,
  variant,
}: FormContext & { productId: string; variant: AdminRecord }) {
  const m = getNamespace(locale, 'admin');
  const translations = records(variant['translations']);
  return (
    <div className="admin-grid">
      {(['fa', 'en'] as const).map((language) => (
        <AdminForm
          key={language}
          locale={locale}
          csrf={csrf}
          path={`/api/bff/admin/catalog/products/${productId}/variants/${identifier(variant['id'])}/translations`}
          method="PUT"
          build={(data) => ({ locale: language, name: value(data, 'name') })}
        >
          <h3>{language === 'fa' ? m.faTranslation : m.enTranslation}</h3>
          <Field
            locale={locale}
            label="name"
            initial={optionalText(
              translations.find((entry) => entry['locale'] === language)?.['name'],
            )}
            maxLength={160}
          />
        </AdminForm>
      ))}
    </div>
  );
}
export function CatalogTransition({
  locale,
  csrf,
  path,
  action,
}: FormContext & { path: string; action: 'publish' | 'archive' | 'default' }) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/catalog/${path}/${action}`}
      build={() => ({})}
      danger
      submit={action === 'default' ? 'defaultVariant' : action}
    />
  );
}
export function ProductAssignments({
  locale,
  csrf,
  product,
}: FormContext & { product: AdminRecord }) {
  const m = getNamespace(locale, 'admin');
  const id = identifier(product['id']);
  return (
    <>
      <div className="admin-grid">
        <AdminForm
          locale={locale}
          csrf={csrf}
          path={`/api/bff/admin/catalog/products/${id}/categories`}
          build={(data) => ({
            categoryId: value(data, 'categoryId'),
            primary: checked(data, 'primaryCategory'),
          })}
          submit="attach"
        >
          <Field locale={locale} label="categoryId" />
          <Check locale={locale} label="primaryCategory" />
        </AdminForm>
        <AdminForm
          locale={locale}
          csrf={csrf}
          path={`/api/bff/admin/catalog/products/${id}/collections`}
          build={(data) => ({
            collectionId: value(data, 'collectionId'),
            position: integer(data, 'position'),
          })}
          submit="attach"
        >
          <Field locale={locale} label="collectionId" />
          <Field locale={locale} label="position" type="number" min={0} />
        </AdminForm>
      </div>
      {(['categories', 'collections'] as const).map((relation) => (
        <section key={relation}>
          <h3>{m[relation]}</h3>
          {records(product[relation]).map((row) => (
            <div key={identifier(row['id'])} className="admin-panel">
              <bdi>{identifier(row['id'])}</bdi>
              <AdminForm
                locale={locale}
                csrf={csrf}
                path={`/api/bff/admin/catalog/products/${id}/${relation}/${identifier(row['id'])}`}
                method="DELETE"
                build={() => ({})}
                danger
                submit="detach"
              />
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
export function ProductMediaForm({
  locale,
  csrf,
  productId,
  row,
}: FormContext & { productId: string; row?: AdminRecord }) {
  const alt: AdminRecord = row === undefined ? {} : record(row['altTextByLocale']);
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/catalog/products/${productId}/media${row === undefined ? '' : `/${identifier(row['id'])}`}`}
      method={row === undefined ? 'POST' : 'PATCH'}
      submit={row === undefined ? 'attach' : 'save'}
      build={(data) => ({
        ...(row === undefined ? { mediaAssetId: value(data, 'mediaAssetId') } : {}),
        variantId: nullable(data, 'variantId'),
        role: value(data, 'role'),
        position: integer(data, 'position'),
        altTextByLocale: { fa: value(data, 'fa'), en: value(data, 'en') },
      })}
    >
      <div className="admin-grid">
        {row === undefined && <Field locale={locale} label="mediaAssetId" />}
        <Field
          locale={locale}
          label="variantId"
          required={false}
          initial={optionalText(row?.['variantId'])}
        />
        <Field
          locale={locale}
          label="role"
          options={['GALLERY', 'THUMBNAIL', 'LIFESTYLE', 'VIDEO']}
          initial={row === undefined ? 'GALLERY' : text(row['role'])}
        />
        <Field
          locale={locale}
          label="position"
          type="number"
          min={0}
          initial={row === undefined ? 0 : number(row['position'])}
        />
        <Field
          locale={locale}
          label="faTranslation"
          name="fa"
          maxLength={300}
          initial={optionalText(alt['fa'])}
        />
        <Field
          locale={locale}
          label="enTranslation"
          name="en"
          maxLength={300}
          initial={optionalText(alt['en'])}
        />
      </div>
    </AdminForm>
  );
}
export function MediaDetach({
  locale,
  csrf,
  productId,
  attachmentId,
}: FormContext & { productId: string; attachmentId: string }) {
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/catalog/products/${productId}/media/${attachmentId}`}
      method="DELETE"
      build={() => ({})}
      danger
      submit="detach"
    />
  );
}
export function TaxonomyCreate({
  locale,
  csrf,
  kind,
}: FormContext & { kind: 'categories' | 'collections' }) {
  const router = useRouter();
  return (
    <AdminForm
      locale={locale}
      csrf={csrf}
      path={`/api/bff/admin/catalog/${kind}`}
      submit="create"
      build={(data) => ({
        sortWeight: integer(data, 'sortWeight'),
        ...(kind === 'categories' ? { parentId: nullable(data, 'parentId') } : {}),
      })}
      onSuccess={(result) =>
        router.push(`/${locale}/admin/catalog?view=${kind}&id=${identifier(record(result)['id'])}`)
      }
    >
      {kind === 'categories' && <Field locale={locale} label="parentId" required={false} />}
      <Field locale={locale} label="sortWeight" type="number" initial={0} />
    </AdminForm>
  );
}
export function TaxonomyEdit({
  locale,
  csrf,
  kind,
  row,
}: FormContext & { kind: 'categories' | 'collections'; row: AdminRecord }) {
  const m = getNamespace(locale, 'admin');
  const id = identifier(row['id']);
  const translations = records(row['translations']);
  return (
    <>
      <AdminForm
        locale={locale}
        csrf={csrf}
        path={`/api/bff/admin/catalog/${kind}/${id}`}
        method="PUT"
        build={(data) => ({ sortWeight: integer(data, 'sortWeight') })}
      >
        <Field
          locale={locale}
          label="sortWeight"
          type="number"
          initial={number(row['sortWeight'])}
        />
      </AdminForm>
      {kind === 'categories' && (
        <AdminForm
          locale={locale}
          csrf={csrf}
          path={`/api/bff/admin/catalog/categories/${id}/move`}
          danger
          submit="move"
          build={(data) => ({ parentId: nullable(data, 'parentId') })}
        >
          <Field
            locale={locale}
            label="parentId"
            required={false}
            initial={optionalText(row['parentId'])}
          />
        </AdminForm>
      )}
      <div className="admin-grid">
        {(['fa', 'en'] as const).map((language) => {
          const source = translations.find((entry) => entry['locale'] === language);
          return (
            <AdminForm
              key={language}
              locale={locale}
              csrf={csrf}
              path={`/api/bff/admin/catalog/${kind}/${id}/translations`}
              method="PUT"
              build={(data) => ({
                locale: language,
                name: value(data, 'name'),
                slug: value(data, 'slug'),
                description: nullable(data, 'description'),
                metaTitle: nullable(data, 'metaTitle'),
                metaDescription: nullable(data, 'metaDescription'),
              })}
            >
              <h3>
                {language === 'fa' ? m.faTranslation : m.enTranslation} ·{' '}
                {source === undefined ? m.incomplete : m.complete}
              </h3>
              {(['name', 'slug', 'description', 'metaTitle', 'metaDescription'] as const).map(
                (label) => (
                  <Field
                    key={label}
                    locale={locale}
                    label={label}
                    initial={optionalText(source?.[label])}
                    required={label === 'name' || label === 'slug'}
                    multiline={label === 'description'}
                    maxLength={
                      label === 'metaTitle'
                        ? 70
                        : label === 'metaDescription'
                          ? 170
                          : label === 'description'
                            ? 2000
                            : 160
                    }
                  />
                ),
              )}
            </AdminForm>
          );
        })}
      </div>
    </>
  );
}
