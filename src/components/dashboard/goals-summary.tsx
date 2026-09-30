import Link from 'next/link'
import { Target } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { EmptyState, Panel, SectionHeading } from '@/components/ui/misc'
import { formatMoney, formatPercent } from '@/domain/money'
import { goalStateLabel } from '@/domain/finance'
import type { DashboardData } from '@/features/dashboard/queries'

export function GoalsSummary({ data }: { data: DashboardData }) {
  return (
    <Panel className="h-full px-5 py-5 sm:px-6" aria-labelledby="goals-title">
      <SectionHeading
        id="goals-title"
        eyebrow="Metas"
        title="Onde vocês querem chegar"
        actions={
          <Link href="/metas" className="text-sm font-medium text-accent hover:underline">
            Ver todas
          </Link>
        }
      />
      {data.goals.length === 0 ? (
        <EmptyState icon={Target} title="Nenhuma meta ainda" description="Reserva de emergência, viagem, entrada do apartamento…" action={<Link href="/metas" className="text-sm font-medium text-accent hover:underline">Criar meta</Link>} className="py-6" />
      ) : (
        <ul className="flex flex-col gap-5">
          {data.goals.map(({ goal, progress }) => (
            <li key={goal.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-medium">{goal.name}</p>
                <p className="shrink-0 text-money text-sm">{formatPercent(progress.ratio)}</p>
              </div>
              <Progress className="mt-2" value={progress.ratio} tone={goal.tone} size="sm" label={`${goal.name}: ${formatPercent(progress.ratio)}`} />
              <p className="mt-1.5 text-caption">
                {formatMoney(goal.currentAmountCents, { hideCents: true })} de {formatMoney(goal.targetAmountCents, { hideCents: true })}
                {progress.monthlyNeededCents && progress.state !== 'completed' ? ` · ${formatMoney(progress.monthlyNeededCents, { hideCents: true })}/mês` : ''}
                {progress.state === 'behind' || progress.state === 'overdue' || progress.state === 'completed' ? ` · ${goalStateLabel(progress.state)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
