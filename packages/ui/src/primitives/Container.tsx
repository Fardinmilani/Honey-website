import { createElement, type ComponentPropsWithoutRef, type ReactNode } from 'react';

import { cx } from '../cx.js';
import type { ContainerSize } from '../types.js';

type ContainerElement =
  'div' | 'section' | 'main' | 'article' | 'header' | 'footer' | 'aside' | 'nav';

export type ContainerProps = {
  as?: ContainerElement;
  size?: ContainerSize;
  children?: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'className'>;

export function Container({
  as = 'div',
  size = 'lg',
  children,
  className,
  ...rest
}: ContainerProps) {
  return createElement(
    as,
    {
      className: cx('ui-container', `ui-container--${size}`, className),
      ...rest,
    },
    children,
  );
}
