'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

export interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);
const AUTO_DISMISS_MS = 4000;

/**
 * Toast pattern from doc/CONVENTIONS.md — mutations report failures (and
 * confirmations) here; forms keep their inline zod errors. Rendered inside an
 * aria-live region so screen readers announce toasts.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, variant }]);
  }, []);

  // Auto-dismiss each toast on its own timer.
  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }
    const timers = toasts.map((entry) => setTimeout(() => dismiss(entry.id), AUTO_DISMISS_MS));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed right-6 bottom-6 z-[100] flex flex-col gap-2"
        aria-live="polite"
        role="status"
      >
        {toasts.map((entry) => (
          <div
            key={entry.id}
            className={cn(
              'bg-card text-card-foreground flex items-center gap-3 rounded-md border px-4 py-2 shadow-lg',
              entry.variant === 'success' && 'border-primary',
              entry.variant === 'error' && 'border-destructive',
            )}
          >
            <span>{entry.message}</span>
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 px-1 text-lg text-inherit"
              aria-label="Dismiss notification"
              onClick={() => dismiss(entry.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within <ToastProvider>');
  }
  return context;
}
