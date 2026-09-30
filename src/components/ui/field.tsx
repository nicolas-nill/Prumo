'use client'

import { Children, cloneElement, createContext, isValidElement, useContext, useId, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

/**
 * The control inside a Field may be wrapped (e.g. react-hook-form's Controller), so cloning
 * alone would put the id on the wrapper. Controls also read it from context.
 */
const FieldContext = createContext<FieldControlProps | null>(null)

/** Field-provided id/aria props; explicit props on the control win. */
export function useFieldControl<P extends object>(props: P): FieldControlProps | P {
  const field = useContext(FieldContext)
  return field ? { ...field, ...props } : props
}

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
  const controlProps: FieldControlProps = { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined }

  return (
    <FieldContext value={controlProps}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className="text-label text-fg">
          {label}
          {optional ? <span className="ml-1 font-normal text-fg-muted">(opcional)</span> : null}
        </label>
        {isValidElement(control) ? cloneElement(control, { ...controlProps }) : control}
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
    </FieldContext>
  )
}
