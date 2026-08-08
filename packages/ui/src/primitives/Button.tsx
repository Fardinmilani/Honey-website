import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cx } from '../cx.js';
import type { ButtonSize, ButtonVariant } from '../types.js';

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>;

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  children,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)}
      {...rest}
    >
      {children}
    </button>
  );
}
