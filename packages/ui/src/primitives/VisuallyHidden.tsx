import type { HTMLAttributes, ReactNode } from 'react';

import { cx } from '../cx.js';

export type VisuallyHiddenProps = {
  children?: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'className'>;

/**
 * Hides content visually while keeping it available to assistive technology.
 * Pass translated text as `children` — this package never ships copy strings.
 */
export function VisuallyHidden({ children, className, ...rest }: VisuallyHiddenProps) {
  return (
    <span className={cx('ui-visually-hidden', className)} {...rest}>
      {children}
    </span>
  );
}
