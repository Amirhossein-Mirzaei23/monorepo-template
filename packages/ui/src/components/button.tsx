'use client';

import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}

/** Design-system Button — app-level `components/ui` wraps and themes this. */
export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)}
      {...rest}
    />
  );
}
