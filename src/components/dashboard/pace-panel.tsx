import { Progress } from '@/components/ui/progress'
import { Panel, SectionHeading, StatusDot } from '@/components/ui/misc'
import { formatMoney, formatPercent } from '@/domain/money'
import { classifyPace, paceLabel, type PaceStatus } from '@/domain/finance'
import type { DashboardData } from '@/features/dashboard/queries'
import { cn } from '@/lib/utils/cn'

const STATUS_TONE: Record<PaceStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  on_track: 'success',
  attention: 'warning',
  over: 'danger',
  no_plan: 'neutral',
  not_started: 'neutral',
}
const STATUS_TEXT: Record<PaceStatus, string> = {
  on_track: 'text-success',
  attention: 'text-warning',
  over: 'text-danger',
  no_plan: 'text-fg-muted',
  not_started: 'text-fg-muted',
}

export function PacePanel({ data }: { data: DashboardData }) {
  const { overview, progress } = data
  const rows = [
    ...overview.groups.filter((g) => !g.group.isSavings).map((g) => ({ id: g.group.id, name: g.group.name, spent: g.spentCents, planned: g.plannedCents, pace: g.pace, tone: g.group.tone })),
    ...overview.groups
      .flatMap((g) => g.categories.map((c) => ({ c, tone: g.group.tone })))
      .filter(({ c }) => c.plannedCents)
      .map(({ c, tone }) => ({
        id: c.category.id,
        name: c.category.name,
        spent: c.spentCents,
        planned: c.plannedCents ?? 0,
        pace: classifyPace({
          spentCents: c.spentCents,
          plannedCents: c.plannedCents ?? 0,
          elapsedRatio: progress.elapsedRatio,
          position: progress.position,
        }),
        tone,
        isCategory: true,
      })),
  ]

  return (
    <Panel className="px-5 py-5 sm:px-6" aria-labelledby="pace-title">
      <SectionHeading
        id="pace-title"
        eyebrow="Ritmo do mês"
        title={progress.position === 'past' ? 'Como o mês terminou' : 'Gastos contra o calendário'}
        actions={
          progress.position === 'current' ? (
            <div className="w-full sm:w-40 sm:text-right">
              <p className="text-sm font-semibold tabular">
                Dia {progress.elapsedDays} <span className="font-normal text-fg-muted">de {progress.totalDays}</span>
              </p>
              <Progress className="mt-1.5" value={progress.elapsedRatio} size="sm" tone="slate" label="Mês decorrido" />
              <p className="mt-1 text-caption">{formatPercent(progress.elapsedRatio)} do mês decorrido</p>
            </div>
          ) : null
        }
      />
      {!overview.hasPlan ? (
        <p className="py-6 text-secondary">O ritmo aparece quando o mês tem um planejamento.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-divider py-3 sm:grid-cols-[150px_minmax(0,1fr)_56px_120px]">
              <div className="min-w-0">
                <p className={cn('truncate text-sm font-medium', 'isCategory' in row && 'text-fg-muted')}>{row.name}</p>
                <p className="text-caption tabular">
                  {formatMoney(row.spent, { hideCents: true })} de {formatMoney(row.planned, { hideCents: true })}
                </p>
              </div>
              <span className={cn('flex items-center justify-end gap-1.5 text-xs font-semibold sm:order-last', STATUS_TEXT[row.pace.status])}>
                <StatusDot tone={STATUS_TONE[row.pace.status]} />
                {paceLabel(row.pace.status, progress.position)}
              </span>
              <Progress
                className="col-span-2 sm:col-span-1"
                value={row.pace.consumedRatio}
                marker={progress.position === 'current' ? progress.elapsedRatio : null}
                tone={row.tone}
                label={`${row.name}: ${formatPercent(row.pace.consumedRatio)} consumido`}
              />
              <span className="hidden text-right text-money text-sm sm:block">{formatPercent(row.pace.consumedRatio)}</span>
            </li>
          ))}
        </ul>
      )}
      {progress.position === 'current' && overview.hasPlan ? (
        <p className="mt-2 flex items-center justify-end gap-2 text-caption">
          <span aria-hidden className="inline-block h-3 w-px bg-[var(--pace-marker)]" /> marca o quanto do mês já passou
        </p>
      ) : null}
    </Panel>
  )
}
