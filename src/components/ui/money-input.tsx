'use client'

import { forwardRef, useState, type InputHTMLAttributes } from 'react'
import { centsToInputValue, parseMoneyToCents } from '@/domain/money'
import { cn } from '@/lib/utils/cn'
import { useFieldControl } from './field'
import { controlClass } from './input'

interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'size'> {
  value: number | null
  onValueChange: (cents: number | null) => void
  size?: 'md' | 'lg'
}

/**
 * Brazilian money input: types freely ("47,90", "1.200"), parses to integer cents on every
 * change and normalizes the display on blur. Never goes through floats.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onValueChange, className, size = 'md', onBlur, ...props },
  ref,
) {
  const [text, setText] = useState(() => centsToInputValue(value))
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    if (parseMoneyToCents(text) !== value) setText(centsToInputValue(value))
  }

  return (
    <div className="relative">
      <span aria-hidden className={cn('pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted', size === 'lg' ? 'text-base' : 'text-sm')}>
        R$
      </span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        className={cn(controlClass, 'tabular pl-10 text-right font-medium', size === 'lg' ? 'h-14 text-2xl' : 'h-10', className)}
        value={text}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d.,]/g, '')
          setText(next)
          const cents = next === '' ? null : parseMoneyToCents(next)
          setLastValue(cents)
          onValueChange(cents)
        }}
        onBlur={(e) => {
          const cents = parseMoneyToCents(text)
          if (cents !== null) setText(centsToInputValue(cents))
          onBlur?.(e)
        }}
        {...useFieldControl(props)}
      />
    </div>
  )
})
