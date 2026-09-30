'use client'

import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string
  optional?: boolean
  className?: string
  /** A single form control; receives id, aria-describedby and aria-invalid. */
  children: ReactElement<Record<string, unknown>>
}

export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const control = Children.only(children)

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-label text-fg">
        {label}
        {optional ? <span className="ml-1 font-normal text-fg-muted">(opcional)</span> : null}
      </label>
      {isValidElement(control)
        ? cloneElement(control, {
            id,
            'aria-describedby': describedBy,
            'aria-invalid': error ? true : undefined,
          })
        : control}
      {hint && !error ? (
        <p id={hintId} className="text-caption">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-caption !text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
