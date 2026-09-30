import { cn } from '@/lib/utils/cn'

/** The PRUMO mark: a plumb line — something that is always true to vertical. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-7', className)}>
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="9.25" className="fill-primary" />
      <path d="M16 6.5v10.2" className="stroke-primary-fg" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M16 15.2c-2.3 0-3.9 1.7-3.9 3.7 0 2.6 2.6 4.6 3.9 6.3 1.3-1.7 3.9-3.7 3.9-6.3 0-2-1.6-3.7-3.9-3.7Z"
        className="fill-primary-fg"
      />
      <path d="M11.5 6.5h9" className="stroke-primary-fg" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
    </svg>
  )
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      {compact ? null : (
        <span className="font-display text-[1.0625rem] font-bold tracking-[0.14em] text-fg" aria-label="PRUMO">
          PRUMO
        </span>
      )}
    </span>
  )
}
