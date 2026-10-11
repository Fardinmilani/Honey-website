import { getNamespace } from '@honey/i18n';
import { AdminDenied, AdminPage } from '@/components/admin/admin-page';
import { adminPageData, Filters, Pagination } from '@/components/admin/admin-data';
import { MediaCard, MediaUpload } from '@/components/admin/media-controls';
import {
  adminLocale,
  adminQuery,
  adminRead,
  adminUser,
  adminUploadLimits,
  csrfConfig,
  type AdminSearchParams,
} from '@/lib/admin/server';
import { adminMediaOrigins } from '@/lib/security-headers';
import { identifier } from '@/lib/admin/validation';
export default async function MediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const locale = adminLocale((await params).locale);
  const user = await adminUser(locale);
  if (!user.permissions.includes('content:write')) return <AdminDenied locale={locale} />;
  const query = adminQuery(await searchParams, [
    'cursor',
    'limit',
    'kind',
    'visibility',
    'assetId',
  ]);
  const result = adminPageData(await adminRead(locale, '/v1/admin/media', query));
  const { upload, media } = adminMediaOrigins();
  if (upload === undefined || media === undefined)
    throw new Error('ADMIN_MEDIA_CONFIGURATION_MISSING');
  const path = `/${locale}/admin/media`;
  const m = getNamespace(locale, 'admin');
  return (
    <AdminPage locale={locale} title="media" description="mediaDescription">
      <section className="admin-panel">
        <h2>{m.upload}</h2>
        <MediaUpload
          locale={locale}
          csrf={csrfConfig()}
          uploadOrigin={upload}
          limits={adminUploadLimits()}
        />
      </section>
      <Filters
        locale={locale}
        path={path}
        query={query}
        fields={[
          { key: 'kind', label: 'kind', options: ['IMAGE', 'VIDEO'] },
          { key: 'visibility', label: 'visibility', options: ['PUBLIC', 'PRIVATE'] },
          { key: 'assetId', label: 'mediaAssetId' },
        ]}
      />
      {result.items.length === 0 && <p className="admin-empty">{m.empty}</p>}
      <div className="admin-media-grid">
        {result.items.map((row) => (
          <MediaCard
            key={identifier(row['id'])}
            locale={locale}
            csrf={csrfConfig()}
            row={row}
            mediaOrigin={media}
            privateOrigin={upload}
          />
        ))}
      </div>
      <Pagination locale={locale} path={path} query={query} nextCursor={result.nextCursor} />
    </AdminPage>
  );
}
