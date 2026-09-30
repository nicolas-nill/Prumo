import { compareDates, diffInDays, monthOf, monthsBetween } from '../dates'
import type { Goal, ISODate } from '../types'

export type GoalState = 'completed' | 'on_track' | 'behind' | 'overdue' | 'no_deadline' | 'archived'

export interface GoalProgress {
  ratio: number
  remainingCents: number
  state: GoalState
  /** Whole months left until the target month (inclusive of the current month). */
  monthsLeft: number | null
  /** Even monthly contribution needed to reach the target by the deadline. */
  monthlyNeededCents: number | null
}

/**
 * Deterministic goal tracking. "Behind" compares actual progress with a straight line from
 * the goal creation date to its deadline, with a 10 p.p. tolerance.
 */
export function goalProgress(goal: Goal, today: ISODate): GoalProgress {
  const ratio = goal.targetAmountCents > 0 ? Math.min(goal.currentAmountCents / goal.targetAmountCents, 1) : 0
  const remainingCents = Math.max(goal.targetAmountCents - goal.currentAmountCents, 0)

  if (goal.status === 'archived') {
    return { ratio, remainingCents, state: 'archived', monthsLeft: null, monthlyNeededCents: null }
  }
  if (goal.status === 'completed' || remainingCents === 0) {
    return { ratio: 1, remainingCents: 0, state: 'completed', monthsLeft: null, monthlyNeededCents: null }
  }
  if (!goal.targetDate) {
    return { ratio, remainingCents, state: 'no_deadline', monthsLeft: null, monthlyNeededCents: null }
  }
  if (compareDates(goal.targetDate, today) < 0) {
    return { ratio, remainingCents, state: 'overdue', monthsLeft: 0, monthlyNeededCents: remainingCents }
  }

  const monthsLeft = monthsBetween(monthOf(today), monthOf(goal.targetDate)) + 1
  const monthlyNeededCents = Math.ceil(remainingCents / Math.max(monthsLeft, 1))

  const start = goal.createdAt.slice(0, 10)
  const totalDays = diffInDays(start, goal.targetDate)
  const expectedRatio = totalDays > 0 ? Math.min(Math.max(diffInDays(start, today) / totalDays, 0), 1) : 1
  const state: GoalState = ratio + 0.1 < expectedRatio ? 'behind' : 'on_track'

  return { ratio, remainingCents, state, monthsLeft, monthlyNeededCents }
}

export function goalStateLabel(state: GoalState): string {
  switch (state) {
    case 'completed':
      return 'Concluída'
    case 'on_track':
      return 'No prazo'
    case 'behind':
      return 'Abaixo do previsto'
    case 'overdue':
      return 'Prazo vencido'
    case 'no_deadline':
      return 'Sem prazo'
    case 'archived':
      return 'Arquivada'
  }
}
