import { Slot } from 'radix-ui'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'
import { Spinner } from './spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg shadow-xs hover:bg-primary-hover',
  secondary: 'border border-border bg-surface text-fg shadow-xs hover:border-border-strong hover:bg-surface-muted',
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  danger: 'bg-danger text-white shadow-xs hover:opacity-90 dark:text-[#1a0f0e]',
  link: 'h-auto px-0 text-accent underline-offset-4 hover:underline active:scale-100',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 rounded-[9px] px-3 text-[0.8125rem]',
  md: 'h-10 rounded-[10px] px-4 text-sm',
  lg: 'h-12 rounded-[12px] px-5 text-[0.9375rem]',
  icon: 'size-10 rounded-[10px]',
  'icon-sm': 'size-8 rounded-[9px]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, asChild = false, disabled, children, type, ...props },
  ref,
) {
  const classes = cn(base, variants[variant], variant !== 'link' && sizes[size], className)
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={classes} {...props}>
        {children}
      </Slot.Root>
    )
  }
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span className="invisible inline-flex items-center gap-2">{children}</span>
          <Spinner className="absolute" />
        </>
      ) : (
        children
      )}
    </button>
  )
})
