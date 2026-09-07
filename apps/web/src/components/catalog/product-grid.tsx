import type { Locale } from '@honey/i18n';

import type { PublicProduct } from '../../lib/catalog/api';

import { ProductCard } from './product-card';

type ProductGridProps = {
  readonly locale: Locale;
  readonly products: readonly PublicProduct[];
};

export function ProductGrid({ locale, products }: ProductGridProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <ul className="product-grid">
      {products.map((product, index) => (
        <li key={product.id} className="product-grid__item">
          <ProductCard locale={locale} product={product} priority={index < 4} />
        </li>
      ))}
    </ul>
  );
}
