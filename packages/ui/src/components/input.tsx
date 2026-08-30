'use client';

import clsx from 'clsx';
import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
}

/** Labelled input with inline error wiring (a11y: label + aria-describedby + aria-invalid). */
export function Input({ label, error, className, ...rest }: InputProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={clsx('ui-input', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
      {error ? (
        <p className="ui-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
