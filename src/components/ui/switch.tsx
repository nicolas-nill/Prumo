'use client'

import { Switch as S } from 'radix-ui'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

interface SwitchFieldProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
  className?: string
}

export function SwitchField({ checked, onCheckedChange, label, description, disabled, className }: SwitchFieldProps) {
  const id = useId()
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-label cursor-pointer">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-caption">{description}</p> : null}
      </div>
      <S.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative mt-0.5 inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full bg-border-strong transition-colors duration-150 data-[state=checked]:bg-accent disabled:opacity-50"
      >
        <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-[18px]" />
      </S.Root>
    </div>
  )
}
