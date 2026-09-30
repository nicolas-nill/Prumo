'use client'

import { DropdownMenu as M } from 'radix-ui'
import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils/cn'

export const Menu = M.Root
export const MenuTrigger = M.Trigger
export const MenuGroup = M.Group
export const MenuRadioGroup = M.RadioGroup

export function MenuContent({ className, align = 'end', sideOffset = 6, ...props }: ComponentPropsWithoutRef<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[200px] overflow-hidden rounded-[14px] border border-border bg-surface-elevated p-1.5 shadow-md data-[state=open]:animate-[prumo-pop-in_140ms_cubic-bezier(0.22,1,0.36,1)]',
          className,
        )}
        {...props}
      />
    </M.Portal>
  )
}

const itemClass =
  'relative flex h-9 cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 text-sm text-fg outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted [&_svg]:size-4 [&_svg]:text-fg-muted'

export function MenuItem({ className, danger, ...props }: ComponentPropsWithoutRef<typeof M.Item> & { danger?: boolean }) {
  return <M.Item className={cn(itemClass, danger && 'text-danger [&_svg]:text-danger', className)} {...props} />
}

export function MenuRadioItem({ className, children, ...props }: ComponentPropsWithoutRef<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(itemClass, 'pr-8', className)} {...props}>
      {children}
      <M.ItemIndicator className="absolute right-2.5 size-1.5 rounded-full bg-accent" />
    </M.RadioItem>
  )
}

export function MenuLabel({ className, ...props }: ComponentPropsWithoutRef<typeof M.Label>) {
  return <M.Label className={cn('px-2.5 pt-2 pb-1 text-eyebrow', className)} {...props} />
}

export function MenuSeparator({ className }: { className?: string }) {
  return <M.Separator className={cn('my-1.5 h-px bg-divider', className)} />
}
