import { describe, expect, it } from 'vitest'
import { monthProgress } from '@/domain/dates'
import {
  availableToSpend,
  buildInsights,
  buildPlanOverview,
  classifyPace,
  distributeByGroup,
  indexCategories,
  presetForGroups,
  rankExpenseCategories,
  resolveGroupPlanned,
  summarize,
  type CategoryTotal,
} from '@/domain/finance'
import type { Category, CategoryGroup, MonthlyPlan } from '@/domain/types'

const SPACE = 'space-1'
const groups: CategoryGroup[] = [
  { id: 'g-needs', spaceId: SPACE, key: 'essentials', name: 'Necessidades', tone: 'blue', sortOrder: 1, isSavings: false, isSystem: true },
  { id: 'g-live', spaceId: SPACE, key: 'lifestyle', name: 'Viver', tone: 'rose', sortOrder: 2, isSavings: false, isSystem: true },
  { id: 'g-save', spaceId: SPACE, key: 'savings', name: 'Investimentos', tone: 'lilac', sortOrder: 3, isSavings: true, isSystem: true },
]
const cat = (id: string, name: string, groupId: string | null, kind: 'income' | 'expense' = 'expense'): Category => ({
  id,
  spaceId: SPACE,
  groupId,
  name,
  kind,
  icon: null,
  tone: null,
  isActive: true,
  isSystem: true,
  sortOrder: 1,
})
const categories: Category[] = [
  cat('c-salary', 'Salário', null, 'income'),
  cat('c-market', 'Mercado', 'g-needs'),
  cat('c-rent', 'Moradia', 'g-needs'),
  cat('c-rest', 'Restaurantes', 'g-live'),
  cat('c-invest', 'Investimentos', 'g-save'),
  cat('c-other', 'Outros', null),
]
const index = indexCategories(categories, groups)

const totals: CategoryTotal[] = [
  { categoryId: 'c-salary', type: 'income', totalCents: 1_000_000, count: 1 },
  { categoryId: 'c-market', type: 'expense', totalCents: 120_000, count: 6 },
  { categoryId: 'c-rent', type: 'expense', totalCents: 250_000, count: 1 },
  { categoryId: 'c-rest', type: 'expense', totalCents: 90_000, count: 5 },
  { categoryId: 'c-invest', type: 'expense', totalCents: 100_000, count: 1 },
  { categoryId: 'c-other', type: 'expense', totalCents: 10_000, count: 1 },
]

describe('summarize', () => {
  it('separates consumption from aportes and computes the savings rate', () => {
    const s = summarize(totals, index)
    expect(s.incomeCents).toBe(1_000_000)
    expect(s.expenseCents).toBe(470_000)
    expect(s.savingsCents).toBe(100_000)
    expect(s.resultCents).toBe(530_000)
    expect(s.freeCashCents).toBe(430_000)
    expect(s.savingsRate).toBeCloseTo(0.53)
  })
  it('has no savings rate without income', () => {
    expect(summarize([{ categoryId: 'c-market', type: 'expense', totalCents: 100, count: 1 }], index).savingsRate).toBeNull()
  })
})

describe('ranking and distribution', () => {
  it('ranks consumption only', () => {
    const r = rankExpenseCategories(totals, index)
    expect(r.map((x) => x.name)).toEqual(['Moradia', 'Mercado', 'Restaurantes', 'Outros'])
    expect(r[0]!.share).toBeCloseTo(250_000 / 470_000)
  })
  it('groups spending in few slices', () => {
    const d = distributeByGroup(totals, index)
    expect(d.map((x) => x.label)).toEqual(['Necessidades', 'Viver', 'Investimentos', 'Sem grupo'])
    expect(d.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1)
  })
})

describe('classifyPace (ritmo do mês)', () => {
  const current = (spent: number, planned: number, elapsed: number) =>
    classifyPace({ spentCents: spent, plannedCents: planned, elapsedRatio: elapsed, position: 'current' }).status

  it('is on track when consumption ≤ elapsed + 5 p.p.', () => {
    expect(current(5_000, 10_000, 0.5)).toBe('on_track')
    expect(current(5_500, 10_000, 0.5)).toBe('on_track')
  })
  it('flags attention between +5 and +15 p.p.', () => {
    expect(current(6_000, 10_000, 0.5)).toBe('attention')
    expect(current(6_500, 10_000, 0.5)).toBe('attention')
  })
  it('is over pace beyond +15 p.p. or when the budget is exceeded', () => {
    expect(current(6_600, 10_000, 0.5)).toBe('over')
    expect(current(10_100, 10_000, 0.99)).toBe('over')
  })
  it('has no pace without a plan, and judges past months against 100%', () => {
    expect(current(100, 0, 0.5)).toBe('no_plan')
    expect(classifyPace({ spentCents: 9_000, plannedCents: 10_000, elapsedRatio: 1, position: 'past' }).status).toBe('on_track')
    expect(classifyPace({ spentCents: 11_000, plannedCents: 10_000, elapsedRatio: 1, position: 'past' }).status).toBe('over')
  })
})

describe('plan overview', () => {
  const plan: MonthlyPlan = {
    id: 'p1',
    spaceId: SPACE,
    month: '2026-09',
    expectedIncomeCents: 1_000_000,
    groups: presetForGroups(groups),
    categories: [{ categoryId: 'c-rest', amountCents: 100_000 }],
  }
  const progress = monthProgress('2026-09', '2026-09-15')
  const overview = buildPlanOverview({ month: '2026-09', plan, groups, categories, totals, index, progress })

  it('resolves percent and amount allocations', () => {
    expect(resolveGroupPlanned({ groupId: 'x', mode: 'percent', percentBp: 5000, amountCents: null }, 1_000_000)).toBe(500_000)
    expect(resolveGroupPlanned({ groupId: 'x', mode: 'amount', percentBp: null, amountCents: 42_00 }, 1_000_000)).toBe(4_200)
  })

  it('uses the 50/40/10 preset as a suggestion', () => {
    expect(overview.groups.map((g) => g.plannedCents)).toEqual([500_000, 400_000, 100_000])
    expect(overview.unallocatedCents).toBe(0)
    expect(overview.plannedSpendingCents).toBe(900_000)
  })

  it('computes planned vs actual per group and category', () => {
    const needs = overview.groups[0]!
    expect(needs.spentCents).toBe(370_000)
    expect(needs.remainingCents).toBe(130_000)
    const rest = overview.groups[1]!.categories.find((c) => c.category.id === 'c-rest')!
    expect(rest.remainingCents).toBe(10_000)
    expect(overview.ungroupedSpentCents).toBe(10_000)
  })

  it('computes how much is left to spend per day', () => {
    const summary = summarize(totals, index)
    const available = availableToSpend(overview, summary.expenseCents, summary, progress)
    expect(available.basis).toBe('plan')
    expect(available.availableCents).toBe(900_000 - 470_000)
    expect(available.perDayCents).toBe(Math.floor(430_000 / 16))
  })

  it('builds deterministic insights from real numbers', () => {
    const summary = summarize(totals, index)
    const insights = buildInsights({
      progress,
      summary,
      overview,
      ranking: rankExpenseCategories(totals, index),
      previous: { ...summary, expenseCents: 600_000 },
      previousMonth: '2026-08',
    })
    expect(insights[0]!.text).toBe('Você já usou 90% do orçamento de Restaurantes com 50% do mês decorrido.')
    expect(insights.some((i) => i.id === 'vs-previous' && i.tone === 'positive')).toBe(true)
  })
})
