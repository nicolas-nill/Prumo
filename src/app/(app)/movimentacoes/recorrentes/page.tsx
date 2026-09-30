import type { Metadata } from 'next'
import { Plus, Repeat } from 'lucide-react'
import { SectionTabs } from '@/components/layout/section-tabs'
import { PostDueButton } from '@/components/recurring/post-due-button'
import { RecurringDialog } from '@/components/recurring/recurring-dialog'
import { Button } from '@/components/ui/button'
import { CategoryIcon } from '@/components/ui/category-icon'
import { Badge, EmptyState, Panel, SectionHeading } from '@/components/ui/misc'
import { compareDates, formatDateShort, monthEnd, monthOf } from '@/domain/dates'
import { formatMoney } from '@/domain/money'
import { frequencyLabel } from '@/domain/finance'
import { upcomingOccurrences } from '@/features/recurring/service'
import { getSpaceContext, getTransactionReference } from '@/server/session'

export const metadata: Metadata = { title: 'Recorrentes' }

export default async function RecurringPage() {
  const { viewer, space, today } = await getSpaceContext()
  const [rules, reference] = await Promise.all([viewer.repo.listRecurring(space.id), getTransactionReference()])
  const categories = new Map(reference.categories.map((c) => [c.id, c]))
  const groups = new Map(reference.groups.map((g) => [g.id, g]))
  const due = rules.filter((r) => r.isActive && compareDates(r.nextOccurrenceOn, today) <= 0).length
  const upcoming = upcomingOccurrences(rules, today, monthEnd(monthOf(today)))
  const upcomingExpense = upcoming.filter((u) => u.rule.type === 'expense').reduce((a, u) => a + u.rule.amountCents, 0)
  const upcomingIncome = upcoming.filter((u) => u.rule.type === 'income').reduce((a, u) => a + u.rule.amountCents, 0)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 pt-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-eyebrow mb-2">Movimentações</p>
          <h1 className="text-page-title">Recorrentes</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <PostDueButton dueCount={due} />
          <RecurringDialog
            reference={reference}
            trigger={
              <Button variant="secondary">
                <Plus aria-hidden /> Nova recorrência
              </Button>
            }
          />
        </div>
      </header>

      <SectionTabs
        label="Tipo de lançamento"
        tabs={[
          { href: '/movimentacoes', label: 'Lançamentos' },
          { href: '/movimentacoes/recorrentes', label: 'Recorrentes' },
        ]}
      />

      {rules.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Repeat}
            title="Nenhuma recorrência cadastrada"
            description="Cadastre aluguel, salário, academia e assinaturas uma vez. O PRUMO lança em cada vencimento e prevê o mês."
            action={<RecurringDialog reference={reference} trigger={<Button>Cadastrar a primeira</Button>} />}
          />
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <Panel className="px-2 py-3 sm:px-3">
            <ul>
              {rules.map((rule) => {
                const category = rule.categoryId ? categories.get(rule.categoryId) : undefined
                const tone = category?.tone ?? (category?.groupId ? groups.get(category.groupId)?.tone : undefined) ?? (rule.type === 'income' ? 'sage' : 'slate')
                return (
                  <li key={rule.id} className="border-t border-divider first:border-t-0">
                    <RecurringDialog
                      reference={reference}
                      rule={rule}
                      trigger={
                        <button type="button" className="flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left transition-colors hover:bg-surface-muted">
                          <CategoryIcon icon={category?.icon ?? null} tone={tone} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[0.9375rem] font-medium">{rule.description}</span>
                              {!rule.isActive ? <Badge>Pausada</Badge> : null}
                            </span>
                            <span className="block truncate text-caption">
                              {frequencyLabel(rule.frequency, rule.interval)} · próximo {formatDateShort(rule.nextOccurrenceOn, today)}
                              {category ? ` · ${category.name}` : ''}
                            </span>
                          </span>
                          <span className={`text-money ${rule.type === 'income' ? 'text-success' : ''}`}>
                            {rule.type === 'income' ? '+' : ''}
                            {formatMoney(rule.amountCents)}
                          </span>
                        </button>
                      }
                    />
                  </li>
                )
              })}
            </ul>
          </Panel>
          <Panel className="h-fit px-5 py-5">
            <SectionHeading eyebrow="Até o fim do mês" title="Previsto" />
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-caption">Saídas</dt>
                <dd className="text-figure text-xl">{formatMoney(upcomingExpense, { hideCents: true })}</dd>
              </div>
              <div>
                <dt className="text-caption">Entradas</dt>
                <dd className="text-figure text-xl text-success">{formatMoney(upcomingIncome, { hideCents: true })}</dd>
              </div>
            </dl>
            {upcoming.length ? (
              <ul className="mt-5 flex flex-col gap-2 border-t border-divider pt-4">
                {upcoming.slice(0, 8).map((u) => (
                  <li key={`${u.rule.id}-${u.date}`} className="flex justify-between gap-3 text-sm">
                    <span className="truncate">
                      <span className="text-fg-muted tabular">{formatDateShort(u.date, today)}</span> · {u.rule.description}
                    </span>
                    <span className="text-money">{formatMoney(u.rule.amountCents)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-secondary">Nada previsto até o fim do mês.</p>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}
