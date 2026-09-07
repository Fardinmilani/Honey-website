import { createTranslator, type Locale } from '@honey/i18n';
import { cx } from '@honey/ui';
import NextLink from 'next/link';

export type BreadcrumbItem = {
  readonly label: string;
  readonly href?: string;
};

type BreadcrumbsProps = {
  readonly locale: Locale;
  readonly items: readonly BreadcrumbItem[];
};

export function Breadcrumbs({ locale, items }: BreadcrumbsProps) {
  const t = createTranslator(locale);

  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="breadcrumbs" aria-label={t('accessibility.breadcrumbNav')}>
      <ol className="breadcrumbs__list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li
              key={`${item.label}-${index}`}
              className={cx('breadcrumbs__item', isLast ? 'breadcrumbs__item--current' : undefined)}
            >
              {item.href !== undefined && !isLast ? (
                <NextLink href={item.href} className="breadcrumbs__link ui-link">
                  {item.label}
                </NextLink>
              ) : (
                <span className="breadcrumbs__current" aria-current={isLast ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
