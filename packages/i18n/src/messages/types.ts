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
  readonly cart: string;
  readonly cartItemCount: string;
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
  readonly availabilityAvailable: string;
  readonly availabilityLimited: string;
  readonly availabilityUnavailable: string;
  readonly price: string;
  readonly priceUnavailable: string;
  readonly addToCart: string;
  readonly addingToCart: string;
  readonly addedToCart: string;
  readonly addToCartQuantityAdjusted: string;
  readonly addToCartFailed: string;
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

/**
 * Customer-facing checkout and order-history copy.  Checkout is deliberately
 * payment-neutral: an order can be created without implying that it is paid.
 */
export type CheckoutMessages = {
  readonly checkoutTitle: string;
  readonly checkoutDescription: string;
  readonly checkoutLoading: string;
  readonly checkoutUnavailable: string;
  readonly checkoutRetry: string;
  readonly contactHeading: string;
  readonly emailLabel: string;
  readonly phoneLabel: string;
  readonly shippingAddressHeading: string;
  readonly billingAddressHeading: string;
  readonly sameAsShipping: string;
  readonly fullNameLabel: string;
  readonly addressPhoneLabel: string;
  readonly countryLabel: string;
  readonly provinceLabel: string;
  readonly cityLabel: string;
  readonly postalCodeLabel: string;
  readonly addressLine1Label: string;
  readonly addressLine2Label: string;
  readonly addressLine2Hint: string;
  readonly requiredField: string;
  readonly continueToReview: string;
  readonly reviewHeading: string;
  readonly reservationExpires: string;
  readonly reservationUnavailable: string;
  readonly summaryHeading: string;
  readonly subtotal: string;
  readonly discount: string;
  readonly shipping: string;
  readonly tax: string;
  readonly total: string;
  readonly noShippingQuote: string;
  readonly confirmOrder: string;
  readonly confirmingOrder: string;
  readonly orderCreatedHeading: string;
  readonly orderCreatedDescription: string;
  readonly viewOrder: string;
  readonly startOver: string;
  readonly cartEmpty: string;
  readonly returnToCart: string;
  readonly invalidForm: string;
  readonly requestError: string;
  readonly rateLimitError: string;
  readonly priceChanged: string;
  readonly reservationExpired: string;
  readonly unavailableItems: string;
  readonly checkoutExpired: string;
  readonly checkoutNotFound: string;
  readonly orderTitle: string;
  readonly ordersTitle: string;
  readonly ordersEmpty: string;
  readonly orderNumber: string;
  readonly placedAt: string;
  readonly paymentStatus: string;
  readonly fulfilmentStatus: string;
  readonly orderItems: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly lineTotal: string;
  readonly orderUnavailable: string;
  readonly browseProducts: string;
};

export type PaymentsMessages = {
  readonly payNow: string;
  readonly paying: string;
  readonly redirecting: string;
  readonly resultTitle: string;
  readonly pending: string;
  readonly paid: string;
  readonly failed: string;
  readonly cancelled: string;
  readonly expired: string;
  readonly retry: string;
  readonly providerUnavailable: string;
  readonly genericError: string;
  readonly returnToOrder: string;
  readonly statusLabel: string;
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
  readonly checkout: CheckoutMessages;
  readonly payments: PaymentsMessages;
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
  'checkout',
  'payments',
  'seo',
] as const satisfies readonly MessageNamespace[];

export type MessageKey = {
  [N in MessageNamespace]: `${N}.${Extract<keyof MessageNamespaces[N], string>}`;
}[MessageNamespace];

export type InterpolationValues = Readonly<Record<string, string | number | boolean>>;
