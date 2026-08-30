import clsx, { type ClassValue } from 'clsx';

/** Class-name combiner used across app-level components. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
