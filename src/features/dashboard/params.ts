import { isMonthKey, monthOf } from '@/domain/dates'
import type { ISODate, MonthKey, SpaceWithMembers } from '@/domain/types'
import type { Perspective } from '@/server/data/contracts'

type SearchParams = Record<string, string | string[] | undefined>

/** ?mes=YYYY-MM — defaults to the current month in the space timezone. */
export function resolveMonth(params: SearchParams, today: ISODate): MonthKey {
  const raw = params.mes
  return typeof raw === 'string' && isMonthKey(raw) ? raw : monthOf(today)
}

export interface PerspectiveOption {
  key: string
  label: string
}

/** ?visao=todos|eu|<memberId> — whose transactions to consider (shared spaces only). */
export function resolvePerspective(params: SearchParams, space: SpaceWithMembers, viewerId: string) {
  const options: PerspectiveOption[] =
    space.type === 'shared' && space.members.length > 1
      ? [
          { key: 'todos', label: 'Todos' },
          { key: 'eu', label: 'Eu' },
          ...space.members.filter((m) => m.userId !== viewerId).map((m) => ({ key: m.userId, label: m.fullName.split(' ')[0] ?? m.fullName })),
        ]
      : []
  const raw = typeof params.visao === 'string' ? params.visao : 'todos'
  const selected = options.find((o) => o.key === raw)?.key ?? 'todos'
  const perspective: Perspective =
    selected === 'todos' ? {} : { memberId: selected === 'eu' ? viewerId : selected }
  return { options, selected, perspective, filtered: selected !== 'todos' }
}

/** Builds a URL keeping current params and applying overrides (null removes a key). */
export function hrefWith(pathname: string, params: SearchParams, overrides: Record<string, string | null>): string {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value) next.set(key, value)
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) next.delete(key)
    else next.set(key, value)
  }
  const qs = next.toString()
  return qs ? `${pathname}?${qs}` : pathname
}
