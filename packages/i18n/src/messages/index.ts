import { locales, type Locale } from '../config.js';
import { enCatalog } from './en/index.js';
import { faCatalog } from './fa/index.js';
import type { MessageCatalog, MessageKey, MessageNamespace, MessageNamespaces } from './types.js';
import { messageNamespaces } from './types.js';

const catalogs = {
  en: enCatalog,
  fa: faCatalog,
} as const satisfies Record<Locale, MessageCatalog>;

export function getCatalog(locale: Locale): MessageCatalog {
  return catalogs[locale];
}

export function getNamespace<N extends MessageNamespace>(
  locale: Locale,
  namespace: N,
): MessageNamespaces[N] {
  return catalogs[locale][namespace];
}

export function getMessage(locale: Locale, key: MessageKey): string {
  const [namespace, messageKey] = splitMessageKey(key);
  const namespaceMessages = catalogs[locale][namespace] as Record<string, string>;
  const value = namespaceMessages[messageKey];
  if (typeof value !== 'string') {
    throw new Error(`Missing message key "${key}" for locale "${locale}".`);
  }
  return value;
}

export function hasMessage(locale: Locale, key: MessageKey): boolean {
  const [namespace, messageKey] = splitMessageKey(key);
  const namespaceMessages = catalogs[locale][namespace] as Record<string, string>;
  return typeof namespaceMessages[messageKey] === 'string';
}

export function listMessageKeys(locale: Locale = 'en'): MessageKey[] {
  const catalog = catalogs[locale];
  const keys: MessageKey[] = [];
  for (const namespace of messageNamespaces) {
    const messages = catalog[namespace] as Record<string, string>;
    for (const key of Object.keys(messages)) {
      keys.push(`${namespace}.${key}` as MessageKey);
    }
  }
  return keys;
}

export function splitMessageKey(key: MessageKey): [MessageNamespace, string] {
  const separator = key.indexOf('.');
  if (separator <= 0 || separator === key.length - 1) {
    throw new Error(`Invalid message key "${key}". Expected "namespace.key".`);
  }
  const namespace = key.slice(0, separator);
  const messageKey = key.slice(separator + 1);
  if (!isMessageNamespace(namespace)) {
    throw new Error(`Unknown message namespace "${namespace}".`);
  }
  return [namespace, messageKey];
}

export function isMessageNamespace(value: string): value is MessageNamespace {
  return (messageNamespaces as readonly string[]).includes(value);
}

export function getAllCatalogs(): Record<Locale, MessageCatalog> {
  const result = {} as Record<Locale, MessageCatalog>;
  for (const locale of locales) {
    result[locale] = catalogs[locale];
  }
  return result;
}

export { enCatalog, faCatalog, messageNamespaces };
export type { MessageCatalog, MessageKey, MessageNamespace, MessageNamespaces } from './types.js';
