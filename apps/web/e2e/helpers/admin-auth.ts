import { createHmac } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { getNamespace, type Locale } from '@honey/i18n';

export function adminUser(index: number): { email: string; password: string; secret: string } {
  const users: unknown = JSON.parse(process.env['ADMIN_E2E_USERS'] ?? 'null');
  if (!Array.isArray(users)) throw new Error('Isolated admin fixture is required.');
  const row: unknown = users[index];
  if (
    row === null ||
    typeof row !== 'object' ||
    !('email' in row) ||
    typeof row.email !== 'string' ||
    !('password' in row) ||
    typeof row.password !== 'string' ||
    !('secret' in row) ||
    typeof row.secret !== 'string'
  )
    throw new Error('Admin fixture user missing.');
  return { email: row.email, password: row.password, secret: row.secret };
}
export function adminIds(): Record<string, string> {
  const value: unknown = JSON.parse(process.env['ADMIN_E2E_IDS'] ?? 'null');
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Admin fixture ids missing.');
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') throw new Error('Invalid admin fixture id.');
    result[key] = item;
  }
  return result;
}
export function totpCode(secret: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const character of secret) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error('Invalid test TOTP secret.');
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = (hash.at(-1) ?? 0) & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export async function signIn(page: Page, index: number, locale: Locale = 'en'): Promise<void> {
  const user = adminUser(index);
  const m = getNamespace(locale, 'admin');
  await page.goto(`/${locale}/admin/sign-in`);
  await page.getByLabel(m.email, { exact: true }).fill(user.email);
  // Password values stay out of Playwright action logs and traces.
  await page.locator('#admin-password').evaluate((element, password) => {
    if (!(element instanceof HTMLInputElement)) throw new Error('Password input missing.');
    element.value = password;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, user.password);
  await page.getByRole('button', { name: m.continue, exact: true }).click();
  await expect(page.locator('#admin-code')).toBeVisible();
  await page.locator('#admin-code').evaluate((input, code) => {
    if (!(input instanceof HTMLInputElement)) throw new Error('TOTP input missing.');
    input.value = code;
  }, totpCode(user.secret));
  await page.getByRole('button', { name: m.verify, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/admin$`, 'u'));
}

export async function freshStepUp(page: Page, index: number, locale: Locale = 'en'): Promise<void> {
  const m = getNamespace(locale, 'admin');
  const secret = adminUser(index).secret;
  const original = totpCode(secret);
  await expect
    .poll(() => totpCode(secret) !== original, { timeout: 35000, intervals: [1000] })
    .toBe(true);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(m.totp, { exact: true }).evaluate((input, code) => {
    if (!(input instanceof HTMLInputElement)) throw new Error('TOTP input missing.');
    input.value = code;
  }, totpCode(secret));
  await dialog.getByRole('button', { name: m.stepUpConfirm, exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
