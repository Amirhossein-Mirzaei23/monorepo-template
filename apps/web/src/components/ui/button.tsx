'use client';

import { Button as UiButton, type ButtonProps as UiButtonProps } from '@monorepo/ui';
import { cn } from '@/lib/utils';

/**
 * App-themed wrapper around the design-system Button
 * (`components/ui` wraps `packages/ui` — doc/ARCHITECTURE.md → Frontend).
 */
export function Button({ className, ...props }: UiButtonProps) {
  return <UiButton className={cn('app-button', className)} {...props} />;
}

export type ButtonProps = UiButtonProps;
