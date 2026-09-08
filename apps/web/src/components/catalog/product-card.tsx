import { createTranslator, localizedHref, type Locale } from '@honey/i18n';
import { Stack } from '@honey/ui';
import Image from 'next/image';
import NextLink from 'next/link';

import type { PublicProduct } from '../../lib/catalog/api';
import { pickThumbnail, publicImageSrc } from '../../lib/catalog/media';

type ProductCardProps = {
  readonly locale: Locale;
  readonly product: PublicProduct;
  readonly priority?: boolean;
};

type PublicVariant = PublicProduct['variants'][number];
type AvailabilityBand = PublicVariant extends { availabilityBand: infer Band } ? Band : never;

function defaultVariant(product: PublicProduct): PublicVariant | undefined {
  return product.variants.find((variant) => variant.isDefault) ?? product.variants[0];
}

function availabilityCopy(t: ReturnType<typeof createTranslator>, band: AvailabilityBand): string {
  if (band === 'LOW_STOCK') return t('product.availabilityLimited');
  if (band === 'OUT_OF_STOCK') return t('product.availabilityUnavailable');
  return t('product.availabilityAvailable');
}

export function ProductCard({ locale, product, priority = false }: ProductCardProps) {
  const t = createTranslator(locale);
  const href = localizedHref('/products/[slug]', locale, { slug: product.slug });
  const thumbnail = pickThumbnail(product.media);
  const variant = defaultVariant(product);

  return (
    <article className="product-card">
      <NextLink href={href} className="product-card__link">
        <div className="product-card__media">
          {thumbnail !== undefined ? (
            <Image
              src={publicImageSrc(thumbnail.url)}
              alt={thumbnail.altText}
              fill
              sizes="(max-width: 40rem) 50vw, (max-width: 72rem) 33vw, 25vw"
              className="product-card__image"
              priority={priority}
            />
          ) : (
            <div className="product-card__placeholder" aria-hidden="true" />
          )}
        </div>
        <Stack as="div" gap="xs" className="product-card__body">
          <h2 className="product-card__title">{product.name}</h2>
          {product.shortDescription !== null && product.shortDescription !== '' ? (
            <p className="product-card__description">{product.shortDescription}</p>
          ) : null}
          {variant !== undefined ? (
            <p className="product-card__variant">
              {t('catalog.variantWeight', { grams: variant.netWeightGrams })}
            </p>
          ) : null}
          {variant !== undefined ? (
            <p
              className="product-card__availability"
              data-testid="availability-band"
              data-band={variant.availabilityBand}
            >
              {availabilityCopy(t, variant.availabilityBand)}
            </p>
          ) : null}
          <span className="product-card__cta">{t('catalog.viewProduct')}</span>
        </Stack>
      </NextLink>
    </article>
  );
}
