import 'server-only'
import { randomUUID } from 'node:crypto'
import { monthEnd, monthStart } from '@/domain/dates'
import { buildInstallmentPlan } from '@/domain/finance'
import { normalizeVisibility } from '@/domain/permissions'
import type { CategoryTotal } from '@/domain/finance'
import type { Goal, MonthKey, SpaceWithMembers, Transaction, UUID } from '@/domain/types'
import { AppError } from '@/lib/errors'
import type { DbClient } from '@/server/supabase/clients'
import { check, mapDbError, unwrap } from '@/server/supabase/errors'
import type { TablesInsert } from '@/types/database.types'
import type {
  AccountInput,
  CardInput,
  CategoryInput,
  ContributionInput,
  CreateTransactionInput,
  FinanceRepository,
  GoalInput,
  MonthlyTotal,
  OnboardingInput,
  Page,
  Perspective,
  PlanInput,
  RecurringInput,
  SpaceSummary,
  TransactionInput,
  TransactionQuery,
  WhatsAppActivity,
} from '../contracts'
import {
  sanitizeSearch,
  toAccount,
  toCard,
  toCategory,
  toContribution,
  toGoal,
  toGroup,
  toInvitation,
  toProfile,
  toRecurring,
  toTransaction,
  toWhatsAppIdentity,
} from './mappers'

const WHATSAPP_SOURCES = ['whatsapp_text', 'whatsapp_audio', 'whatsapp_image'] as const

export class SupabaseRepository implements FinanceRepository {
  readonly mode = 'supabase' as const

  constructor(
    private readonly db: DbClient,
    private readonly userId: UUID,
    private readonly email: string | null,
  ) {}

  // ─── Profile & spaces ──────────────────────────────────────────────────────
  async getProfile() {
    const row = unwrap(await this.db.from('profiles').select('*').eq('id', this.userId).maybeSingle(), 'profile.get')
    return toProfile(row, this.email)
  }

