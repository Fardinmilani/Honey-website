import 'server-only';
import { redirect } from 'next/navigation';
import { isLocale, type Locale } from '@honey/i18n';
import { apiFetch, ApiClientError } from '../api-client/server';
import { getWebEnv } from '../env';
import { flag, identifier, optionalText, record, text } from './validation';

import type { AdminUser, CsrfConfig } from './types';
export type { AdminUser, CsrfConfig } from './types';
export function csrfConfig(): CsrfConfig {
  const env = getWebEnv();
  return { cookieName: env.csrfCookieName, headerName: env.csrfHeaderName };
}
export function adminUploadLimits(): { image: number; video: number } {
  function limit(name: string, fallback: number, maximum: number): number {
    const raw = process.env[name];
    if (raw === undefined) return fallback;
    if (!/^[1-9]\d*$/u.test(raw)) throw new Error('ADMIN_MEDIA_LIMIT_INVALID');
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value > maximum)
      throw new Error('ADMIN_MEDIA_LIMIT_INVALID');
    return value;
  }
  return {
    image: limit('MEDIA_MAX_IMAGE_BYTES', 15_728_640, 50_000_000),
    video: limit('MEDIA_MAX_VIDEO_BYTES', 104_857_600, 500_000_000),
  };
}
export function adminLocale(value: string): Locale {
  return isLocale(value) ? value : 'fa';
}
export async function adminUser(locale: Locale): Promise<AdminUser> {
  let raw: unknown;
  try {
    raw = await apiFetch<unknown>({ path: '/v1/me', locale, withSession: true, cache: 'no-store' });
  } catch (error) {
    if (error instanceof ApiClientError && error.presentation.status === 401)
      redirect(`/${locale}/admin/sign-in`);
    throw error;
  }
  const user = record(raw);
  if (!flag(user['isStaff'])) redirect(`/${locale}/admin/sign-in?denied=1`);
  const permissions = user['permissions'];
  if (!Array.isArray(permissions) || permissions.length > 100)
    throw new Error('ADMIN_RESPONSE_INVALID');
  return {
    id: identifier(user['id']),
    email: text(user['email']),
    displayName: optionalText(user['displayName']),
    permissions: permissions.map(text),
  };
}
export async function adminRead(
  locale: Locale,
  path: string,
  query: Record<string, string> = {},
): Promise<unknown> {
  if (!path.startsWith('/v1/admin/')) throw new Error('ADMIN_PATH_INVALID');
  try {
    return await apiFetch<unknown>({
      path,
      locale,
      searchParams: query,
      withSession: true,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof ApiClientError && error.presentation.status === 401)
      redirect(`/${locale}/admin/sign-in`);
    throw error;
  }
}
export type AdminSearchParams = Readonly<Record<string, string | string[] | undefined>>;
export function adminQuery(
  source: AdminSearchParams,
  keys: readonly string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || value.length > 256) throw new Error('ADMIN_QUERY_INVALID');
    result[key] = value;
  }
  return result;
}
