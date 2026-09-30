import type { ComponentType, ReactNode, SVGProps } from 'react'
import type { Tone } from '@/domain/types'
import { cn } from '@/lib/utils/cn'
import { toneSoft } from './tone'

/** Surface container. Use only where grouping genuinely helps; prefer whitespace otherwise. */
export function Panel({ className, children, as: Tag = 'section', ...rest }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article'; 'aria-labelledby'?: string; 'aria-label'?: string }) {
  return (
    <Tag className={cn('rounded-[18px] border border-border bg-surface', className)} {...rest}>
      {children}
    </Tag>
  )
}

export function Badge({ children, tone, variant = 'soft', className }: { children: ReactNode; tone?: Tone | 'success' | 'warning' | 'danger' | 'neutral'; variant?: 'soft' | 'outline'; className?: string }) {
  const toneClass =
    tone === 'success'
      ? 'bg-success-soft text-success'
      : tone === 'warning'
        ? 'bg-warning-soft text-warning'
        : tone === 'danger'
          ? 'bg-danger-soft text-danger'
          : tone && tone !== 'neutral'
            ? toneSoft(tone)
            : 'bg-surface-muted text-fg-muted'
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
        variant === 'outline' ? 'border border-border bg-transparent text-fg-muted' : toneClass,
        className,
      )}
    >
      {children}
    </span>
  )
}

export function StatusDot({ tone }: { tone: 'success' | 'warning' | 'danger' | 'neutral' }) {
  const color = tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : tone === 'danger' ? 'bg-danger' : 'bg-fg-subtle'
  return <span aria-hidden className={cn('inline-block size-1.5 shrink-0 rounded-full', color)} />
}

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-display font-semibold text-accent',
        size === 'sm' && 'size-6 text-[0.625rem]',
        size === 'md' && 'size-8 text-xs',
        size === 'lg' && 'size-11 text-sm',
        className,
      )}
    >
      {initials || '·'}
    </span>
  )
}

interface EmptyStateProps {
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

/** Empty states always point to a real next action. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {Icon ? (
        <span className="mb-4 inline-flex size-11 items-center justify-center rounded-full bg-surface-muted text-fg-muted">
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <p className="text-card-title">{title}</p>
      {description ? <p className="mt-1.5 max-w-sm text-secondary">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-muted', className)} />
}

export function SectionHeading({ eyebrow, title, description, actions, id, className }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; id?: string; className?: string }) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-eyebrow mb-1.5">{eyebrow}</p> : null}
        <h2 id={id} className="text-section-title">
          {title}
        </h2>
        {description ? <p className="mt-1 text-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions, children }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="text-page-title">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-secondary">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function InlineError({ title = 'Não foi possível carregar', message, action }: { title?: string; message?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="rounded-[14px] border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
      <p className="font-medium">{title}</p>
      {message ? <p className="mt-0.5 opacity-90">{message}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
