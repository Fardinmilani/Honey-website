import { expect, type Page } from '@playwright/test';

export const FORBIDDEN_JSON_LD_KEYS = [
  'price',
  'offers',
  'aggregaterating',
  'moisture',
  'supplier',
] as const;

export function siteOrigin(): string {
  const raw =
    process.env['NEXT_PUBLIC_SITE_URL'] ??
    process.env['PUBLIC_SITE_URL'] ??
    process.env['PLAYWRIGHT_BASE_URL'] ??
    'http://127.0.0.1:3000';
  return raw.replace(/\/$/u, '');
}

export async function parseJsonLd(page: Page): Promise<unknown[]> {
  const scripts = page.locator('script[type="application/ld+json"]');
  const count = await scripts.count();
  const parsed: unknown[] = [];

  for (let index = 0; index < count; index += 1) {
    const raw = await scripts.nth(index).innerHTML();
    parsed.push(JSON.parse(raw) as unknown);
  }

  return parsed;
}

export async function getCanonical(page: Page): Promise<string | null> {
  return page.locator('link[rel="canonical"]').getAttribute('href');
}

export async function getHreflangs(page: Page): Promise<Record<string, string>> {
  const links = page.locator('link[rel="alternate"][hreflang]');
  const count = await links.count();
  const result: Record<string, string> = {};

  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    const hreflang = await link.getAttribute('hreflang');
    const href = await link.getAttribute('href');
    if (hreflang !== null && href !== null) {
      result[hreflang] = href;
    }
  }

  return result;
}

export async function getRobotsMeta(page: Page): Promise<string | null> {
  const meta = page.locator('meta[name="robots"]');
  if ((await meta.count()) === 0) {
    return null;
  }
  return meta.first().getAttribute('content');
}

export function collectJsonLdTypes(nodes: unknown[]): string[] {
  const types: string[] = [];

  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    const record = node as Record<string, unknown>;
    const typeValue = record['@type'];
    if (typeof typeValue === 'string') {
      types.push(typeValue);
    } else if (Array.isArray(typeValue)) {
      for (const entry of typeValue) {
        if (typeof entry === 'string') {
          types.push(entry);
        }
      }
    }
    for (const value of Object.values(record)) {
      visit(value);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return types;
}

export function assertNoForbiddenJsonLdKeys(nodes: unknown[]): void {
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      expect(FORBIDDEN_JSON_LD_KEYS, `Forbidden JSON-LD key "${key}"`).not.toContain(
        key.toLowerCase(),
      );
      visit(value);
    }
  };

  for (const node of nodes) {
    visit(node);
  }
}

export function assertReciprocalHreflangs(
  hreflangs: Record<string, string>,
  expected: { faPath: string; enPath: string },
): void {
  const origin = siteOrigin();
  expect(hreflangs['fa-IR']).toBe(`${origin}${expected.faPath}`);
  expect(hreflangs['en']).toBe(`${origin}${expected.enPath}`);
  expect(hreflangs['x-default']).toBe(`${origin}${expected.enPath}`);
}
