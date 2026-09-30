import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, monthName } from '@/domain/dates'
import type { MonthKey } from '@/domain/types'
import { hrefWith, type PerspectiveOption } from '@/features/dashboard/params'
import { cn } from '@/lib/utils/cn'

type Params = Record<string, string | string[] | undefined>

/** Month navigation as plain links: shareable URLs, works without JavaScript. */
export function MonthSwitcher({ pathname, params, month, currentMonth }: { pathname: string; params: Params; month: MonthKey; currentMonth: MonthKey }) {
  const prev = addMonths(month, -1)
  const next = addMonths(month, 1)
  const label = (m: MonthKey) => `${monthName(m, { capitalized: true })}${m.slice(0, 4) !== currentMonth.slice(0, 4) ? ` ${m.slice(2, 4)}` : ''}`
  return (
    <nav aria-label="Mês" className="inline-flex items-center gap-1 rounded-full bg-surface-muted p-1">
      <Link
        href={hrefWith(pathname, params, { mes: prev === currentMonth ? null : prev })}
        aria-label={`Ver ${monthName(prev)}`}
        className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface hover:text-fg"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Link>
      <span className="hidden px-2 text-sm text-fg-muted sm:inline">{label(prev)}</span>
      <span aria-current="date" className="rounded-full bg-surface px-3.5 py-1.5 text-sm font-semibold shadow-xs dark:bg-surface-elevated">
        {label(month)}
      </span>
      <span className="hidden px-2 text-sm text-fg-muted sm:inline">{label(next)}</span>
      <Link
        href={hrefWith(pathname, params, { mes: next === currentMonth ? null : next })}
        aria-label={`Ver ${monthName(next)}`}
        className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface hover:text-fg"
      >
        <ChevronRight className="size-4" aria-hidden />
      </Link>
      {month !== currentMonth ? (
        <Link href={hrefWith(pathname, params, { mes: null })} className="px-2.5 text-sm font-medium text-accent hover:underline">
          Hoje
        </Link>
      ) : null}
    </nav>
  )
}

export function PerspectiveSwitcher({ pathname, params, options, selected }: { pathname: string; params: Params; options: PerspectiveOption[]; selected: string }) {
  if (options.length === 0) return null
  return (
    <nav aria-label="Perspectiva" className="inline-flex items-center gap-1 rounded-full bg-surface-muted p-1">
      {options.map((o) => (
        <Link
          key={o.key}
          href={hrefWith(pathname, params, { visao: o.key === 'todos' ? null : o.key })}
          aria-current={o.key === selected ? 'true' : undefined}
          className={cn(
            'rounded-full px-3 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg',
            o.key === selected && 'bg-surface text-fg shadow-xs dark:bg-surface-elevated',
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  )
}
