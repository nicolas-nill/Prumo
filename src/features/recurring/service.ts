import { compareDates } from '@/domain/dates'
import { occurrencesUntil, stepOccurrence } from '@/domain/finance'
import type { ISODate, RecurringRule, UUID } from '@/domain/types'
import { AppError } from '@/lib/errors'
import { logger } from '@/lib/observability/logger'
import type { FinanceRepository } from '@/server/data/contracts'

export interface PostingResult {
  created: number
  skipped: number
  rules: number
}

/**
 * Posts every due occurrence of the space's active recurring rules up to `today`.
 * Idempotent: the database refuses a second row for the same (rule, date), so running it
 * twice — or concurrently from the cron and the UI — never duplicates a transaction.
 */
export async function postDueRecurring(repo: FinanceRepository, spaceId: UUID, today: ISODate): Promise<PostingResult> {
  const rules = (await repo.listRecurring(spaceId)).filter((r) => r.isActive && r.autoPost && compareDates(r.nextOccurrenceOn, today) <= 0)
  let created = 0
  let skipped = 0

  for (const rule of rules) {
    const dates = occurrencesUntil(rule, rule.nextOccurrenceOn, today, 60)
    for (const date of dates) {
      try {
        await repo.createTransaction(spaceId, {
          type: rule.type,
          amountCents: rule.amountCents,
          occurredOn: date,
          description: rule.description,
          merchant: null,
          notes: null,
          categoryId: rule.categoryId,
          accountId: rule.accountId,
          cardId: rule.cardId,
          memberId: rule.memberId,
          scope: rule.scope,
          visibility: 'space',
          source: 'recurring',
          recurringRuleId: rule.id,
          recurringOccurrenceOn: date,
        })
        created += 1
      } catch (error) {
        if (error instanceof AppError && error.code === 'CONFLICT') skipped += 1
        else throw error
      }
    }
    const last = dates[dates.length - 1]
    if (last) await repo.markRecurringPosted(spaceId, rule.id, stepOccurrence(last, rule))
  }

  if (created > 0) logger.info('recurring.posted', { spaceId, created, skipped, rules: rules.length })
  return { created, skipped, rules: rules.length }
}

/** Occurrences expected between `from` and `to` that have not been posted yet (for forecasts). */
export function upcomingOccurrences(rules: RecurringRule[], from: ISODate, to: ISODate) {
  return rules
    .filter((r) => r.isActive)
    .flatMap((r) => {
      const start = compareDates(r.nextOccurrenceOn, from) >= 0 ? r.nextOccurrenceOn : from
      if (compareDates(r.nextOccurrenceOn, to) > 0) return []
      return occurrencesUntil(r, r.nextOccurrenceOn, to, 60)
        .filter((d) => compareDates(d, start) >= 0)
        .map((date) => ({ rule: r, date }))
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}
