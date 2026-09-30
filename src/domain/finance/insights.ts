import { monthName, type MonthProgress } from '../dates'
import { formatMoney, formatPercent } from '../money'
import type { PlanOverview } from './budget'
import { PACE_THRESHOLDS } from './pace'
import type { MonthSummary, RankedCategory } from './summary'

/**
 * "Seu mês" — deterministic observations built from real numbers. No AI involved: every
 * figure comes from the same calculations shown elsewhere on the dashboard.
 */

export type InsightTone = 'neutral' | 'positive' | 'attention'

export interface Insight {
  id: string
  tone: InsightTone
  text: string
}

export interface InsightInput {
  progress: MonthProgress
  summary: MonthSummary
  overview: PlanOverview
  ranking: RankedCategory[]
  /** Previous month up to the same day (current month) or the full previous month (past). */
  previous: MonthSummary | null
  previousMonth: string
}

export function buildInsights({ progress, summary, overview, ranking, previous, previousMonth }: InsightInput): Insight[] {
  const out: Insight[] = []
  const elapsed = progress.elapsedRatio

  if (progress.position === 'future') return out

  // 1. Category budgets consumed faster than the month.
  if (progress.position === 'current') {
    const hot = overview.groups
      .flatMap((g) => g.categories)
      .filter((c) => c.plannedCents && c.plannedCents > 0 && c.consumedRatio !== null)
      .filter((c) => (c.consumedRatio as number) - elapsed > PACE_THRESHOLDS.overMargin || (c.consumedRatio as number) > 1)
      .sort((a, b) => (b.consumedRatio as number) - (a.consumedRatio as number))
    for (const c of hot.slice(0, 2)) {
      const ratio = c.consumedRatio as number
      out.push(
        ratio > 1
          ? {
              id: `over-${c.category.id}`,
              tone: 'attention',
              text: `${c.category.name} passou do planejado em ${formatMoney(c.spentCents - (c.plannedCents ?? 0))}.`,
            }
          : {
              id: `pace-${c.category.id}`,
              tone: 'attention',
              text: `Você já usou ${formatPercent(ratio)} do orçamento de ${c.category.name} com ${formatPercent(elapsed)} do mês decorrido.`,
            },
      )
    }
  }

  // 2. Same-period comparison with the previous month.
  if (previous && previous.expenseCents > 0 && summary.expenseCents > 0) {
    const delta = (summary.expenseCents - previous.expenseCents) / previous.expenseCents
    if (Math.abs(delta) >= 0.1) {
      const period = progress.position === 'current' ? `no mesmo período de ${monthName(previousMonth)}` : `em ${monthName(previousMonth)}`
      out.push({
        id: 'vs-previous',
        tone: delta < 0 ? 'positive' : 'attention',
        text: `Suas despesas estão ${formatPercent(Math.abs(delta))} ${delta < 0 ? 'abaixo' : 'acima'} do que ${period}.`,
      })
    }
  }

  // 3. Where most of the money went.
  const top = ranking[0]
  if (top && top.totalCents > 0 && summary.expenseCents > 0) {
    out.push({
      id: 'top-category',
      tone: 'neutral',
      text: `${top.name} concentra ${formatPercent(top.share)} das despesas do mês (${formatMoney(top.totalCents)}).`,
    })
  }

  // 4. Closed month savings.
  if (progress.position === 'past' && summary.savingsRate !== null) {
    out.push(
      summary.savingsRate > 0
        ? { id: 'savings', tone: 'positive', text: `Você poupou ${formatPercent(summary.savingsRate)} da renda neste mês.` }
        : { id: 'savings', tone: 'attention', text: 'As despesas superaram as receitas neste mês.' },
    )
  }

  // 5. Missing income.
  if (summary.incomeCents === 0 && summary.expenseCents > 0) {
    out.push({ id: 'no-income', tone: 'neutral', text: 'Nenhuma receita registrada neste mês ainda.' })
  }

  return out.slice(0, 3)
}
