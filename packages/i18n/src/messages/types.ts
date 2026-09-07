/**
 * Typed message catalogs for storefront namespaces.
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
  readonly products: string;
  readonly categories: string;
  readonly collections: string;
  readonly search: string;
  readonly primaryNavLabel: string;
  readonly footerNavLabel: string;
};

export type HomeMessages = {
  readonly title: string;
  readonly headline: string;
  readonly supporting: string;
  readonly ctaExplore: string;
  readonly heroAriaLabel: string;
  readonly featuredProductsHeading: string;
  readonly featuredCollectionsHeading: string;
  readonly categoriesHeading: string;
  readonly browseAllProducts: string;
  readonly emptyCatalog: string;
  readonly unavailableCatalog: string;
};

export type AccessibilityMessages = {
  readonly languageSwitcher: string;
  readonly currentLanguage: string;
  readonly skipToContent: string;
  readonly breadcrumbNav: string;
  readonly galleryThumbnails: string;
  readonly paginationNav: string;
};

export type ErrorsMessages = {
  readonly notFound: string;
  readonly unsupportedLocale: string;
  readonly generic: string;
  readonly upstreamUnavailable: string;
};

export type CatalogMessages = {
  readonly productsTitle: string;
  readonly productsHeading: string;
  readonly productsDescription: string;
  readonly categoriesTitle: string;
  readonly categoriesHeading: string;
  readonly categoriesDescription: string;
  readonly collectionsTitle: string;
  readonly collectionsHeading: string;
  readonly collectionsDescription: string;
  readonly emptyProducts: string;
  readonly emptyCategory: string;
  readonly emptyCollection: string;
  readonly filterHeading: string;
  readonly filterVarietal: string;
  readonly filterOrigin: string;
  readonly filterFloral: string;
  readonly filterMinWeight: string;
  readonly filterMaxWeight: string;
  readonly filterApply: string;
  readonly filterClear: string;
  readonly sortLabel: string;
  readonly sortNewest: string;
  readonly sortOldest: string;
  readonly sortName: string;
  readonly sortWeight: string;
  readonly paginationNext: string;
  readonly paginationPrevious: string;
  readonly paginationMore: string;
  readonly productCount: string;
  readonly variantWeight: string;
  readonly relatedHeading: string;
  readonly viewProduct: string;
  readonly viewCategory: string;
  readonly viewCollection: string;
};

export type ProductMessages = {
  readonly tastingNotes: string;
  readonly pairingSuggestions: string;
  readonly floralSources: string;
  readonly originRegion: string;
  readonly originAltitude: string;
  readonly harvestSeason: string;
  readonly honeyVarietal: string;
  readonly story: string;
  readonly variants: string;
  readonly packaging: string;
  readonly galleryLabel: string;
  readonly mainImage: string;
};

export type SearchMessages = {
  readonly title: string;
  readonly heading: string;
  readonly description: string;
  readonly label: string;
  readonly placeholder: string;
  readonly submit: string;
  readonly resultsHeading: string;
  readonly noResults: string;
  readonly emptyQuery: string;
  readonly sortRelevance: string;
  readonly sortNewest: string;
  readonly sortName: string;
};

export type SeoMessages = {
  readonly homeTitle: string;
  readonly homeDescription: string;
  readonly productsTitle: string;
  readonly productsDescription: string;
  readonly categoriesTitle: string;
  readonly categoriesDescription: string;
  readonly collectionsTitle: string;
  readonly collectionsDescription: string;
  readonly searchTitle: string;
  readonly searchDescription: string;
  readonly organizationDescription: string;
};

export type MessageNamespaces = {
  readonly common: CommonMessages;
  readonly navigation: NavigationMessages;
  readonly home: HomeMessages;
  readonly accessibility: AccessibilityMessages;
  readonly errors: ErrorsMessages;
  readonly catalog: CatalogMessages;
  readonly product: ProductMessages;
  readonly search: SearchMessages;
  readonly seo: SeoMessages;
};

export type MessageNamespace = keyof MessageNamespaces;

export type MessageCatalog = MessageNamespaces;

export const messageNamespaces = [
  'common',
  'navigation',
  'home',
  'accessibility',
  'errors',
  'catalog',
  'product',
  'search',
  'seo',
] as const satisfies readonly MessageNamespace[];

export type MessageKey = {
  [N in MessageNamespace]: `${N}.${Extract<keyof MessageNamespaces[N], string>}`;
}[MessageNamespace];

export type InterpolationValues = Readonly<Record<string, string | number | boolean>>;
