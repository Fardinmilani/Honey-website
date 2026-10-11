import { getNamespace } from '@honey/i18n';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { DataTable, Facts } from '@/components/admin/admin-data';
import {
  CatalogTransition,
  MediaDetach,
  ProductAssignments,
  ProductForm,
  ProductMediaForm,
  ProductTranslationForms,
  VariantForm,
  VariantTranslations,
} from '@/components/admin/catalog-forms';
import { adminLocale, adminRead, adminUser, csrfConfig } from '@/lib/admin/server';
import { identifier, record, records, text } from '@/lib/admin/validation';
export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const values = await params;
  const locale = adminLocale(values.locale);
  const id = identifier(values.id);
  const user = await adminUser(locale);
  if (!user.permissions.includes('catalog:read')) return <AdminDenied locale={locale} />;
  const product = record(await adminRead(locale, `/v1/admin/catalog/products/${id}`));
  const variants = records(product['variants']).filter((row) => row['deletedAt'] === null);
  const media = records(product['media']);
  const translations = records(product['translations']);
  const m = getNamespace(locale, 'admin');
  const write = user.permissions.includes('catalog:write');
  const publish = user.permissions.includes('catalog:publish');
  return (
    <AdminPage locale={locale} title="products">
      <a className="admin-button" href={`/${locale}/admin/catalog`}>
        {m.catalog}
      </a>
      <section className="admin-panel">
        <Facts
          locale={locale}
          row={product}
          fields={[
            { key: 'id', label: 'identifier' },
            { key: 'status', label: 'status' },
            { key: 'primaryCategoryId', label: 'primaryCategory' },
            { key: 'defaultVariantId', label: 'defaultVariant' },
          ]}
        />
        {write && <ProductForm locale={locale} csrf={csrfConfig()} row={product} />}
        {!write && (
          <Facts
            locale={locale}
            row={product}
            fields={[
              { key: 'sku', label: 'sku' },
              { key: 'brandLine', label: 'brandLine' },
              { key: 'honeyVarietal', label: 'honeyVarietal' },
              { key: 'floralSources', label: 'floralSources', format: 'list' },
              { key: 'originRegion', label: 'originRegion' },
              { key: 'originAltitudeBand', label: 'originAltitudeBand' },
              { key: 'harvestSeason', label: 'harvestSeason' },
              { key: 'sourcingType', label: 'sourcingType', format: 'state' },
              { key: 'apiaryId', label: 'apiaryId' },
              { key: 'sortWeight', label: 'sortWeight' },
            ]}
          />
        )}
      </section>
      <section className="admin-panel">
        <h2>{m.translations}</h2>
        <p className="admin-help">{m.translationHelp}</p>
        <p className="admin-help">{m.publicationHelp}</p>
        {(['fa', 'en'] as const).map((language) => {
          const translation = translations.find((row) => row['locale'] === language);
          return (
            <p key={language}>
              {language === 'fa' ? m.faTranslation : m.enTranslation}:{' '}
              {translation === undefined ? `${m.incomplete} · ${m.name}, ${m.slug}` : m.complete}
            </p>
          );
        })}
        {write && <ProductTranslationForms locale={locale} csrf={csrfConfig()} product={product} />}
        {!write &&
          translations.map((row) => (
            <section key={text(row['locale'])}>
              <h3>{row['locale'] === 'fa' ? m.faTranslation : m.enTranslation}</h3>
              <Facts
                locale={locale}
                row={row}
                fields={[
                  { key: 'name', label: 'name' },
                  { key: 'slug', label: 'slug' },
                  { key: 'shortDescription', label: 'shortDescription' },
                  { key: 'description', label: 'description' },
                  { key: 'tastingNotes', label: 'tastingNotes' },
                  { key: 'pairingSuggestions', label: 'pairingSuggestions' },
                  { key: 'storyHtml', label: 'storyHtml' },
                  { key: 'metaTitle', label: 'metaTitle' },
                  { key: 'metaDescription', label: 'metaDescription' },
                ]}
              />
            </section>
          ))}
      </section>
      {publish && product['status'] !== 'ARCHIVED' && (
        <section className="admin-panel">
          <div className="admin-grid">
            <CatalogTransition
              locale={locale}
              csrf={csrfConfig()}
              path={`products/${id}`}
              action="publish"
            />
            <CatalogTransition
              locale={locale}
              csrf={csrfConfig()}
              path={`products/${id}`}
              action="archive"
            />
          </div>
        </section>
      )}
      <section className="admin-panel">
        <h2>{m.variants}</h2>
        <DataTable
          locale={locale}
          caption="variants"
          items={variants}
          columns={[
            { key: 'id', label: 'identifier' },
            { key: 'sku', label: 'sku' },
            { key: 'status', label: 'status', format: 'state' },
            { key: 'netWeightGrams', label: 'netWeightGrams' },
            { key: 'isDefault', label: 'isDefault', format: 'boolean' },
          ]}
        />
        {write && (
          <details>
            <summary>{m.create}</summary>
            <VariantForm locale={locale} csrf={csrfConfig()} productId={id} />
          </details>
        )}
        {variants.map((variant) => (
          <details key={identifier(variant['id'])}>
            <summary>
              {m.details}: {text(variant['sku'])}
            </summary>
            {write && (
              <>
                <VariantForm locale={locale} csrf={csrfConfig()} productId={id} row={variant} />
                <VariantTranslations
                  locale={locale}
                  csrf={csrfConfig()}
                  productId={id}
                  variant={variant}
                />
                <CatalogTransition
                  locale={locale}
                  csrf={csrfConfig()}
                  path={`products/${id}/variants/${identifier(variant['id'])}`}
                  action="default"
                />
              </>
            )}
            {!write && (
              <>
                <Facts
                  locale={locale}
                  row={variant}
                  fields={[
                    { key: 'sku', label: 'sku' },
                    { key: 'netWeightGrams', label: 'netWeightGrams' },
                    { key: 'jarSizeLabelKey', label: 'jarSizeLabelKey' },
                    { key: 'packagingTypeKey', label: 'packagingTypeKey' },
                    { key: 'barcode', label: 'barcode' },
                    { key: 'weightGramsShipping', label: 'weightGramsShipping' },
                    { key: 'position', label: 'position' },
                  ]}
                />
                <DataTable
                  locale={locale}
                  caption="translations"
                  items={records(variant['translations'])}
                  columns={[
                    { key: 'locale', label: 'translations' },
                    { key: 'name', label: 'name' },
                  ]}
                />
              </>
            )}
            {publish && variant['status'] !== 'ARCHIVED' && (
              <div className="admin-grid">
                <CatalogTransition
                  locale={locale}
                  csrf={csrfConfig()}
                  path={`products/${id}/variants/${identifier(variant['id'])}`}
                  action="publish"
                />
                <CatalogTransition
                  locale={locale}
                  csrf={csrfConfig()}
                  path={`products/${id}/variants/${identifier(variant['id'])}`}
                  action="archive"
                />
              </div>
            )}
          </details>
        ))}
      </section>
      {write && (
        <section className="admin-panel">
          <h2>
            {m.categories} / {m.collections}
          </h2>
          <ProductAssignments locale={locale} csrf={csrfConfig()} product={product} />
        </section>
      )}
      <section className="admin-panel">
        <h2>{m.media}</h2>
        <DataTable
          locale={locale}
          caption="media"
          items={media}
          columns={[
            { key: 'mediaAssetId', label: 'mediaAssetId' },
            { key: 'variantId', label: 'variantId' },
            { key: 'role', label: 'role', format: 'state' },
            { key: 'position', label: 'position' },
          ]}
        />
        {write && (
          <>
            <details>
              <summary>{m.attach}</summary>
              <ProductMediaForm locale={locale} csrf={csrfConfig()} productId={id} />
            </details>
            {media.map((row) => (
              <details key={identifier(row['id'])}>
                <summary>
                  {m.edit}: <bdi>{identifier(row['mediaAssetId'])}</bdi>
                </summary>
                <ProductMediaForm locale={locale} csrf={csrfConfig()} productId={id} row={row} />
                <MediaDetach
                  locale={locale}
                  csrf={csrfConfig()}
                  productId={id}
                  attachmentId={identifier(row['id'])}
                />
              </details>
            ))}
          </>
        )}
      </section>
    </AdminPage>
  );
}
