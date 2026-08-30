'use client';

import { Input as UiInput, type InputProps as UiInputProps } from '@monorepo/ui';
import { cn } from '@/lib/utils';

/** App-themed wrapper around the design-system Input. */
export function Input({ className, ...props }: UiInputProps) {
  return <UiInput className={cn('app-input', className)} {...props} />;
}

export type InputProps = UiInputProps;
