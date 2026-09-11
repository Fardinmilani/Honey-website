export type ProductJsonLdInput = {
  readonly name: string;
  readonly description: string;
  readonly images: readonly string[];
  readonly brandName: string;
  readonly category?: string;
  readonly inLanguage: string;
  readonly url: string;
  /**
   * Current public catalog pricing for one product variant. The caller must
   * supply this only from the authoritative catalog response.
   */
  readonly offer?: ProductOfferInput;
};

export type ProductOfferInput = {
  /** A non-negative ISO-4217 minor-unit amount encoded as a decimal string. */
  readonly amountMinor: string;
  readonly currency: string;
  /** Phase 11's intentionally non-exact public availability projection. */
  readonly availability: string;
};

export type ProductOfferJsonLd = {
  readonly '@type': 'Offer';
  readonly price: string;
  readonly priceCurrency: string;
  readonly availability:
    | 'https://schema.org/InStock'
    | 'https://schema.org/LimitedAvailability'
    | 'https://schema.org/OutOfStock';
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
  readonly offers?: ProductOfferJsonLd;
};

/**
 * Product structured data. An Offer is emitted only when a caller supplies a
 * valid current catalog price, currency, and public availability band.
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

  const offer = input.offer === undefined ? null : buildProductOffer(input.offer, input.url);

  return {
    ...jsonLd,
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(offer !== null ? { offers: offer } : {}),
  };
}

function buildProductOffer(
  input: ProductOfferInput,
  canonicalUrl: string,
): ProductOfferJsonLd | null {
  const price = decimalPriceFromMinorUnits(input.amountMinor, input.currency);
  const availability = schemaAvailability(input.availability);
  if (price === null || availability === null) {
    return null;
  }

  return {
    '@type': 'Offer',
    price,
    priceCurrency: input.currency,
    availability,
    url: canonicalUrl,
  };
}

function decimalPriceFromMinorUnits(amountMinor: string, currency: string): string | null {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(amountMinor) || !/^[A-Z]{3}$/u.test(currency)) {
    return null;
  }

  const fractionDigits = currencyFractionDigits(currency);
  if (fractionDigits === null) {
    return null;
  }

  const amount = BigInt(amountMinor);
  const divisor = 10n ** BigInt(fractionDigits);
  const whole = amount / divisor;
  if (fractionDigits === 0) {
    return whole.toString();
  }

  const fraction = (amount % divisor).toString().padStart(fractionDigits, '0');
  return `${whole.toString()}.${fraction}`;
}

function currencyFractionDigits(currency: string): number | null {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? null
    );
  } catch {
    return null;
  }
}

function schemaAvailability(value: string): ProductOfferJsonLd['availability'] | null {
  switch (value) {
    case 'IN_STOCK':
      return 'https://schema.org/InStock';
    case 'LOW_STOCK':
      return 'https://schema.org/LimitedAvailability';
    case 'OUT_OF_STOCK':
      return 'https://schema.org/OutOfStock';
    default:
      return null;
  }
}
