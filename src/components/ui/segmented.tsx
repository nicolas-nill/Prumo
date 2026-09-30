'use client'

import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

interface Option<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
}

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: Option<T>[]
  label: string
  size?: 'sm' | 'md'
  className?: string
  fullWidth?: boolean
}

/** Segmented control built on native radio inputs (keyboard arrows, screen readers). */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', className, fullWidth }: SegmentedProps<T>) {
  const name = useId()
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-full bg-surface-muted p-1', fullWidth && 'flex w-full', className)}>
      {options.map((option) => {
        const checked = option.value === value
        return (
          <label
            key={option.value}
            className={cn(
              'relative flex cursor-pointer items-center justify-center rounded-full font-medium whitespace-nowrap text-fg-muted transition-[background-color,color,box-shadow] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
              size === 'sm' ? 'h-7 px-3 text-[0.8125rem]' : 'h-8 px-3.5 text-sm',
              fullWidth && 'flex-1',
              checked && 'bg-surface text-fg shadow-sm dark:bg-surface-elevated',
              option.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}
