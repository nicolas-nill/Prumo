'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'
import { Progress } from '@/components/ui/progress'
import { Segmented } from '@/components/ui/segmented'
import { toneSolid } from '@/components/ui/tone'
import { controlClass } from '@/components/ui/input'
import type { MonthProgress } from '@/domain/dates'
import { buildPlanOverview, indexCategories, paceLabel, type CategoryTotal } from '@/domain/finance'
import { formatMoney, formatPercent } from '@/domain/money'
import type { Category, CategoryBudget, CategoryGroup, GroupBudget, MonthlyPlan } from '@/domain/types'
import { savePlanAction } from '@/features/planning/actions'
import { cn } from '@/lib/utils/cn'

interface PlanEditorProps {
  month: string
  plan: MonthlyPlan
  groups: CategoryGroup[]
  categories: Category[]
  totals: CategoryTotal[]
  progress: MonthProgress
  actualIncomeCents: number
}

function PercentInput({ bp, onChange, label }: { bp: number; onChange: (bp: number) => void; label: string }) {
  const [text, setText] = useState(() => String(bp / 100).replace('.', ','))
  return (
    <div className="relative w-24">
      <input
        aria-label={label}
        inputMode="decimal"
        className={cn(controlClass, 'tabular h-9 pr-7 text-right font-medium')}
        value={text}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d,.]/g, '')
          setText(next)
          const value = Number(next.replace(',', '.'))
          if (Number.isFinite(value)) onChange(Math.min(10_000, Math.max(0, Math.round(value * 100))))
        }}
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-fg-muted">
        %
      </span>
    </div>
  )
}

