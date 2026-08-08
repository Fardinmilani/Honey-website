import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { cx } from '../cx.js';
import type { LinkTone } from '../types.js';

export type LinkProps = {
  tone?: LinkTone;
  children?: ReactNode;
  className?: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'className'>;

/**
 * Text link primitive. Pass translated label text as `children`.
 * Does not own routing — compose with Next.js `Link` via `asChild`-style
 * wrapping in the app, or pass `href` for plain anchors.
 */
export function Link({ tone = 'default', children, className, ...rest }: LinkProps) {
  return (
    <a
      className={cx('ui-link', tone === 'muted' ? 'ui-link--muted' : undefined, className)}
      {...rest}
    >
      {children}
    </a>
  );
}
