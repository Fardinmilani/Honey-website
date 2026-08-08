import { createElement, type ComponentPropsWithoutRef, type ReactNode } from 'react';

import { cx } from '../cx.js';
import type { InlineAlignScale, JustifyScale, SpaceScale } from '../types.js';

type InlineElement = 'div' | 'span' | 'ul' | 'ol' | 'nav' | 'menu' | 'p';

export type InlineProps = {
  as?: InlineElement;
  gap?: SpaceScale;
  align?: InlineAlignScale;
  justify?: JustifyScale;
  wrap?: boolean;
  children?: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'className'>;

export function Inline({
  as = 'div',
  gap = 'sm',
  align = 'center',
  justify = 'start',
  wrap = true,
  children,
  className,
  ...rest
}: InlineProps) {
  return createElement(
    as,
    {
      className: cx(
        'ui-inline',
        `ui-inline--gap-${gap}`,
        `ui-inline--align-${align}`,
        `ui-inline--justify-${justify}`,
        wrap ? undefined : 'ui-inline--nowrap',
        className,
      ),
      ...rest,
    },
    children,
  );
}