  async updateProfile(input: { fullName?: string; timezone?: string; defaultSpaceId?: UUID }) {
    check(
      await this.db
        .from('profiles')
        .update({
          ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.defaultSpaceId !== undefined ? { default_space_id: input.defaultSpaceId } : {}),
        })
        .eq('id', this.userId),
      'profile.update',
    )
  }

  async listSpaces(): Promise<SpaceSummary[]> {
    const memberships = unwrap(
      await this.db.from('financial_space_members').select('space_id, role, status').eq('user_id', this.userId).eq('status', 'active'),
      'spaces.memberships',
    )
    if (memberships.length === 0) return []
    const ids = memberships.map((m) => m.space_id)
    const [spaces, members] = await Promise.all([
      this.db.from('financial_spaces').select('*').in('id', ids).order('created_at'),
      this.db.from('financial_space_members').select('space_id').in('space_id', ids).eq('status', 'active'),
    ])
    const counts = new Map<string, number>()
    for (const m of unwrap(members, 'spaces.count')) counts.set(m.space_id, (counts.get(m.space_id) ?? 0) + 1)
    return unwrap(spaces, 'spaces.list').map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type as 'personal' | 'shared',
      currency: s.currency,
      timezone: s.timezone,
      plan: s.plan_code as 'free' | 'premium',
      ownerId: s.owner_id,
      createdAt: s.created_at,
      myRole: memberships.find((m) => m.space_id === s.id)!.role as SpaceSummary['myRole'],
      memberCount: counts.get(s.id) ?? 1,
    }))
  }

  async getSpace(spaceId: UUID): Promise<SpaceWithMembers | null> {
    const { data: space, error } = await this.db.from('financial_spaces').select('*').eq('id', spaceId).maybeSingle()
    if (error) throw mapDbError(error, 'space.get')
    if (!space) return null
    const members = unwrap(
      await this.db.from('financial_space_members').select('user_id, role, status, joined_at').eq('space_id', spaceId).eq('status', 'active'),
      'space.members',
    )
    const profiles = unwrap(
      await this.db.from('profiles').select('id, full_name, avatar_url').in('id', members.map((m) => m.user_id)),
      'space.profiles',
    )
    const me = members.find((m) => m.user_id === this.userId)
    if (!me) return null
    return {
      id: space.id,
      name: space.name,
      type: space.type as 'personal' | 'shared',
      currency: space.currency,
      timezone: space.timezone,
      plan: space.plan_code as 'free' | 'premium',
      ownerId: space.owner_id,
      createdAt: space.created_at,
      myRole: me.role as SpaceWithMembers['myRole'],
      members: members
        .map((m) => {
          const p = profiles.find((x) => x.id === m.user_id)
          return {
            userId: m.user_id,
            role: m.role as SpaceWithMembers['myRole'],
            status: m.status as 'active',
            joinedAt: m.joined_at,
            fullName: p?.full_name ?? 'Membro',
            avatarUrl: p?.avatar_url ?? null,
          }
        })
        .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.joinedAt.localeCompare(b.joinedAt))),
    }
  }

  async renameSpace(spaceId: UUID, name: string) {
    check(await this.db.from('financial_spaces').update({ name }).eq('id', spaceId), 'space.rename')
  }

  async completeOnboarding(input: OnboardingInput) {
    return unwrap(
      await this.db.rpc('complete_onboarding', {
        p_full_name: input.fullName,
        p_space_name: input.spaceName,
        p_space_type: input.spaceType,
        p_expected_income_cents: input.expectedIncomeCents,
        p_plan_mode: input.planMode,
        p_group_percents: input.groupPercents ?? undefined,
        p_category_keys: input.categoryKeys,
      }),
      'onboarding.complete',
    )
  }

  // ─── Invitations & members ─────────────────────────────────────────────────
  async listInvitations(spaceId: UUID) {
    const rows = unwrap(
      await this.db.from('space_invitations').select('*').eq('space_id', spaceId).order('created_at', { ascending: false }).limit(20),
      'invitations.list',
    )
    return rows.map(toInvitation)
  }

  async createInvitation(spaceId: UUID, email: string, role: 'admin' | 'member') {
    const rows = unwrap(await this.db.rpc('create_invitation', { p_space_id: spaceId, p_email: email, p_role: role }), 'invitations.create')
    const created = rows[0]
    if (!created) throw new AppError('INTERNAL')
    const invitation = unwrap(
      await this.db.from('space_invitations').select('*').eq('id', created.invitation_id).single(),
      'invitations.read',
    )
    return { invitation: toInvitation(invitation), token: created.token }
  }

  async revokeInvitation(invitationId: UUID) {
    check(await this.db.rpc('revoke_invitation', { p_invitation_id: invitationId }), 'invitations.revoke')
  }

  async getInvitationPreview(token: string) {
    const { data, error } = await this.db.rpc('get_invitation_preview', { p_token: token })
    if (error) throw mapDbError(error, 'invitations.preview')
    const row = data?.[0]
    if (!row) return null
    return {
      spaceName: row.space_name,
      inviterName: row.inviter_name,
      email: row.email_hint,
      status: row.status as 'pending',
      expired: row.status === 'expired',
    }
  }

  async acceptInvitation(token: string) {
    return unwrap(await this.db.rpc('accept_invitation', { p_token: token }), 'invitations.accept')
  }

  async removeMember(spaceId: UUID, userId: UUID) {
    check(await this.db.rpc('remove_space_member', { p_space_id: spaceId, p_user_id: userId }), 'members.remove')
  }

  // ─── Reference data ────────────────────────────────────────────────────────
  async listGroups(spaceId: UUID) {
    const rows = unwrap(
      await this.db.from('category_groups').select('*').eq('space_id', spaceId).is('archived_at', null).order('sort_order'),
      'groups.list',
    )
    return rows.map(toGroup)
  }

  async listCategories(spaceId: UUID) {
    const rows = unwrap(
      await this.db.from('categories').select('*').eq('space_id', spaceId).order('kind').order('sort_order').order('name'),
      'categories.list',
    )
    return rows.map(toCategory)
  }

  async createCategory(spaceId: UUID, input: CategoryInput) {
    const row = unwrap(
      await this.db
        .from('categories')
        .insert({
          space_id: spaceId,
          name: input.name,
          kind: input.kind,
          group_id: input.kind === 'expense' ? input.groupId : null,
          icon: input.icon,
          sort_order: 50,
        })
        .select('*')
        .single(),
      'categories.create',
    )
    return toCategory(row)
  }

  async updateCategory(spaceId: UUID, categoryId: UUID, input: Partial<CategoryInput>) {
    check(
      await this.db
        .from('categories')
        .update({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.groupId !== undefined ? { group_id: input.groupId } : {}),
          ...(input.icon !== undefined ? { icon: input.icon } : {}),
          ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        })
        .eq('space_id', spaceId)
        .eq('id', categoryId),
      'categories.update',
    )
  }

  async listAccounts(spaceId: UUID) {
    const rows = unwrap(await this.db.from('accounts').select('*').eq('space_id', spaceId).order('sort_order').order('name'), 'accounts.list')
    return rows.map(toAccount)
  }

  async saveAccount(spaceId: UUID, input: AccountInput) {
    const values = {
      space_id: spaceId,
      name: input.name,
      type: input.type,
      opening_balance_cents: input.openingBalanceCents,
      owner_id: input.ownerId,
      is_active: input.isActive,
    }
    const query = input.id
      ? this.db.from('accounts').update(values).eq('space_id', spaceId).eq('id', input.id)
      : this.db.from('accounts').insert(values)
    return toAccount(unwrap(await query.select('*').single(), 'accounts.save'))
  }

  async listCards(spaceId: UUID) {
    const rows = unwrap(await this.db.from('cards').select('*').eq('space_id', spaceId).order('name'), 'cards.list')
    return rows.map(toCard)
  }

  async saveCard(spaceId: UUID, input: CardInput) {
    const values = {
      space_id: spaceId,
      name: input.name,
      last_four: input.lastFour,
      closing_day: input.closingDay,
      due_day: input.dueDay,
      limit_cents: input.limitCents,
      holder_id: input.holderId,
      tone: input.tone,
      is_active: input.isActive,
    }
    const query = input.id
      ? this.db.from('cards').update(values).eq('space_id', spaceId).eq('id', input.id)
      : this.db.from('cards').insert(values)
    return toCard(unwrap(await query.select('*').single(), 'cards.save'))
  }

  // ─── Transactions ──────────────────────────────────────────────────────────
  async listTransactions(spaceId: UUID, query: TransactionQuery): Promise<Page<Transaction>> {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(Math.max(query.pageSize ?? 30, 1), 100)
    let q = this.db
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('space_id', spaceId)
      .is('deleted_at', null)
      .neq('type', 'transfer')
    if (query.from) q = q.gte('occurred_on', query.from)
    if (query.to) q = q.lte('occurred_on', query.to)
    if (query.type) q = q.eq('type', query.type)
    if (query.categoryId) q = query.categoryId === 'none' ? q.is('category_id', null) : q.eq('category_id', query.categoryId)
    if (query.memberId) q = q.eq('member_id', query.memberId)
    if (query.scope) q = q.eq('scope', query.scope)
    if (query.accountId) q = q.eq('account_id', query.accountId)
    if (query.cardId) q = q.eq('card_id', query.cardId)
    if (query.source === 'whatsapp') q = q.in('source', [...WHATSAPP_SOURCES])
    else if (query.source) q = q.eq('source', query.source)
    const search = query.search ? sanitizeSearch(query.search) : ''
    if (search) q = q.or(`description.ilike.*${search}*,merchant.ilike.*${search}*`)

    const sort = query.sort ?? 'date_desc'
    if (sort.startsWith('date')) {
      q = q.order('occurred_on', { ascending: sort === 'date_asc' }).order('created_at', { ascending: sort === 'date_asc' })
    } else {
      q = q.order('amount_cents', { ascending: sort === 'amount_asc' }).order('occurred_on', { ascending: false })
    }
    const from = (page - 1) * pageSize
    const { data, error, count } = await q.range(from, from + pageSize - 1)
    if (error) throw mapDbError(error, 'transactions.list')
    return { items: (data ?? []).map(toTransaction), total: count ?? 0, page, pageSize }
  }

  async getTransaction(spaceId: UUID, id: UUID) {
    const { data, error } = await this.db
      .from('transactions')
      .select('*')
      .eq('space_id', spaceId)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw mapDbError(error, 'transactions.get')
    return data ? toTransaction(data) : null
  }

  async createTransaction(spaceId: UUID, input: CreateTransactionInput) {
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
      created_by: this.userId,
      scope: input.scope,
      visibility: normalizeVisibility(input.scope, input.visibility),
      source: input.source ?? 'dashboard',
      source_ref: input.sourceRef ?? null,
      recurring_rule_id: input.recurringRuleId ?? null,
      recurring_occurrence_on: input.recurringOccurrenceOn ?? null,
    } satisfies Partial<TablesInsert<'transactions'>>

    let rows: TablesInsert<'transactions'>[]
    if (input.installments && input.installments >= 2) {
      const groupId = randomUUID()
      rows = buildInstallmentPlan(input.amountCents, input.installments, input.occurredOn).map((item) => ({
        ...base,
        amount_cents: item.amountCents,
        occurred_on: item.occurredOn,
        installment_group_id: groupId,
        installment_number: item.number,
        installment_count: item.count,
        installment_total_cents: input.amountCents,
      }))
    } else {
      rows = [{ ...base, amount_cents: input.amountCents, occurred_on: input.occurredOn }]
    }
    // A single INSERT statement: all installments or none.
    const inserted = unwrap(await this.db.from('transactions').insert(rows).select('*'), 'transactions.create')
    return inserted.map(toTransaction)
  }

  async updateTransaction(spaceId: UUID, id: UUID, input: TransactionInput) {
    const row = unwrap(
      await this.db
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
        .is('deleted_at', null)
        .select('*')
        .maybeSingle(),
      'transactions.update',
    )
    return toTransaction(row)
  }

  async deleteTransaction(spaceId: UUID, id: UUID, options?: { wholeInstallmentGroup?: boolean }) {
    const tx = await this.getTransaction(spaceId, id)
    if (!tx) throw new AppError('NOT_FOUND')
    let q = this.db
      .from('transactions')
      .update({ deleted_at: new Date().toISOString(), deleted_by: this.userId })
      .eq('space_id', spaceId)
      .is('deleted_at', null)
    q = options?.wholeInstallmentGroup && tx.installment ? q.eq('installment_group_id', tx.installment.groupId) : q.eq('id', id)
    const rows = unwrap(await q.select('id'), 'transactions.delete')
    return rows.length
  }

  // ─── Aggregations (SQL functions, RLS applies) ─────────────────────────────
  async categoryTotals(spaceId: UUID, from: string, to: string, perspective?: Perspective): Promise<CategoryTotal[]> {
    const rows = unwrap(
      await this.db.rpc('space_category_totals', {
        p_space_id: spaceId,
        p_from: from,
        p_to: to,
        p_member_id: perspective?.memberId ?? undefined,
        p_scope: perspective?.scope ?? undefined,
      }),
      'totals.categories',
    )
    return rows.map((r) => ({
      categoryId: r.category_id,
      type: r.type as 'income' | 'expense',
      totalCents: Number(r.total_cents),
      count: Number(r.tx_count),
    }))
  }

  async monthlyTotals(spaceId: UUID, fromMonth: MonthKey, toMonth: MonthKey, perspective?: Perspective): Promise<MonthlyTotal[]> {
    const rows = unwrap(
      await this.db.rpc('space_monthly_totals', {
        p_space_id: spaceId,
        p_from: monthStart(fromMonth),
        p_to: monthEnd(toMonth),
        p_member_id: perspective?.memberId ?? undefined,
        p_scope: perspective?.scope ?? undefined,
      }),
      'totals.monthly',
    )
    return rows.map((r) => ({
      month: r.month.slice(0, 7),
      incomeCents: Number(r.income_cents),
      expenseCents: Number(r.expense_cents),
      savingsCents: Number(r.savings_cents),
    }))
  }

  async cardTotals(spaceId: UUID, from: string, to: string) {
    const rows = unwrap(await this.db.rpc('card_spend_totals', { p_space_id: spaceId, p_from: from, p_to: to }), 'totals.cards')
    return rows.map((r) => ({ cardId: r.card_id, totalCents: Number(r.total_cents), count: Number(r.tx_count) }))
  }

  // ─── Planning ──────────────────────────────────────────────────────────────
  async getPlan(spaceId: UUID, month: MonthKey) {
    const { data: plan, error } = await this.db
      .from('monthly_plans')
      .select('*')
      .eq('space_id', spaceId)
      .eq('month', monthStart(month))
      .maybeSingle()
    if (error) throw mapDbError(error, 'plan.get')
    if (!plan) return null
    const [groups, categories] = await Promise.all([
      this.db.from('plan_group_budgets').select('*').eq('plan_id', plan.id),
      this.db.from('plan_category_budgets').select('*').eq('plan_id', plan.id),
    ])
    return {
      id: plan.id,
      spaceId: plan.space_id,
      month,
      expectedIncomeCents: plan.expected_income_cents,
      groups: unwrap(groups, 'plan.groups').map((g) => ({
        groupId: g.group_id,
        mode: g.mode as 'percent' | 'amount',
        percentBp: g.percent_bp,
        amountCents: g.amount_cents,
      })),
      categories: unwrap(categories, 'plan.categories').map((c) => ({ categoryId: c.category_id, amountCents: c.amount_cents })),
    }
  }

  async savePlan(spaceId: UUID, month: MonthKey, input: PlanInput) {
    check(
      await this.db.rpc('upsert_monthly_plan', {
        p_space_id: spaceId,
        p_month: monthStart(month),
        p_expected_income_cents: input.expectedIncomeCents,
        p_groups: input.groups.map((g) => ({ ...g })),
        p_categories: input.categories.map((c) => ({ ...c })),
      }),
      'plan.save',
    )
  }

  async copyPlan(spaceId: UUID, fromMonth: MonthKey, toMonth: MonthKey) {
    check(
      await this.db.rpc('copy_monthly_plan', { p_space_id: spaceId, p_from_month: monthStart(fromMonth), p_to_month: monthStart(toMonth) }),
      'plan.copy',
    )
  }

  // ─── Goals ─────────────────────────────────────────────────────────────────
  async listGoals(spaceId: UUID): Promise<Goal[]> {
    const rows = unwrap(
      await this.db.from('goals_with_progress').select('*').eq('space_id', spaceId).order('created_at'),
      'goals.list',
    )
    return rows.map(toGoal)
  }

  async saveGoal(spaceId: UUID, input: GoalInput) {
    const values = {
      space_id: spaceId,
      name: input.name,
      target_amount_cents: input.targetAmountCents,
      target_date: input.targetDate,
      scope: input.scope,
      owner_id: input.scope === 'personal' ? (input.ownerId ?? this.userId) : null,
      tone: input.tone,
    }
    let id = input.id
    if (id) {
      check(await this.db.from('goals').update(values).eq('space_id', spaceId).eq('id', id), 'goals.update')
    } else {
      const row = unwrap(await this.db.from('goals').insert({ ...values, created_by: this.userId }).select('id').single(), 'goals.create')
      id = row.id
      if (input.initialAmountCents && input.initialAmountCents > 0) {
        await this.addContribution(spaceId, id, {
          amountCents: input.initialAmountCents,
          contributedOn: new Date().toISOString().slice(0, 10),
          note: 'Valor inicial',
        })
      }
    }
    const goal = unwrap(await this.db.from('goals_with_progress').select('*').eq('id', id).single(), 'goals.read')
    return toGoal(goal)
  }

  async setGoalStatus(spaceId: UUID, goalId: UUID, status: Goal['status']) {
    check(
      await this.db
        .from('goals')
        .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
        .eq('space_id', spaceId)
        .eq('id', goalId),
      'goals.status',
    )
  }

  async listContributions(spaceId: UUID, goalId: UUID) {
    const rows = unwrap(
      await this.db
        .from('goal_contributions')
        .select('*')
        .eq('space_id', spaceId)
        .eq('goal_id', goalId)
        .order('contributed_on', { ascending: false })
        .limit(50),
      'goals.contributions',
    )
    return rows.map(toContribution)
  }

  async addContribution(spaceId: UUID, goalId: UUID, input: ContributionInput) {
    check(
      await this.db.from('goal_contributions').insert({
        goal_id: goalId,
        space_id: spaceId,
        amount_cents: input.amountCents,
        contributed_on: input.contributedOn,
        note: input.note,
        created_by: this.userId,
      }),
      'goals.contribute',
    )
  }

  // ─── Recurring ─────────────────────────────────────────────────────────────
  async listRecurring(spaceId: UUID) {
    const rows = unwrap(
      await this.db.from('recurring_rules').select('*').eq('space_id', spaceId).order('is_active', { ascending: false }).order('next_occurrence_on'),
      'recurring.list',
    )
    return rows.map(toRecurring)
  }

  async saveRecurring(spaceId: UUID, input: RecurringInput) {
    const values = {
      space_id: spaceId,
      type: input.type,
      description: input.description,
      amount_cents: input.amountCents,
      category_id: input.categoryId,
      account_id: input.accountId,
      card_id: input.type === 'expense' ? input.cardId : null,
      member_id: input.memberId,
      scope: input.scope,
      frequency: input.frequency,
      interval: input.interval,
      start_on: input.startOn,
      next_occurrence_on: input.nextOccurrenceOn,
      end_on: input.endOn,
      is_active: input.isActive,
    }
    const query = input.id
      ? this.db.from('recurring_rules').update(values).eq('space_id', spaceId).eq('id', input.id)
      : this.db.from('recurring_rules').insert({ ...values, created_by: this.userId })
    return toRecurring(unwrap(await query.select('*').single(), 'recurring.save'))
  }

  async deleteRecurring(spaceId: UUID, id: UUID) {
    check(await this.db.from('recurring_rules').delete().eq('space_id', spaceId).eq('id', id), 'recurring.delete')
  }

  async markRecurringPosted(spaceId: UUID, id: UUID, nextOccurrenceOn: string) {
    check(
      await this.db.from('recurring_rules').update({ next_occurrence_on: nextOccurrenceOn }).eq('space_id', spaceId).eq('id', id),
      'recurring.advance',
    )
  }

  // ─── WhatsApp (own identities only; verification happens in the webhook) ──
  async listWhatsAppIdentities() {
    const rows = unwrap(
      await this.db.from('whatsapp_identities').select('*').eq('user_id', this.userId).neq('status', 'revoked').order('created_at'),
      'whatsapp.identities',
    )
    return rows.map(toWhatsAppIdentity)
  }

  async startWhatsAppLink(phoneE164: string, spaceId: UUID) {
    const rows = unwrap(await this.db.rpc('start_whatsapp_link', { p_phone_e164: phoneE164, p_space_id: spaceId }), 'whatsapp.link')
    const row = rows[0]
    if (!row) throw new AppError('INTERNAL')
    return { identityId: row.identity_id, code: row.code, expiresAt: row.expires_at, status: row.status as 'pending' | 'verified' }
  }

  async revokeWhatsAppIdentity(identityId: UUID) {
    check(await this.db.rpc('revoke_whatsapp_identity', { p_identity_id: identityId }), 'whatsapp.revoke')
  }

  async listWhatsAppActivity(limit = 10): Promise<WhatsAppActivity[]> {
    const rows = unwrap(
      await this.db
        .from('whatsapp_messages')
        .select('id, direction, message_type, status, received_at, transaction_id')
        .eq('user_id', this.userId)
        .order('received_at', { ascending: false })
        .limit(limit),
      'whatsapp.activity',
    )
    return rows.map((r) => ({
      id: r.id,
      direction: r.direction as 'inbound' | 'outbound',
      messageType: r.message_type,
      status: r.status,
      receivedAt: r.received_at,
      transactionId: r.transaction_id,
    }))
  }
}
