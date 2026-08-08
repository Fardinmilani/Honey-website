/**
 * `@honey/i18n` — locale configuration, catalogs, negotiation, formatters,
 * and pathname helpers for the Honey storefront.
 */

export {
  defaultLocale,
  getDirection,
  getLangAttribute,
  getLocaleConfig,
  isLocale,
  localeConfig,
  locales,
  LOCALE_COOKIE_NAME,
  parseLocale,
  type FontScript,
  type Locale,
  type LocaleDefinition,
  type TextDirection,
} from './config.js';

export {
  formatCurrency,
  formatDate,
  formatList,
  formatNumber,
  formatRelativeTime,
  compareStrings,
  createCollator,
  normalizeDigits,
} from './format.js';

export {
  isSupportedLocale,
  matchAcceptLanguage,
  negotiateLocale,
  parseAcceptLanguage,
  readCookieLocale,
  readLocaleCookieHeader,
  type AcceptLanguagePreference,
  type NegotiateLocaleInput,
} from './negotiate.js';

export {
  localizePathname,
  localizedHref,
  parseLocalePath,
  pathnames,
  resolveInternalPathname,
  switchLocalePath,
  type InternalPathname,
  type LocalizedPathSegment,
  type ParsedLocalePath,
} from './pathnames.js';

export { createTranslator, interpolate, type Translator } from './translate.js';

export {
  enCatalog,
  faCatalog,
  getAllCatalogs,
  getCatalog,
  getMessage,
  getNamespace,
  hasMessage,
  isMessageNamespace,
  listMessageKeys,
  messageNamespaces,
  splitMessageKey,
  type MessageCatalog,
  type MessageKey,
  type MessageNamespace,
  type MessageNamespaces,
} from './messages/index.js';

export type {
  AccessibilityMessages,
  CommonMessages,
  ErrorsMessages,
  HomeMessages,
  InterpolationValues,
  NavigationMessages,
} from './messages/types.js';

export {
  assertValidMessageCatalogs,
  messageContainsHtml,
  validateMessageCatalogs,
  type CatalogIssue,
  type CatalogIssueCode,
  type CatalogValidationResult,
} from './messages/validate.js';
