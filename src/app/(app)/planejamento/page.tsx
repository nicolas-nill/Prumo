import type { Metadata } from 'next'
import { MonthSwitcher } from '@/components/layout/period-controls'
import { PlanEditor } from '@/components/planning/plan-editor'
import { StartPlan } from '@/components/planning/start-plan'
import { addMonths, formatMonthLong, monthEnd, monthOf, monthProgress, monthStart } from '@/domain/dates'
import { resolveMonth } from '@/features/dashboard/params'
import { getReferenceData, getSpaceContext } from '@/server/session'

export const metadata: Metadata = { title: 'Planejamento' }

export default async function PlanningPage({ searchParams }: PageProps<'/planejamento'>) {
  const params = await searchParams
  const { viewer, space, today } = await getSpaceContext()
  const month = resolveMonth(params, today)
  const previousMonth = addMonths(month, -1)
  const [plan, previousPlan, totals, ref] = await Promise.all([
    viewer.repo.getPlan(space.id, month),
    viewer.repo.getPlan(space.id, previousMonth),
    viewer.repo.categoryTotals(space.id, monthStart(month), monthEnd(month)),
    getReferenceData(space.id),
  ])
  const actualIncomeCents = totals.filter((t) => t.type === 'income').reduce((a, t) => a + t.totalCents, 0)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 pt-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-eyebrow mb-2">Planejamento</p>
          <h1 className="text-page-title">{formatMonthLong(month)}</h1>
          <p className="mt-2 max-w-2xl text-secondary">Previsto, realizado e o que resta — por grupo e por categoria. O modelo é seu: ajuste os percentuais como fizer sentido.</p>
        </div>
        <MonthSwitcher pathname="/planejamento" params={params} month={month} currentMonth={monthOf(today)} />
      </header>

      {plan ? (
        <PlanEditor
          key={`${plan.id}-${month}`}
          month={month}
          plan={plan}
          groups={ref.groups}
          categories={ref.categories.filter((c) => c.kind === 'expense')}
          totals={totals}
          progress={monthProgress(month, today)}
          actualIncomeCents={actualIncomeCents}
        />
      ) : (
        <StartPlan month={month} previousMonth={previousMonth} hasPrevious={previousPlan !== null} suggestedIncomeCents={previousPlan?.expectedIncomeCents ?? actualIncomeCents} />
      )}
    </div>
  )
}
