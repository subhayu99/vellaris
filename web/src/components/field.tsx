/**
 * Field primitive — label + control + hint/error block.
 *
 * Mirrors the JSX prototype's `.field` / `.field-label` / `.field-hint` /
 * `.field-error` styling. The `Input` is a thin wrapper over `<input>` that
 * inherits the locked design tokens (line color, fg, bg-elev) and shows a
 * focus ring in the gold accent.
 */

import type { InputHTMLAttributes, ReactNode } from 'react'

export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}

export function Field({ label, hint, error, htmlFor, children, className = '' }: FieldProps) {
  return (
    <div className={['flex flex-col gap-1.5', className].filter(Boolean).join(' ')}>
      {label && (
        <label htmlFor={htmlFor} className="text-fg-2 text-[12.5px] font-medium">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <div className="text-danger text-[12px]">{error}</div>
      ) : hint ? (
        <div className="text-fg-3 text-[12px]">{hint}</div>
      ) : null}
    </div>
  )
}

const INPUT_BASE =
  'h-10 w-full rounded-md border border-line-2 bg-bg-elev px-3 ' +
  'font-sans text-[14px] text-fg placeholder:text-fg-3 ' +
  'transition-colors duration-150 ease-out ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 ' +
  'focus:border-line-strong ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={[INPUT_BASE, className].filter(Boolean).join(' ')} />
}
