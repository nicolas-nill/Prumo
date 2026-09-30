import type { Metadata } from 'next'
import { Plus, Target } from 'lucide-react'
import { ContributionDialog, GoalDialog } from '@/components/goals/goal-dialogs'
import { GoalStatusMenu } from '@/components/goals/goal-status-menu'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge, EmptyState, Panel, SectionHeading } from '@/components/ui/misc'
import { formatDateBR } from '@/domain/dates'
import { formatMoney, formatPercent } from '@/domain/money'
import { goalProgress, goalStateLabel, type GoalProgress } from '@/domain/finance'
import type { Goal } from '@/domain/types'
import { getSpaceContext } from '@/server/session'

export const metadata: Metadata = { title: 'Metas' }

const STATE_TONE = { completed: 'success', on_track: 'success', behind: 'warning', overdue: 'danger', no_deadline: 'neutral', archived: 'neutral' } as const

export default async function GoalsPage() {
  const { viewer, space, today } = await getSpaceContext()
  const goals = (await viewer.repo.listGoals(space.id)).map((goal) => ({ goal, progress: goalProgress(goal, today) }))
  const active = goals.filter((g) => g.goal.status === 'active')
  const completed = goals.filter((g) => g.goal.status === 'completed')
  const archived = goals.filter((g) => g.goal.status === 'archived')
  const saved = active.reduce((a, g) => a + g.goal.currentAmountCents, 0)
  const target = active.reduce((a, g) => a + g.goal.targetAmountCents, 0)
  const monthly = active.reduce((a, g) => a + (g.progress.monthlyNeededCents ?? 0), 0)
  const shared = space.type === 'shared'
  const newGoal = (
    <GoalDialog
      shared={shared}
      trigger={
        <Button>
          <Plus aria-hidden /> Nova meta
        </Button>
      }
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 pt-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-eyebrow mb-2">Metas</p>
          <h1 className="text-page-title">Onde vocês querem chegar</h1>
        </div>
        {goals.length ? newGoal : null}
      </header>

      {goals.length === 0 ? (
        <Panel>
          <EmptyState icon={Target} title="Comece por uma reserva de emergência" description="Metas ficam visíveis no painel e mostram quanto guardar por mês para chegar no prazo." action={newGoal} />
        </Panel>
      ) : (
        <>
          {active.length ? (
            <section aria-label="Resumo das metas" className="grid grid-cols-2 gap-4 rounded-[18px] border border-border bg-surface p-5 sm:grid-cols-3 sm:p-6">
              <div>
                <p className="text-eyebrow">Guardado</p>
                <p className="mt-2 text-figure text-2xl">{formatMoney(saved, { hideCents: true })}</p>
                <p className="text-caption">de {formatMoney(target, { hideCents: true })} nas metas ativas</p>
              </div>
              <div>
                <p className="text-eyebrow">Para manter o prazo</p>
                <p className="mt-2 text-figure text-2xl">{formatMoney(monthly, { hideCents: true })}</p>
                <p className="text-caption">por mês, somando as metas com prazo</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-eyebrow">Progresso geral</p>
                <p className="mt-2 text-figure text-2xl">{formatPercent(target ? saved / target : 0)}</p>
                <Progress className="mt-2" value={target ? saved / target : 0} label="Progresso geral das metas" size="sm" />
              </div>
            </section>
          ) : null}

          {active.length ? (
            <section aria-labelledby="active-goals">
              <SectionHeading id="active-goals" title="Em andamento" />
              <div className="grid gap-3 md:grid-cols-2">
                {active.map(({ goal, progress }) => (
                  <GoalCard key={goal.id} goal={goal} progress={progress} today={today} shared={shared} memberName={space.members.find((m) => m.userId === goal.ownerId)?.fullName} />
                ))}
              </div>
            </section>
          ) : null}

          {completed.length ? (
            <section aria-labelledby="completed-goals">
              <SectionHeading id="completed-goals" title="Concluídas" />
              <div className="grid gap-3 md:grid-cols-2">
                {completed.map(({ goal, progress }) => (
                  <GoalCard key={goal.id} goal={goal} progress={progress} today={today} shared={shared} memberName={space.members.find((m) => m.userId === goal.ownerId)?.fullName} />
                ))}
              </div>
            </section>
          ) : null}

          {archived.length ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-fg-muted hover:text-fg">Arquivadas ({archived.length})</summary>
              <ul className="mt-3 flex flex-col gap-2">
                {archived.map(({ goal }) => (
                  <li key={goal.id} className="flex items-center justify-between rounded-[12px] border border-border bg-surface px-4 py-3">
                    <span>
                      {goal.name} <span className="text-caption">· {formatMoney(goal.currentAmountCents)} guardados</span>
                    </span>
                    <GoalStatusMenu goalId={goal.id} status={goal.status} name={goal.name} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </div>
  )
}

function GoalCard({ goal, progress, today, shared, memberName }: { goal: Goal; progress: GoalProgress; today: string; shared: boolean; memberName?: string }) {
  return (
    <article className="flex flex-col rounded-[18px] border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-card-title">{goal.name}</h3>
          <p className="mt-0.5 text-caption">
            {goal.targetDate ? `Até ${formatDateBR(goal.targetDate)}` : 'Sem prazo'}
            {shared ? ` · ${goal.scope === 'shared' ? 'Meta do casal' : `Meta de ${memberName?.split(' ')[0] ?? 'membro'}`}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Badge tone={STATE_TONE[progress.state]}>{goalStateLabel(progress.state)}</Badge>
          <GoalStatusMenu goalId={goal.id} status={goal.status} name={goal.name} />
        </div>
      </div>
      <div className="mt-5 flex items-baseline justify-between gap-3">
        <p className="text-figure text-2xl">{formatMoney(goal.currentAmountCents, { hideCents: true })}</p>
        <p className="text-sm text-fg-muted tabular">de {formatMoney(goal.targetAmountCents, { hideCents: true })}</p>
      </div>
      <Progress className="mt-3" value={progress.ratio} tone={goal.tone} label={`${goal.name}: ${formatPercent(progress.ratio)}`} />
      <p className="mt-2.5 text-caption">
        {progress.state === 'completed'
          ? 'Meta atingida.'
          : progress.monthlyNeededCents
            ? `Faltam ${formatMoney(progress.remainingCents, { hideCents: true })} · ${formatMoney(progress.monthlyNeededCents, { hideCents: true })} por mês${progress.monthsLeft ? ` por ${progress.monthsLeft} ${progress.monthsLeft === 1 ? 'mês' : 'meses'}` : ''}`
            : `Faltam ${formatMoney(progress.remainingCents, { hideCents: true })}`}
      </p>
      <div className="mt-4 flex gap-2 border-t border-divider pt-4">
        <ContributionDialog goal={goal} today={today} trigger={<Button size="sm" variant="secondary">Registrar aporte</Button>} />
        <GoalDialog goal={goal} shared={shared} trigger={<Button size="sm" variant="ghost">Editar</Button>} />
      </div>
    </article>
  )
}
