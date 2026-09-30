import 'server-only'
import { compareDates, todayIn } from '@/domain/dates'
import { occurrencesUntil, stepOccurrence } from '@/domain/finance'
import { getDataMode } from '@/lib/env'
import { logger } from '@/lib/observability/logger'
import { DemoRepository } from '@/server/data/demo/repository'
import { getDemoDb } from '@/server/data/demo/store'
import { toRecurring } from '@/server/data/supabase/mappers'
import { getAdminClient } from '@/server/supabase/clients'
import { postDueRecurring } from './service'

/**
 * Daily job: posts due recurring transactions for every space. Idempotent thanks to the
 * unique (recurring_rule_id, recurring_occurrence_on) index — safe to retry or overlap.
 */
export async function runRecurringJob(): Promise<{ created: number; rules: number }> {
  const mode = getDataMode()
  if (mode === 'demo') {
    const db = getDemoDb()
    let created = 0
    let rules = 0
    for (const space of db.spaces) {
      const result = await postDueRecurring(new DemoRepository(db, space.ownerId), space.id, todayIn(space.timezone))
      created += result.created
      rules += result.rules
    }
    return { created, rules }
  }

  const db = getAdminClient()
  const { data: due, error } = await db
    .from('recurring_rules')
    .select('*, financial_spaces!inner(timezone)')
    .eq('is_active', true)
    .eq('auto_post', true)
    .lte('next_occurrence_on', todayIn('Pacific/Kiritimati')) // earliest timezone on Earth; refined per space below
    .limit(1000)
  if (error) throw error

  let created = 0
  for (const row of due ?? []) {
    const rule = toRecurring(row)
    const today = todayIn((row as unknown as { financial_spaces: { timezone: string } }).financial_spaces.timezone)
    if (compareDates(rule.nextOccurrenceOn, today) > 0) continue
    const dates = occurrencesUntil(rule, rule.nextOccurrenceOn, today, 60)
    for (const date of dates) {
      const { error: insertError } = await db.from('transactions').insert({
        space_id: rule.spaceId,
        type: rule.type,
        amount_cents: rule.amountCents,
        occurred_on: date,
        description: rule.description,
        category_id: rule.categoryId,
        account_id: rule.accountId,
        card_id: rule.cardId,
        member_id: rule.memberId,
        created_by: row.created_by,
        scope: rule.scope,
        source: 'recurring',
        recurring_rule_id: rule.id,
        recurring_occurrence_on: date,
      })
      if (!insertError) created += 1
      else if (insertError.code !== '23505') logger.error('recurring.insert_failed', { ruleId: rule.id, code: insertError.code })
    }
    const last = dates[dates.length - 1]
    if (last) await db.from('recurring_rules').update({ next_occurrence_on: stepOccurrence(last, rule) }).eq('id', rule.id)
  }
  logger.info('recurring.job_done', { created, rules: due?.length ?? 0 })
  return { created, rules: due?.length ?? 0 }
}

export async function runRetentionJob(): Promise<Record<string, number>> {
  const mode = getDataMode()
  if (mode === 'demo') {
    const db = getDemoDb()
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString()
    let messages = 0
    for (const m of db.messages) {
      if (m.content && m.receivedAt < cutoff) {
        m.content = null
        messages += 1
      }
    }
    return { messages }
  }
  const { data, error } = await getAdminClient().rpc('purge_expired_data')
  if (error) throw error
  logger.info('retention.job_done', data as Record<string, number>)
  return data as Record<string, number>
}
