import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { SectionHeading } from '@/components/ui/misc'
import { toneSoft } from '@/components/ui/tone'
import { formatMoney, formatPercent } from '@/domain/money'
import type { DashboardData } from '@/features/dashboard/queries'
import { cn } from '@/lib/utils/cn'

export function PlanSection({ data, planHref }: { data: DashboardData; planHref: string }) {
  const { overview, progress } = data
  if (!overview.hasPlan) {
    return (
      <section aria-labelledby="plan-title" className="rounded-[18px] border border-dashed border-border-strong px-6 py-8">
        <p className="text-eyebrow mb-1.5">Planejamento da renda</p>
        <h2 id="plan-title" className="text-section-title">
          Defina quanto vai para cada parte da vida
        </h2>
        <p className="mt-1.5 max-w-lg text-secondary">
          Com um plano, o PRUMO mostra o ritmo do mês e quanto ainda dá para gastar. Comece pelo modelo sugerido e ajuste como quiser.
        </p>
        <Link href={planHref} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
          Montar o plano do mês <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    )
  }

  return (
    <section aria-labelledby="plan-title">
      <SectionHeading
        id="plan-title"
        eyebrow="Planejamento da renda"
        title="O plano do mês"
        actions={
          <div className="flex items-center gap-5">
            <span className="text-caption sm:text-right">
              {overview.unallocatedCents >= 0 ? 'Livre para distribuir' : 'Acima da renda'}
              <span className={cn('block text-money text-[0.9375rem] text-fg', overview.unallocatedCents < 0 && 'text-danger')}>
                {formatMoney(Math.abs(overview.unallocatedCents))}
              </span>
            </span>
            <Link href={planHref} className="text-sm font-medium text-accent hover:underline">
              Ajustar
            </Link>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {overview.groups.map((g) => {
          const consumed = g.pace.consumedRatio
          return (
            <article key={g.group.id} className={cn('rounded-[16px] px-4 py-3.5 sm:px-5 sm:py-4', toneSoft(g.group.tone))}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[0.8125rem] font-semibold text-fg-muted">{g.group.name}</h3>
                  <p className="mt-0.5 text-figure text-[1.25rem] text-fg sm:text-[1.375rem]">{formatMoney(g.plannedCents, { hideCents: true })}</p>
                </div>
                <span className="text-figure text-[0.9375rem]">{formatPercent(g.incomeShare)}</span>
              </div>
              <Progress
                className="mt-3 bg-surface/60 sm:mt-4 dark:bg-bg/40"
                value={consumed}
                marker={progress.position === 'current' ? progress.elapsedRatio : null}
                tone={g.group.tone}
                size="sm"
                label={`${g.group.name}: ${formatPercent(consumed)} do planejado`}
              />
              <p className="mt-2.5 flex items-baseline justify-between gap-2 text-xs text-fg-muted">
                <span>
                  {g.group.isSavings ? 'Aportado' : 'Gasto'} <strong className="font-semibold text-fg tabular">{formatMoney(g.spentCents, { hideCents: true })}</strong>
                </span>
                <span className={cn('tabular', g.remainingCents < 0 && 'font-semibold text-danger')}>
                  {g.remainingCents >= 0 ? `Resta ${formatMoney(g.remainingCents, { hideCents: true })}` : `Passou ${formatMoney(-g.remainingCents, { hideCents: true })}`}
                </span>
              </p>
            </article>
          )
        })}
      </div>
    </section>
  )
}
