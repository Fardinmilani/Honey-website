/**
 * Typed message catalogs for Phase 9 namespaces.
 * English is key-authoritative; every locale must mirror these shapes exactly.
 */

export type CommonMessages = {
  readonly brandName: string;
  readonly skipToContent: string;
  readonly loading: string;
  readonly language: string;
};

export type NavigationMessages = {
  readonly home: string;
  readonly primaryNavLabel: string;
  readonly footerNavLabel: string;
};

export type HomeMessages = {
  readonly title: string;
  readonly headline: string;
  readonly supporting: string;
  readonly ctaExplore: string;
  readonly heroAriaLabel: string;
};

export type AccessibilityMessages = {
  readonly languageSwitcher: string;
  readonly currentLanguage: string;
  readonly skipToContent: string;
};

export type ErrorsMessages = {
  readonly notFound: string;
  readonly unsupportedLocale: string;
  readonly generic: string;
};

export type MessageNamespaces = {
  readonly common: CommonMessages;
  readonly navigation: NavigationMessages;
  readonly home: HomeMessages;
  readonly accessibility: AccessibilityMessages;
  readonly errors: ErrorsMessages;
};

export type MessageNamespace = keyof MessageNamespaces;

export type MessageCatalog = MessageNamespaces;

export const messageNamespaces = [
  'common',
  'navigation',
  'home',
  'accessibility',
  'errors',
] as const satisfies readonly MessageNamespace[];

export type MessageKey = {
  [N in MessageNamespace]: `${N}.${Extract<keyof MessageNamespaces[N], string>}`;
}[MessageNamespace];

export type InterpolationValues = Readonly<Record<string, string | number | boolean>>;
