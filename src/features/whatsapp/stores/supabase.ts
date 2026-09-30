import 'server-only'
import { randomUUID } from 'node:crypto'
import { monthStart } from '@/domain/dates'
import { buildInstallmentPlan } from '@/domain/finance'
import { canEditTransaction, normalizeVisibility } from '@/domain/permissions'
import type { UUID } from '@/domain/types'
import { AppError } from '@/lib/errors'
import { toAccount, toCard, toCategory, toGroup, toTransaction } from '@/server/data/supabase/mappers'
import type { DbClient } from '@/server/supabase/clients'
import { check, mapDbError, unwrap } from '@/server/supabase/errors'
import type { Json, TablesInsert } from '@/types/database.types'
import type { ActingFinance, PendingAction, WhatsAppStore } from '../store'

const CONTENT_RETENTION_DAYS = 30

/**
 * Service-role store. BYPASSES RLS, therefore:
 *  - every read/write is filtered by space_id AND an active membership of the acting user;
 *  - private transactions of other members are excluded explicitly;
 *  - edits/deletes re-check the same rule as the RLS policy (canEditTransaction).
 */
export class SupabaseWhatsAppStore implements WhatsAppStore {
  readonly mode = 'supabase' as const

  constructor(private readonly db: DbClient) {}

  async recordInbound(input: Parameters<WhatsAppStore['recordInbound']>[0]) {
    const { data, error } = await this.db
      .from('whatsapp_messages')
      .insert({
        direction: 'inbound',
        wa_message_id: input.waMessageId,
        sender_hash: input.senderHash,
        message_type: input.type,
        status: 'received',
        content: input.content,
        content_expires_at: input.content ? new Date(Date.now() + CONTENT_RETENTION_DAYS * 86_400_000).toISOString() : null,
        media_id: input.mediaId,
        wa_timestamp: input.waTimestamp,
        correlation_id: input.correlationId,
      })
      .select('id')
      .single()
    if (error?.code === '23505') {
      const existing = unwrap(
        await this.db.from('whatsapp_messages').select('id').eq('direction', 'inbound').eq('wa_message_id', input.waMessageId).single(),
        'wa.inbound.existing',
      )
      return { id: existing.id, duplicate: true }
    }
    if (error) throw mapDbError(error, 'wa.inbound.record')
    return { id: data.id, duplicate: false }
  }

  async updateInbound(id: UUID, patch: Parameters<WhatsAppStore['updateInbound']>[1]) {
    check(
      await this.db
        .from('whatsapp_messages')
        .update({
          ...(patch.status ? { status: patch.status, processed_at: patch.status === 'processing' ? null : new Date().toISOString() } : {}),
          ...(patch.identityId ? { identity_id: patch.identityId } : {}),
          ...(patch.userId ? { user_id: patch.userId } : {}),
          ...(patch.spaceId ? { space_id: patch.spaceId } : {}),
          ...(patch.content !== undefined
            ? { content: patch.content, content_expires_at: patch.content ? new Date(Date.now() + CONTENT_RETENTION_DAYS * 86_400_000).toISOString() : null }
            : {}),
          ...(patch.intent !== undefined ? { intent: patch.intent as Json } : {}),
          ...(patch.errorCode !== undefined ? { error_code: patch.errorCode } : {}),
          ...(patch.transactionId !== undefined ? { transaction_id: patch.transactionId } : {}),
        })
        .eq('id', id),
      'wa.inbound.update',
    )
  }

  async recordOutbound(input: Parameters<WhatsAppStore['recordOutbound']>[0]) {
    check(
      await this.db.from('whatsapp_messages').insert({
        direction: 'outbound',
        wa_message_id: input.waMessageId,
        identity_id: input.identityId,
        user_id: input.userId,
        space_id: input.spaceId,
        message_type: 'text',
        status: 'sent',
        reply_to_id: input.replyToId,
        transaction_id: input.transactionId,
        correlation_id: input.correlationId,
      }),
      'wa.outbound.record',
    )
  }