export function PlanEditor({ month, plan, groups, categories, totals, progress, actualIncomeCents }: PlanEditorProps) {
  const [income, setIncome] = useState(plan.expectedIncomeCents)
  const [groupBudgets, setGroupBudgets] = useState<GroupBudget[]>(() =>
    groups.map((g) => plan.groups.find((b) => b.groupId === g.id) ?? { groupId: g.id, mode: 'percent', percentBp: 0, amountCents: null }),
  )
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudget[]>(plan.categories)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()

  const index = useMemo(() => indexCategories(categories, groups), [categories, groups])
  const overview = useMemo(
    () =>
      buildPlanOverview({
        month,
        plan: { ...plan, expectedIncomeCents: income, groups: groupBudgets, categories: categoryBudgets },
        groups,
        categories,
        totals,
        index,
        progress,
      }),
    [month, plan, income, groupBudgets, categoryBudgets, groups, categories, totals, index, progress],
  )

  const touch = () => setDirty(true)
  const updateGroup = (groupId: string, patch: Partial<GroupBudget>) => {
    setGroupBudgets((list) => list.map((g) => (g.groupId === groupId ? { ...g, ...patch } : g)))
    touch()
  }
  const setCategoryAmount = (categoryId: string, amountCents: number | null) => {
    setCategoryBudgets((list) => {
      const rest = list.filter((c) => c.categoryId !== categoryId)
      return amountCents ? [...rest, { categoryId, amountCents }] : rest
    })
    touch()
  }

  const allocatedShare = income > 0 ? overview.plannedTotalCents / income : 0
  const save = () =>
    start(async () => {
      const result = await savePlanAction({ month, expectedIncomeCents: income, groups: groupBudgets, categories: categoryBudgets })
      if (!result.ok) return void toast.error(result.error.message)
      setDirty(false)
      toast.success('Planejamento salvo.')
    })

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Resumo do planejamento" className="grid gap-4 rounded-[18px] border border-border bg-surface p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
        <div>
          <label htmlFor="expected-income" className="text-eyebrow">
            Receita prevista
          </label>
          <div className="mt-2 max-w-[220px]">
            <MoneyInput id="expected-income" value={income} onValueChange={(c) => (setIncome(c ?? 0), touch())} />
          </div>
        </div>
        <div>
          <p className="text-eyebrow">Distribuído</p>
          <p className="mt-2 text-figure text-2xl">{formatMoney(overview.plannedTotalCents, { hideCents: true })}</p>
          <p className="text-caption">{formatPercent(allocatedShare, 1)} da receita prevista</p>
        </div>
        <div>
          <p className="text-eyebrow">{overview.unallocatedCents >= 0 ? 'Livre para distribuir' : 'Acima da receita'}</p>
          <p className={cn('mt-2 text-figure text-2xl', overview.unallocatedCents < 0 && 'text-danger')}>
            {formatMoney(Math.abs(overview.unallocatedCents), { hideCents: true })}
          </p>
          <p className="text-caption">{overview.unallocatedCents < 0 ? 'Reduza algum grupo para fechar a conta.' : 'Sobras podem virar investimento.'}</p>
        </div>
        <div>
          <p className="text-eyebrow">Recebido no mês</p>
          <p className="mt-2 text-figure text-2xl text-success">{formatMoney(actualIncomeCents, { hideCents: true })}</p>
          <p className="text-caption">{income > 0 ? `${formatPercent(actualIncomeCents / income)} do previsto` : 'Defina a receita prevista'}</p>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-[4px] bg-track" role="img" aria-label="Distribuição da receita entre os grupos">
            {overview.groups.map((g) =>
              g.plannedCents > 0 && income > 0 ? (
                <div key={g.group.id} className={cn('h-full', toneSolid(g.group.tone))} style={{ width: `${Math.min(1, g.plannedCents / Math.max(income, overview.plannedTotalCents)) * 100}%` }} />
              ) : null,
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {overview.groups.map((g) => {
          const budget = groupBudgets.find((b) => b.groupId === g.group.id)!
          const isOpen = expanded === g.group.id
          const categoryCount = g.categories.filter((c) => c.plannedCents).length
          return (
            <section key={g.group.id} aria-labelledby={`group-${g.group.id}`} className="overflow-hidden rounded-[18px] border border-border bg-surface">
              <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)] lg:items-center">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <span aria-hidden className={cn('size-3 shrink-0 rounded-full', toneSolid(g.group.tone))} />
                  <div className="min-w-[120px] flex-1">
                    <h2 id={`group-${g.group.id}`} className="text-card-title">
                      {g.group.name}
                      {g.group.isSavings ? <span className="ml-2 text-caption font-normal">aportes</span> : null}
                    </h2>
                    <p className="text-caption tabular">
                      {formatMoney(g.plannedCents)} · {formatPercent(g.incomeShare, 1)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Segmented
                      size="sm"
                      label={`Forma de definir ${g.group.name}`}
                      value={budget.mode}
                      onChange={(mode) =>
                        updateGroup(g.group.id, mode === 'percent'
                          ? { mode, percentBp: income > 0 ? Math.round((g.plannedCents / income) * 10_000) : 0, amountCents: null }
                          : { mode, amountCents: g.plannedCents, percentBp: null })
                      }
                      options={[
                        { value: 'percent', label: '%' },
                        { value: 'amount', label: 'R$' },
                      ]}
                    />
                    {budget.mode === 'percent' ? (
                      <PercentInput key={`p-${g.group.id}-${budget.mode}`} bp={budget.percentBp ?? 0} label={`Percentual de ${g.group.name}`} onChange={(bp) => updateGroup(g.group.id, { percentBp: bp })} />
                    ) : (
                      <div className="w-36">
                        <MoneyInput value={budget.amountCents} onValueChange={(c) => updateGroup(g.group.id, { amountCents: c ?? 0 })} aria-label={`Valor de ${g.group.name}`} className="h-9" />
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-fg-muted">
                      {g.group.isSavings ? 'Aportado' : 'Realizado'} <span className="text-money text-fg">{formatMoney(g.spentCents)}</span>
                    </span>
                    <span className={cn('tabular', g.remainingCents < 0 ? 'font-semibold text-danger' : 'text-fg-muted')}>
                      {g.remainingCents >= 0 ? `Restam ${formatMoney(g.remainingCents)}` : `Passou ${formatMoney(-g.remainingCents)}`}
                    </span>
                  </div>
                  <Progress
                    value={g.pace.consumedRatio}
                    marker={progress.position === 'current' ? progress.elapsedRatio : null}
                    tone={g.group.tone}
                    label={`${g.group.name}: ${formatPercent(g.pace.consumedRatio)} realizado`}
                  />
                  <p className="mt-2 text-caption">{g.plannedCents > 0 ? paceLabel(g.pace.status, progress.position) : 'Sem valor planejado'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : g.group.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between border-t border-divider px-5 py-3 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg sm:px-6"
              >
                <span>
                  Limites por categoria{categoryCount ? ` · ${categoryCount} definidos` : ''}
                  {g.categoryPlannedCents > g.plannedCents && g.plannedCents > 0 ? <span className="ml-2 text-danger">acima do grupo</span> : null}
                </span>
                <ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} aria-hidden />
              </button>
              {isOpen ? (
                <div className="bg-surface-muted px-5 py-2 sm:px-6">
                  <ul>
                    {g.categories.map((c) => (
                      <li key={c.category.id} className="grid grid-cols-[minmax(0,1fr)_132px] items-center gap-3 border-b border-divider/70 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_150px]">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-fg">{c.category.name}</p>
                          <p className="text-caption tabular">
                            {formatMoney(c.spentCents)} {c.plannedCents ? `de ${formatMoney(c.plannedCents)}` : 'no mês'}
                          </p>
                        </div>
                        <div className="hidden sm:block">
                          {c.plannedCents ? <Progress value={c.consumedRatio} tone={g.group.tone} size="sm" label={`${c.category.name}: ${formatPercent(c.consumedRatio)}`} /> : null}
                        </div>
                        <MoneyInput
                          value={categoryBudgets.find((b) => b.categoryId === c.category.id)?.amountCents ?? null}
                          onValueChange={(cents) => setCategoryAmount(c.category.id, cents)}
                          aria-label={`Limite de ${c.category.name}`}
                          className="h-9 bg-surface"
                        />
                      </li>
                    ))}
                  </ul>
                  <p className="py-2 text-caption text-fg-muted">
                    Distribuído nas categorias: {formatMoney(g.categoryPlannedCents)} de {formatMoney(g.plannedCents)}. Categorias sem limite ficam livres dentro do grupo.
                  </p>
                </div>
              ) : null}
            </section>
          )
        })}
      </div>

      <div
        className={cn(
          'sticky bottom-20 z-20 flex items-center justify-between gap-3 rounded-[14px] border border-border bg-surface-elevated px-4 py-3 shadow-md transition-all duration-200 lg:bottom-4',
          dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
        )}
        aria-hidden={!dirty}
      >
        <p className="text-sm text-fg-muted">Alterações não salvas</p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => window.location.reload()} tabIndex={dirty ? 0 : -1}>
            Descartar
          </Button>
          <Button size="sm" loading={pending} onClick={save} tabIndex={dirty ? 0 : -1}>
            Salvar plano
          </Button>
        </div>
      </div>
    </div>
  )
}
