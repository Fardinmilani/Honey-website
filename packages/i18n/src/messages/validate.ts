import { locales, type Locale } from '../config.js';
import { getAllCatalogs } from './index.js';
import type { MessageCatalog, MessageKey, MessageNamespace } from './types.js';
import { messageNamespaces } from './types.js';

const HTML_TAG_PATTERN = /<\/?[a-zA-Z][^>]*>/;

export type CatalogIssueCode =
  'missing_key' | 'extra_key' | 'empty_value' | 'html_in_message' | 'malformed_placeholder';

export type CatalogIssue = {
  readonly code: CatalogIssueCode;
  readonly locale: Locale;
  readonly key: string;
  readonly message: string;
};

export type CatalogValidationResult = {
  readonly ok: boolean;
  readonly issues: readonly CatalogIssue[];
};

/**
 * Validates key parity (en is authoritative), emptiness, HTML, and placeholders.
 */
export function validateMessageCatalogs(
  catalogs: Record<Locale, MessageCatalog> = getAllCatalogs(),
): CatalogValidationResult {
  const issues: CatalogIssue[] = [];
  const authoritativeKeys = new Set(keysFromCatalog(catalogs.en));

  for (const locale of locales) {
    const catalog = catalogs[locale];
    if (catalog === undefined) {
      issues.push({
        code: 'missing_key',
        locale,
        key: '*',
        message: `Locale "${locale}" catalog is missing.`,
      });
      continue;
    }

    const localeKeys = new Set(keysFromCatalog(catalog));

    for (const key of authoritativeKeys) {
      if (!localeKeys.has(key)) {
        issues.push({
          code: 'missing_key',
          locale,
          key,
          message: `Locale "${locale}" is missing key "${key}".`,
        });
        continue;
      }

      const value = readKey(catalog, key);
      if (value.trim().length === 0) {
        issues.push({
          code: 'empty_value',
          locale,
          key,
          message: `Locale "${locale}" has an empty value for "${key}".`,
        });
      }

      if (HTML_TAG_PATTERN.test(value)) {
        issues.push({
          code: 'html_in_message',
          locale,
          key,
          message: `Locale "${locale}" key "${key}" contains HTML.`,
        });
      }

      for (const placeholderIssue of findMalformedPlaceholders(value)) {
        issues.push({
          code: 'malformed_placeholder',
          locale,
          key,
          message: `Locale "${locale}" key "${key}": ${placeholderIssue}`,
        });
      }
    }

    for (const key of localeKeys) {
      if (!authoritativeKeys.has(key)) {
        issues.push({
          code: 'extra_key',
          locale,
          key,
          message: `Locale "${locale}" has extra key "${key}" not present in English.`,
        });
      }
    }

    for (const namespace of messageNamespaces) {
      if (!(namespace in catalog)) {
        issues.push({
          code: 'missing_key',
          locale,
          key: namespace,
          message: `Locale "${locale}" is missing namespace "${namespace}".`,
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function assertValidMessageCatalogs(catalogs?: Record<Locale, MessageCatalog>): void {
  const result = validateMessageCatalogs(catalogs);
  if (!result.ok) {
    const details = result.issues.map((issue) => `- ${issue.message}`).join('\n');
    throw new Error(`Message catalog validation failed:\n${details}`);
  }
}

export function messageContainsHtml(value: string): boolean {
  return HTML_TAG_PATTERN.test(value);
}

function keysFromCatalog(catalog: MessageCatalog): MessageKey[] {
  const keys: MessageKey[] = [];
  for (const namespace of messageNamespaces) {
    const messages = catalog[namespace] as Record<string, string> | undefined;
    if (messages === undefined) {
      continue;
    }
    for (const key of Object.keys(messages)) {
      keys.push(`${namespace}.${key}` as MessageKey);
    }
  }
  return keys;
}

function readKey(catalog: MessageCatalog, key: MessageKey): string {
  const separator = key.indexOf('.');
  const namespace = key.slice(0, separator) as MessageNamespace;
  const messageKey = key.slice(separator + 1);
  const namespaceMessages = catalog[namespace] as Record<string, string> | undefined;
  if (namespaceMessages === undefined) {
    return '';
  }
  return namespaceMessages[messageKey] ?? '';
}

function findMalformedPlaceholders(value: string): string[] {
  const issues: string[] = [];
  const openCount = (value.match(/\{/g) ?? []).length;
  const closeCount = (value.match(/\}/g) ?? []).length;
  if (openCount !== closeCount) {
    issues.push('unbalanced `{` / `}` placeholders');
  }

  const valid = value.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g) ?? [];
  const rough = value.match(/\{[^}]*\}/g) ?? [];
  if (rough.length !== valid.length) {
    issues.push('placeholder names must be identifiers like `{name}`');
  }

  return issues;
}