  async updateOutboundStatus(waMessageId: string, status: 'sent' | 'delivered' | 'read' | 'failed', errorCode: number | null) {
    check(
      await this.db
        .from('whatsapp_messages')
        .update({ status, error_code: errorCode ? String(errorCode) : null })
        .eq('direction', 'outbound')
        .eq('wa_message_id', waMessageId),
      'wa.outbound.status',
    )
  }

  async transactionForMessage(waMessageId: string, userId: UUID) {
    const { data } = await this.db.from('whatsapp_messages').select('transaction_id').eq('wa_message_id', waMessageId).eq('user_id', userId).maybeSingle()
    return data?.transaction_id ?? null
  }

  async unknownSenderRepliedSince(senderHash: string, sinceIso: string) {
    const { count } = await this.db
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_hash', senderHash)
      .eq('status', 'ignored')
      .gte('received_at', sinceIso)
    return (count ?? 0) > 1
  }

  async findVerifiedIdentity(phones: string[]) {
    const { data, error } = await this.db
      .from('whatsapp_identities')
      .select('id, user_id, phone_e164, default_space_id')
      .in('phone_e164', phones)
      .eq('status', 'verified')
      .limit(1)
      .maybeSingle()
    if (error) throw mapDbError(error, 'wa.identity.find')
    if (!data) return null
    return {
      identityId: data.id,
      userId: data.user_id,
      phoneE164: data.phone_e164,
      defaultSpaceId: data.default_space_id,
      userName: await this.userName(data.user_id),
    }
  }

  async verifyLinkCode(phones: string[], code: string) {
    const rows = unwrap(await this.db.rpc('verify_whatsapp_link', { p_phones: phones, p_code: code }), 'wa.identity.verify')
    const row = rows[0]
    return { status: (row?.status ?? 'not_found') as 'verified', userId: row?.user_id ?? undefined }
  }

  async userName(userId: UUID) {
    const { data } = await this.db.from('profiles').select('full_name').eq('id', userId).maybeSingle()
    return data?.full_name ?? 'você'
  }

  async snapshot(spaceId: UUID, userId: UUID) {
    const [membership, space, members] = await Promise.all([
      this.db.from('financial_space_members').select('role').eq('space_id', spaceId).eq('user_id', userId).eq('status', 'active').maybeSingle(),
      this.db.from('financial_spaces').select('*').eq('id', spaceId).maybeSingle(),
      this.db.from('financial_space_members').select('user_id').eq('space_id', spaceId).eq('status', 'active'),
    ])
    if (!membership.data || !space.data) return null
    const memberIds = (members.data ?? []).map((m) => m.user_id)
    const [profiles, categories, groups, accounts, cards] = await Promise.all([
      this.db.from('profiles').select('id, full_name').in('id', memberIds),
      this.db.from('categories').select('*').eq('space_id', spaceId),
      this.db.from('category_groups').select('*').eq('space_id', spaceId).is('archived_at', null).order('sort_order'),
      this.db.from('accounts').select('*').eq('space_id', spaceId),
      this.db.from('cards').select('*').eq('space_id', spaceId),
    ])
    const s = space.data
    return {
      space: {
        id: s.id,
        name: s.name,
        type: s.type as 'personal' | 'shared',
        currency: s.currency,
        timezone: s.timezone,
        plan: s.plan_code as 'free' | 'premium',
        ownerId: s.owner_id,
        createdAt: s.created_at,
      },
      role: membership.data.role as 'owner' | 'admin' | 'member',
      members: memberIds.map((id) => ({ userId: id, fullName: profiles.data?.find((p) => p.id === id)?.full_name ?? 'Membro' })),
      categories: (categories.data ?? []).map(toCategory),
      groups: (groups.data ?? []).map(toGroup),
      accounts: (accounts.data ?? []).map(toAccount),
      cards: (cards.data ?? []).map(toCard),
    }
  }

