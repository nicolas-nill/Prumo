'use client'

import { Dialog as D } from 'radix-ui'
import { X } from 'lucide-react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

interface DialogContentProps extends ComponentPropsWithoutRef<typeof D.Content> {
  size?: 'sm' | 'md' | 'lg'
  hideClose?: boolean
}

/**
 * Accessible dialog (focus trap, Esc, labelled). On phones it becomes a bottom sheet that
 * respects the safe area; on larger screens it is a centered panel.
 */
export function DialogContent({ className, children, size = 'md', hideClose, ...props }: DialogContentProps) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-[prumo-fade-in_150ms_ease-out]" />
      <D.Content
        className={cn(
          'fixed z-50 flex max-h-[92dvh] w-full flex-col overflow-hidden border border-border bg-surface-elevated shadow-lg outline-none',
          'inset-x-0 bottom-0 rounded-t-[20px] pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-[prumo-sheet-in_260ms_cubic-bezier(0.22,1,0.36,1)]',
          'sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[18px] sm:pb-0 sm:data-[state=open]:animate-[prumo-pop-in_180ms_cubic-bezier(0.22,1,0.36,1)]',
          size === 'sm' && 'sm:max-w-[420px]',
          size === 'md' && 'sm:max-w-[540px]',
          size === 'lg' && 'sm:max-w-[760px]',
          className,
        )}
        {...props}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" />
        {children}
        {hideClose ? null : (
          <D.Close
            className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-[9px] text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  )
}

export function DialogHeader({ title, description, className }: { title: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <div className={cn('shrink-0 px-5 pt-4 pr-14 sm:px-6 sm:pt-6', className)}>
      <D.Title className="text-section-title">{title}</D.Title>
      {description ? <D.Description className="mt-1 text-secondary">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
    </div>
  )
}

export function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6', className)}>{children}</div>
}

export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex shrink-0 flex-col-reverse gap-2 border-t border-divider px-5 py-4 sm:flex-row sm:justify-end sm:px-6', className)}>
      {children}
    </div>
  )
}
