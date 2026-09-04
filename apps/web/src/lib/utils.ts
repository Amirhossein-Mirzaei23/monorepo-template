import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Class-name combiner used across app-level components. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
