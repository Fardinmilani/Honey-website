import { createElement, type ComponentPropsWithoutRef, type ReactNode } from 'react';

import { cx } from '../cx.js';
import type { AlignScale, SpaceScale } from '../types.js';

type StackElement =
  'div' | 'section' | 'ul' | 'ol' | 'nav' | 'form' | 'fieldset' | 'main' | 'aside';

export type StackProps = {
  as?: StackElement;
  gap?: SpaceScale;
  align?: AlignScale;
  children?: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'className'>;

export function Stack({
  as = 'div',
  gap = 'md',
  align = 'stretch',
  children,
  className,
  ...rest
}: StackProps) {
  return createElement(
    as,
    {
      className: cx('ui-stack', `ui-stack--gap-${gap}`, `ui-stack--align-${align}`, className),
      ...rest,
    },
    children,
  );
}
