import 'server-only'
import { addDays, addMonths, compareDates, monthEnd, monthProgress, monthStart } from '@/domain/dates'
import {
  availableToSpend,
  buildInsights,
  buildPlanOverview,
  cardInvoiceState,
  compare,
  distributeByGroup,
  goalProgress,
  indexCategories,
  rankExpenseCategories,
  summarize,
} from '@/domain/finance'
import type { Card, ISODate, MonthKey } from '@/domain/types'
import type { FinanceRepository, Perspective } from '@/server/data/contracts'
import { upcomingOccurrences } from '@/features/recurring/service'
import { toViews } from '@/features/transactions/reference'
import { getReferenceData, getSpaceContext } from '@/server/session'

export const EVOLUTION_MONTHS = 6
export const UPCOMING_DAYS = 15

export interface UpcomingItem {
  id: string
  date: ISODate
  label: string
  amountCents: number
  kind: 'income' | 'expense' | 'invoice'
}

/**
 * Everything the dashboard shows for one month, computed on the server from aggregated
 * totals (one small set of queries — never the full transaction history).
 */
export async function loadDashboard(month: MonthKey, perspective: Perspective) {
  const { viewer, space, today } = await getSpaceContext()
  const repo = viewer.repo
  const ref = await getReferenceData(space.id)
  const index = indexCategories(ref.categories, ref.groups)
  const progress = monthProgress(month, today)
  const previousMonth = addMonths(month, -1)
  const filtered = Boolean(perspective.memberId || perspective.scope)

  // Compare the current month with the previous month up to the same day (fair comparison).
  const previousTo =
    progress.position === 'current'
      ? (() => {
          const sameDay = addDays(monthStart(previousMonth), progress.elapsedDays - 1)
          return compareDates(sameDay, monthEnd(previousMonth)) > 0 ? monthEnd(previousMonth) : sameDay
        })()
      : monthEnd(previousMonth)

  const [totals, spaceTotals, previousTotals, plan, monthly, recent, goals] = await Promise.all([
    repo.categoryTotals(space.id, monthStart(month), monthEnd(month), perspective),
    filtered ? repo.categoryTotals(space.id, monthStart(month), monthEnd(month)) : Promise.resolve(null),
    repo.categoryTotals(space.id, monthStart(previousMonth), previousTo, perspective),
    repo.getPlan(space.id, month),
    repo.monthlyTotals(space.id, addMonths(month, -(EVOLUTION_MONTHS - 1)), month, perspective),
    repo.listTransactions(space.id, {
      from: monthStart(month),
      to: monthEnd(month),
      pageSize: 7,
      memberId: perspective.memberId ?? undefined,
    }),
    repo.listGoals(space.id),
  ])
  const upcoming = progress.position === 'current' ? await loadUpcoming(repo, space.id, today, ref.cards, perspective) : null

  const summary = summarize(totals, index)
  const previous = summarize(previousTotals, index)
  // The plan belongs to the whole space, so it is always compared with everyone's spending.
  const planTotals = spaceTotals ?? totals
  const planSummary = spaceTotals ? summarize(spaceTotals, index) : summary
  const overview = buildPlanOverview({ month, plan, groups: ref.groups, categories: ref.categories, totals: planTotals, index, progress })
  const available = availableToSpend(overview, planSummary.expenseCents, planSummary, progress)
  const ranking = rankExpenseCategories(totals, index, 6)

  const byMonth = new Map(monthly.map((m) => [m.month, m]))
  const evolution = Array.from({ length: EVOLUTION_MONTHS }, (_, i) => {
    const key = addMonths(month, i - (EVOLUTION_MONTHS - 1))
    const row = byMonth.get(key)
    const incomeCents = row?.incomeCents ?? 0
    const expenseCents = row?.expenseCents ?? 0
    return { month: key, incomeCents, expenseCents, savingsCents: row?.savingsCents ?? 0, resultCents: incomeCents - expenseCents }
  })

  const members = space.members.map((m) => ({ id: m.userId, name: m.fullName }))
  const activeGoals = goals
    .filter((g) => g.status !== 'archived')
    .map((g) => ({ goal: g, progress: goalProgress(g, today) }))
    .sort((a, b) => Number(a.goal.status === 'completed') - Number(b.goal.status === 'completed'))

  return {
    space,
    today,
    month,
    previousMonth,
    progress,
    summary,
    comparison: {
      income: compare(summary.incomeCents, previous.incomeCents),
      expense: compare(summary.expenseCents, previous.expenseCents),
      result: compare(summary.resultCents, previous.resultCents),
      hasPrevious: previous.transactionCount > 0,
      sameperiod: progress.position === 'current',
    },
    overview,
    available,
    ranking,
    distribution: distributeByGroup(totals, index),
    evolution,
    insights: buildInsights({ progress, summary: planSummary, overview, ranking, previous: filtered ? null : previous, previousMonth }),
    recent: toViews(recent.items, { ...ref, members }),
    recentTotal: recent.total,
    goals: activeGoals.slice(0, 3),
    upcoming,
    hasAnyData: summary.transactionCount > 0 || evolution.some((e) => e.incomeCents + e.expenseCents > 0),
  }
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>

/** Recurring occurrences and closed card invoices due in the next days (current month only). */
async function loadUpcoming(
  repo: FinanceRepository,
  spaceId: string,
  today: ISODate,
  cards: Card[],
  perspective: Perspective,
): Promise<UpcomingItem[]> {
  const until = addDays(today, UPCOMING_DAYS)
  const rules = (await repo.listRecurring(spaceId)).filter((r) => !perspective.memberId || r.memberId === perspective.memberId)
  const items: UpcomingItem[] = upcomingOccurrences(rules, today, until).map(({ rule, date }) => ({
    id: `${rule.id}-${date}`,
    date,
    label: rule.description,
    amountCents: rule.amountCents,
    kind: rule.type,
  }))

  const invoices = await Promise.all(
    cards
      .filter((c) => c.isActive)
      .map(async (card) => {
        const closed = cardInvoiceState(today, card.closingDay, card.dueDay).closedUnpaid
        if (!closed || compareDates(closed.dueDate, until) > 0) return null
        const totals = await repo.cardTotals(spaceId, closed.periodStart, closed.periodEnd)
        const amountCents = totals.find((t) => t.cardId === card.id)?.totalCents ?? 0
        return amountCents > 0 ? { id: `invoice-${card.id}`, date: closed.dueDate, label: `Fatura ${card.name}`, amountCents, kind: 'invoice' as const } : null
      }),
  )
  for (const invoice of invoices) if (invoice) items.push(invoice)
  return items.sort((a, b) => a.date.localeCompare(b.date))
}
