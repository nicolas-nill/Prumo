import type { Category, CategoryGroup, Tone, UUID } from '../types'

/**
 * Month summary rules (see docs/ARCHITECTURE.md → "Regras financeiras"):
 * - Receitas: confirmed income.
 * - Despesas: confirmed expenses that are consumption (category not in a savings group).
 * - Aportes: confirmed expenses whose category belongs to a savings group (investimentos,
 *   reserva). They leave the checking account but are not consumption.
 * - Resultado = Receitas − Despesas (what was not consumed: aportes + sobra).
 * - Índice de poupança = Resultado ÷ Receitas (null when there is no income).
 * - Sobra em caixa = Receitas − Despesas − Aportes.
 * Transfers are never counted.
 */

export interface CategoryTotal {
  categoryId: UUID | null
  type: 'income' | 'expense'
  totalCents: number
  count: number
}

export interface MonthSummary {
  incomeCents: number
  expenseCents: number
  savingsCents: number
  resultCents: number
  freeCashCents: number
  savingsRate: number | null
  transactionCount: number
}

export interface CategoryIndex {
  categories: Map<UUID, Category>
  groups: Map<UUID, CategoryGroup>
}

export function indexCategories(categories: Category[], groups: CategoryGroup[]): CategoryIndex {
  return {
    categories: new Map(categories.map((c) => [c.id, c])),
    groups: new Map(groups.map((g) => [g.id, g])),
  }
}

export function isSavingsCategory(categoryId: UUID | null, index: CategoryIndex): boolean {
  if (!categoryId) return false
  const category = index.categories.get(categoryId)
  if (!category?.groupId) return false
  return index.groups.get(category.groupId)?.isSavings ?? false
}

export function summarize(totals: CategoryTotal[], index: CategoryIndex): MonthSummary {
  let incomeCents = 0
  let expenseCents = 0
  let savingsCents = 0
  let transactionCount = 0
  for (const row of totals) {
    transactionCount += row.count
    if (row.type === 'income') incomeCents += row.totalCents
    else if (isSavingsCategory(row.categoryId, index)) savingsCents += row.totalCents
    else expenseCents += row.totalCents
  }
  const resultCents = incomeCents - expenseCents
  return {
    incomeCents,
    expenseCents,
    savingsCents,
    resultCents,
    freeCashCents: resultCents - savingsCents,
    savingsRate: incomeCents > 0 ? resultCents / incomeCents : null,
    transactionCount,
  }
}

export interface Comparison {
  previousCents: number
  deltaCents: number
  /** Relative change vs previous; null when previous is zero. */
  deltaRatio: number | null
}

export function compare(current: number, previous: number): Comparison {
  return {
    previousCents: previous,
    deltaCents: current - previous,
    deltaRatio: previous === 0 ? null : (current - previous) / Math.abs(previous),
  }
}

export interface RankedCategory {
  categoryId: UUID | null
  name: string
  tone: Tone
  totalCents: number
  count: number
  /** Share of total consumption, 0..1 */
  share: number
}

/** Consumption ranking (aportes excluded — they are not "where the money went"). */
export function rankExpenseCategories(totals: CategoryTotal[], index: CategoryIndex, limit = 6): RankedCategory[] {
  const rows = totals.filter((t) => t.type === 'expense' && !isSavingsCategory(t.categoryId, index))
  const total = rows.reduce((acc, r) => acc + r.totalCents, 0)
  return rows
    .map((row) => {
      const category = row.categoryId ? index.categories.get(row.categoryId) : undefined
      const group = category?.groupId ? index.groups.get(category.groupId) : undefined
      return {
        categoryId: row.categoryId,
        name: category?.name ?? 'Sem categoria',
        tone: category?.tone ?? group?.tone ?? 'slate',
        totalCents: row.totalCents,
        count: row.count,
        share: total > 0 ? row.totalCents / total : 0,
      }
    })
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, limit)
}

export interface GroupDistribution {
  key: string
  groupId: UUID | null
  label: string
  tone: Tone
  totalCents: number
  share: number
  isSavings: boolean
}

/** Where the money went, by budget group. Few, stable slices — never a 17-piece pie. */
export function distributeByGroup(totals: CategoryTotal[], index: CategoryIndex): GroupDistribution[] {
  const byGroup = new Map<string, GroupDistribution>()
  for (const row of totals) {
    if (row.type !== 'expense') continue
    const category = row.categoryId ? index.categories.get(row.categoryId) : undefined
    const group = category?.groupId ? index.groups.get(category.groupId) : undefined
    const key = group?.id ?? 'ungrouped'
    const current = byGroup.get(key) ?? {
      key,
      groupId: group?.id ?? null,
      label: group?.name ?? 'Sem grupo',
      tone: group?.tone ?? 'slate',
      totalCents: 0,
      share: 0,
      isSavings: group?.isSavings ?? false,
    }
    current.totalCents += row.totalCents
    byGroup.set(key, current)
  }
  const list = [...byGroup.values()]
  const total = list.reduce((acc, g) => acc + g.totalCents, 0)
  const order = (g: GroupDistribution) => (g.groupId ? (index.groups.get(g.groupId)?.sortOrder ?? 50) : 99)
  return list
    .map((g) => ({ ...g, share: total > 0 ? g.totalCents / total : 0 }))
    .sort((a, b) => order(a) - order(b))
}
