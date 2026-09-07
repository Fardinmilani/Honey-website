export type ProductJsonLdInput = {
  readonly name: string;
  readonly description: string;
  readonly images: readonly string[];
  readonly brandName: string;
  readonly category?: string;
  readonly inLanguage: string;
  readonly url: string;
};

export type ProductJsonLd = {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'Product';
  readonly name: string;
  readonly description: string;
  readonly image: readonly string[];
  readonly brand: {
    readonly '@type': 'Brand';
    readonly name: string;
  };
  readonly category?: string;
  readonly inLanguage: string;
  readonly url: string;
};

/**
 * Product structured data without commerce fields (no offers, price,
 * availability, reviews, or ratings).
 */
export function buildProductJsonLd(input: ProductJsonLdInput): ProductJsonLd {
  const jsonLd: ProductJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description,
    image: input.images,
    brand: {
      '@type': 'Brand',
      name: input.brandName,
    },
    inLanguage: input.inLanguage,
    url: input.url,
  };

  if (input.category !== undefined) {
    return { ...jsonLd, category: input.category };
  }

  return jsonLd;
}
