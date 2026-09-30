import { applyBasisPoints } from '../money'
import type { MonthProgress } from '../dates'
import type { Category, CategoryGroup, GroupBudget, MonthKey, MonthlyPlan, UUID } from '../types'
import { classifyPace, type PaceResult } from './pace'
import type { CategoryIndex, CategoryTotal } from './summary'

/** Planned value of a group: percent of expected income (basis points) or a fixed amount. */
export function resolveGroupPlanned(budget: GroupBudget | undefined, expectedIncomeCents: number): number {
  if (!budget) return 0
  if (budget.mode === 'percent') return applyBasisPoints(expectedIncomeCents, budget.percentBp ?? 0)
  return budget.amountCents ?? 0
}

export interface PlanCategoryView {
  category: Category
  plannedCents: number | null
  spentCents: number
  remainingCents: number | null
  consumedRatio: number | null
}

export interface PlanGroupView {
  group: CategoryGroup
  budget: GroupBudget | null
  plannedCents: number
  /** Planned ÷ expected income. */
  incomeShare: number | null
  spentCents: number
  remainingCents: number
  pace: PaceResult
  categories: PlanCategoryView[]
  /** Sum of category budgets inside the group. */
  categoryPlannedCents: number
}

export interface PlanOverview {
  month: MonthKey
  hasPlan: boolean
  expectedIncomeCents: number
  plannedTotalCents: number
  plannedSpendingCents: number
  plannedSavingsCents: number
  /** Expected income not yet distributed among groups. Negative = over-allocated. */
  unallocatedCents: number
  groups: PlanGroupView[]
  /** Spending in categories outside every group. */
  ungroupedSpentCents: number
  overall: PaceResult
}

interface BuildPlanInput {
  month: MonthKey
  plan: MonthlyPlan | null
  groups: CategoryGroup[]
  categories: Category[]
  totals: CategoryTotal[]
  index: CategoryIndex
  progress: MonthProgress
}

export function buildPlanOverview({ month, plan, groups, categories, totals, index, progress }: BuildPlanInput): PlanOverview {
  const spentByCategory = new Map<UUID | null, number>()
  for (const row of totals) {
    if (row.type !== 'expense') continue
    spentByCategory.set(row.categoryId, (spentByCategory.get(row.categoryId) ?? 0) + row.totalCents)
  }

  const expectedIncomeCents = plan?.expectedIncomeCents ?? 0
  const categoryBudgetById = new Map(plan?.categories.map((c) => [c.categoryId, c.amountCents]) ?? [])
  const groupBudgetById = new Map(plan?.groups.map((g) => [g.groupId, g]) ?? [])

  const groupViews: PlanGroupView[] = [...groups]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((group) => {
      const budget = groupBudgetById.get(group.id) ?? null
      const plannedCents = resolveGroupPlanned(budget ?? undefined, expectedIncomeCents)
      const groupCategories = categories
        .filter((c) => c.groupId === group.id && c.kind === 'expense')
        .sort((a, b) => a.sortOrder - b.sortOrder)

      const categoryViews: PlanCategoryView[] = groupCategories
        .map((category) => {
          const planned = categoryBudgetById.get(category.id) ?? null
          const spent = spentByCategory.get(category.id) ?? 0
          return {
            category,
            plannedCents: planned,
            spentCents: spent,
            remainingCents: planned === null ? null : planned - spent,
            consumedRatio: planned ? spent / planned : null,
          }
        })
        .filter((view) => view.category.isActive || view.spentCents > 0 || view.plannedCents !== null)

      const spentCents = categoryViews.reduce((acc, v) => acc + v.spentCents, 0)
      return {
        group,
        budget,
        plannedCents,
        incomeShare: expectedIncomeCents > 0 ? plannedCents / expectedIncomeCents : null,
        spentCents,
        remainingCents: plannedCents - spentCents,
        pace: classifyPace({
          spentCents,
          plannedCents,
          elapsedRatio: progress.elapsedRatio,
          position: progress.position,
        }),
        categories: categoryViews,
        categoryPlannedCents: categoryViews.reduce((acc, v) => acc + (v.plannedCents ?? 0), 0),
      }
    })

  let ungroupedSpentCents = 0
  for (const [categoryId, spent] of spentByCategory) {
    const category = categoryId ? index.categories.get(categoryId) : undefined
    if (!category?.groupId) ungroupedSpentCents += spent
  }

  const plannedTotalCents = groupViews.reduce((acc, g) => acc + g.plannedCents, 0)
  const plannedSavingsCents = groupViews.filter((g) => g.group.isSavings).reduce((acc, g) => acc + g.plannedCents, 0)
  const plannedSpendingCents = plannedTotalCents - plannedSavingsCents
  const spendingSpent =
    groupViews.filter((g) => !g.group.isSavings).reduce((acc, g) => acc + g.spentCents, 0) + ungroupedSpentCents

  return {
    month,
    hasPlan: plan !== null && plannedTotalCents > 0,
    expectedIncomeCents,
    plannedTotalCents,
    plannedSpendingCents,
    plannedSavingsCents,
    unallocatedCents: expectedIncomeCents - plannedTotalCents,
    groups: groupViews,
    ungroupedSpentCents,
    overall: classifyPace({
      spentCents: spendingSpent,
      plannedCents: plannedSpendingCents,
      elapsedRatio: progress.elapsedRatio,
      position: progress.position,
    }),
  }
}

export interface AvailableToSpend {
  basis: 'plan' | 'income' | 'none'
  availableCents: number
  perDayCents: number | null
  remainingDays: number
}

/**
 * "Quanto ainda posso gastar":
 * - with a plan: planned spending (non-savings groups) − consumption so far;
 * - without a plan: income received − consumption − aportes;
 * - per day only for the current month, over the remaining days including today.
 */
export function availableToSpend(
  overview: PlanOverview,
  consumptionCents: number,
  fallback: { incomeCents: number; savingsCents: number },
  progress: MonthProgress,
): AvailableToSpend {
  let basis: AvailableToSpend['basis']
  let availableCents: number
  if (overview.hasPlan && overview.plannedSpendingCents > 0) {
    basis = 'plan'
    availableCents = overview.plannedSpendingCents - consumptionCents
  } else if (fallback.incomeCents > 0) {
    basis = 'income'
    availableCents = fallback.incomeCents - consumptionCents - fallback.savingsCents
  } else {
    basis = 'none'
    availableCents = 0
  }
  const perDayCents =
    progress.position === 'current' && progress.remainingDays > 0 && basis !== 'none'
      ? Math.floor(Math.max(availableCents, 0) / progress.remainingDays)
      : null
  return { basis, availableCents, perDayCents, remainingDays: progress.remainingDays }
}

/** Default allocation preset (Necessidades / Viver / Investimentos). A suggestion, never enforced. */
export const DEFAULT_PRESET_BP = { essentials: 5000, lifestyle: 4000, savings: 1000 } as const

export function presetForGroups(groups: CategoryGroup[]): GroupBudget[] {
  return groups.map((g) => ({
    groupId: g.id,
    mode: 'percent' as const,
    percentBp: g.key ? DEFAULT_PRESET_BP[g.key] : 0,
    amountCents: null,
  }))
}