  acting(spaceId: UUID, userId: UUID): ActingFinance {
    const db = this.db
    const privacy = `visibility.eq.space,member_id.eq.${userId},created_by.eq.${userId}`
    const get = async (id: UUID) => {
      const { data, error } = await db.from('transactions').select('*').eq('space_id', spaceId).eq('id', id).is('deleted_at', null).or(privacy).maybeSingle()
      if (error) throw mapDbError(error, 'wa.tx.get')
      return data ? toTransaction(data) : null
    }
    return {
      async createTransactions(input) {
        const base = {
          space_id: spaceId,
          type: input.type,
          description: input.description,
          merchant: input.merchant,
          notes: input.notes,
          category_id: input.categoryId,
          account_id: input.accountId,
          card_id: input.type === 'expense' ? input.cardId : null,
          member_id: input.memberId,
          created_by: userId,
          scope: input.scope,
          visibility: normalizeVisibility(input.scope, input.visibility),
          source: input.source ?? 'whatsapp_text',
          source_ref: input.sourceRef ?? null,
        }
        const rows: TablesInsert<'transactions'>[] =
          input.installments && input.installments >= 2
            ? (() => {
                const groupId = randomUUID()
                return buildInstallmentPlan(input.amountCents, input.installments, input.occurredOn).map((item) => ({
                  ...base,
                  amount_cents: item.amountCents,
                  occurred_on: item.occurredOn,
                  installment_group_id: groupId,
                  installment_number: item.number,
                  installment_count: item.count,
                  installment_total_cents: input.amountCents,
                }))
              })()
            : [{ ...base, amount_cents: input.amountCents, occurred_on: input.occurredOn }]
        const { data, error } = await db.from('transactions').insert(rows).select('*')
        if (error) throw mapDbError(error, 'wa.tx.create')
        return (data ?? []).map(toTransaction)
      },
      getTransaction: get,
      async recentlyCreated(sinceIso, limit) {
        const rows = unwrap(
          await db
            .from('transactions')
            .select('*')
            .eq('space_id', spaceId)
            .eq('created_by', userId)
            .is('deleted_at', null)
            .gte('created_at', sinceIso)
            .order('created_at', { ascending: false })
            .limit(limit),
          'wa.tx.recent',
        )
        return rows.map(toTransaction)
      },
      async visibleSince(fromDate, limit) {
        const rows = unwrap(
          await db
            .from('transactions')
            .select('*')
            .eq('space_id', spaceId)
            .is('deleted_at', null)
            .gte('occurred_on', fromDate)
            .or(privacy)
            .order('occurred_on', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(limit),
          'wa.tx.visible',
        )
        return rows.map(toTransaction)
      },
      async updateTransaction(id, input) {
        const current = await get(id)
        if (!current || !canEditTransaction(current, userId)) throw new AppError('FORBIDDEN')
        const row = unwrap(
          await db
            .from('transactions')
            .update({
              type: input.type,
              amount_cents: input.amountCents,
              occurred_on: input.occurredOn,
              description: input.description,
              merchant: input.merchant,
              notes: input.notes,
              category_id: input.categoryId,
              account_id: input.accountId,
              card_id: input.type === 'expense' ? input.cardId : null,
              member_id: input.memberId,
              scope: input.scope,
              visibility: normalizeVisibility(input.scope, input.visibility),
            })
            .eq('space_id', spaceId)
            .eq('id', id)
            .select('*')
            .single(),
          'wa.tx.update',
        )
        return toTransaction(row)
      },
      async softDelete(id) {
        const current = await get(id)
        if (!current || !canEditTransaction(current, userId)) throw new AppError('FORBIDDEN')
        check(
          await db.from('transactions').update({ deleted_at: new Date().toISOString(), deleted_by: userId }).eq('space_id', spaceId).eq('id', id),
          'wa.tx.delete',
        )
      },
      async categoryTotals(from, to) {
        const rows = unwrap(await db.rpc('space_category_totals_as', { p_viewer: userId, p_space_id: spaceId, p_from: from, p_to: to }), 'wa.totals')
        return rows.map((r) => ({ categoryId: r.category_id, type: r.type as 'income' | 'expense', totalCents: Number(r.total_cents), count: Number(r.tx_count) }))
      },
      async getPlan(month) {
        const { data: plan } = await db.from('monthly_plans').select('*').eq('space_id', spaceId).eq('month', monthStart(month)).maybeSingle()
        if (!plan) return null
        const [groups, categories] = await Promise.all([
          db.from('plan_group_budgets').select('*').eq('plan_id', plan.id),
          db.from('plan_category_budgets').select('*').eq('plan_id', plan.id),
        ])
        return {
          id: plan.id,
          spaceId,
          month,
          expectedIncomeCents: plan.expected_income_cents,
          groups: (groups.data ?? []).map((g) => ({ groupId: g.group_id, mode: g.mode as 'percent' | 'amount', percentBp: g.percent_bp, amountCents: g.amount_cents })),
          categories: (categories.data ?? []).map((c) => ({ categoryId: c.category_id, amountCents: c.amount_cents })),
        }
      },
    }
  }

  async getOpenAction(identityId: UUID): Promise<PendingAction | null> {
    const { data } = await this.db.from('whatsapp_pending_actions').select('*').eq('identity_id', identityId).eq('status', 'open').maybeSingle()
    if (!data) return null
    if (new Date(data.expires_at).getTime() < Date.now()) {
      await this.closeAction(data.id, 'expired')
      return null
    }
    return {
      id: data.id,
      identityId: data.identity_id,
      spaceId: data.space_id,
      userId: data.user_id,
      kind: data.kind as PendingAction['kind'],
      payload: data.payload,
      expiresAt: data.expires_at,
    }
  }

  async saveAction(action: Parameters<WhatsAppStore['saveAction']>[0]) {
    check(
      await this.db.from('whatsapp_pending_actions').update({ status: 'cancelled', resolved_at: new Date().toISOString() }).eq('identity_id', action.identityId).eq('status', 'open'),
      'wa.action.cancel_previous',
    )
    check(
      await this.db.from('whatsapp_pending_actions').insert({
        identity_id: action.identityId,
        space_id: action.spaceId,
        user_id: action.userId,
        kind: action.kind,
        payload: action.payload as Json,
        message_id: action.messageId,
        expires_at: new Date(Date.now() + (action.ttlMinutes ?? 30) * 60_000).toISOString(),
      }),
      'wa.action.save',
    )
  }

  async closeAction(id: UUID, status: 'resolved' | 'cancelled' | 'expired') {
    check(await this.db.from('whatsapp_pending_actions').update({ status, resolved_at: new Date().toISOString() }).eq('id', id), 'wa.action.close')
  }

  async countAiUsageSince(spaceId: UUID, sinceIso: string) {
    const { count } = await this.db
      .from('ai_usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('space_id', spaceId)
      .eq('success', true)
      .gte('created_at', sinceIso)
    return count ?? 0
  }

  async logAiUsage(event: Parameters<WhatsAppStore['logAiUsage']>[0]) {
    check(
      await this.db.from('ai_usage_events').insert({
        user_id: event.userId,
        space_id: event.spaceId,
        operation: event.operation,
        provider: event.provider,
        model: event.model,
        input_tokens: event.inputTokens,
        output_tokens: event.outputTokens,
        audio_seconds: event.audioSeconds,
        estimated_cost_usd_micros: event.estimatedCostUsdMicros,
        latency_ms: event.latencyMs,
        success: event.success,
        correlation_id: event.correlationId,
      }),
      'ai.usage.log',
    )
  }
}
