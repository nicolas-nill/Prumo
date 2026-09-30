import 'server-only'
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import { CATALOG_CATEGORIES, CATALOG_GROUPS } from '@/domain/catalog'
import { PLAN_ENTITLEMENTS } from '@/domain/entitlements'
import { monthEnd, monthOf, monthStart, todayIn } from '@/domain/dates'
import { buildInstallmentPlan, isSavingsCategory, indexCategories, type CategoryTotal } from '@/domain/finance'
import { canEditTransaction, canPerform, canRemoveMember, canViewTransaction, normalizeVisibility } from '@/domain/permissions'
import type { Goal, GoalStatus, MonthKey, SpaceWithMembers, UUID } from '@/domain/types'
import { AppError } from '@/lib/errors'
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
import type { DemoDb, StoredTransaction } from './store'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Same authorization and privacy rules as the RLS policies, applied in memory. */
export class DemoRepository implements FinanceRepository {
  readonly mode = 'demo' as const

  constructor(
    private readonly db: DemoDb,
    private readonly userId: UUID,
  ) {}

  private member(spaceId: UUID) {
    return this.db.members.find((m) => m.spaceId === spaceId && m.userId === this.userId && m.status === 'active')
  }

  private requireMember(spaceId: UUID) {
    const m = this.member(spaceId)
    if (!m) throw new AppError('FORBIDDEN')
    return m
  }

  private visible(tx: StoredTransaction) {
    return !tx.deletedAt && canViewTransaction(tx, this.userId)
  }

  private audit(spaceId: UUID, action: string, entityId: UUID) {
    this.db.audit.push({ spaceId, actorId: this.userId, action, entityId, at: new Date().toISOString() })
  }

  // ─── Profile & spaces ──────────────────────────────────────────────────────
  async getProfile() {
    const profile = this.db.profiles.get(this.userId)
    if (!profile) throw new AppError('UNAUTHENTICATED')
    return { ...profile }
  }

  async updateProfile(input: { fullName?: string; timezone?: string; defaultSpaceId?: UUID }) {
    const profile = await this.getProfile()
    if (input.defaultSpaceId) this.requireMember(input.defaultSpaceId)
    this.db.profiles.set(this.userId, {
      ...profile,
      fullName: input.fullName ?? profile.fullName,
      timezone: input.timezone ?? profile.timezone,
      defaultSpaceId: input.defaultSpaceId ?? profile.defaultSpaceId,
    })
  }

  async listSpaces(): Promise<SpaceSummary[]> {
    return this.db.spaces
      .filter((s) => this.member(s.id))
      .map((s) => ({
        ...s,
        myRole: this.member(s.id)!.role,
        memberCount: this.db.members.filter((m) => m.spaceId === s.id && m.status === 'active').length,
      }))
  }

  async getSpace(spaceId: UUID): Promise<SpaceWithMembers | null> {
    const me = this.member(spaceId)
    const space = this.db.spaces.find((s) => s.id === spaceId)
    if (!me || !space) return null
    return {
      ...space,
      myRole: me.role,
      members: this.db.members
        .filter((m) => m.spaceId === spaceId && m.status === 'active')
        .map((m) => {
          const p = this.db.profiles.get(m.userId)
          return { userId: m.userId, role: m.role, status: m.status, joinedAt: m.joinedAt, fullName: p?.fullName ?? 'Membro', avatarUrl: null }
        }),
    }
  }

  async renameSpace(spaceId: UUID, name: string) {
    if (!canPerform(this.requireMember(spaceId).role, 'space.update')) throw new AppError('FORBIDDEN')
    const space = this.db.spaces.find((s) => s.id === spaceId)
    if (space) space.name = name
  }

  async completeOnboarding(input: OnboardingInput) {
    const profile = await this.getProfile()
    const spaceId = randomUUID()
    const now = new Date().toISOString()
    this.db.spaces.push({
      id: spaceId,
      name: input.spaceName,
      type: input.spaceType,
      currency: 'BRL',
      timezone: profile.timezone,
      plan: 'free',
      ownerId: this.userId,
      createdAt: now,
    })
    this.db.members.push({ spaceId, userId: this.userId, role: 'owner', status: 'active', joinedAt: now })
    const groupIds = new Map(CATALOG_GROUPS.map((g) => [g.key, randomUUID()]))
    for (const g of CATALOG_GROUPS) {
      this.db.groups.push({ id: groupIds.get(g.key)!, spaceId, key: g.key, name: g.name, tone: g.tone, sortOrder: g.sortOrder, isSavings: g.isSavings, isSystem: true })
    }
    for (const c of CATALOG_CATEGORIES.filter((c) => c.required || input.categoryKeys.includes(c.key))) {
      this.db.categories.push({
        id: randomUUID(),
        spaceId,
        groupId: c.group ? groupIds.get(c.group)! : null,
        systemKey: c.key,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
        tone: null,
        isActive: true,
        isSystem: true,
        sortOrder: c.sortOrder,
      })
    }
    if (input.planMode !== 'skip') {
      const preset = { essentials: 5000, lifestyle: 4000, savings: 1000 }
      this.db.plans.push({
        id: randomUUID(),
        spaceId,
        month: monthOf(todayIn(profile.timezone)),
        expectedIncomeCents: input.expectedIncomeCents,
        groups: CATALOG_GROUPS.map((g) => ({
          groupId: groupIds.get(g.key)!,
          mode: 'percent',
          percentBp: input.planMode === 'custom' ? (input.groupPercents?.[g.key] ?? 0) : preset[g.key],
          amountCents: null,
        })),
        categories: [],
      })
    }
    this.db.profiles.set(this.userId, { ...profile, fullName: input.fullName, defaultSpaceId: spaceId, onboardedAt: now })
    return spaceId
  }

  // ─── Invitations & members ─────────────────────────────────────────────────
  async listInvitations(spaceId: UUID) {
    this.requireMember(spaceId)
    return this.db.invitations.filter((i) => i.spaceId === spaceId).map(({ tokenHash: _t, ...rest }) => rest)
  }

  async createInvitation(spaceId: UUID, email: string, role: 'admin' | 'member') {
    if (!canPerform(this.requireMember(spaceId).role, 'members.invite')) throw new AppError('FORBIDDEN')
    const normalized = email.trim().toLowerCase()
    const space = this.db.spaces.find((s) => s.id === spaceId)!
    const active = this.db.members.filter((m) => m.spaceId === spaceId && m.status === 'active')
    if (active.some((m) => this.db.users.find((u) => u.id === m.userId)?.email === normalized)) {
      throw new AppError('CONFLICT', 'Essa pessoa já faz parte do espaço.')
    }
    for (const inv of this.db.invitations) if (inv.spaceId === spaceId && inv.email === normalized && inv.status === 'pending') inv.status = 'revoked'
    const pending = this.db.invitations.filter((i) => i.spaceId === spaceId && i.status === 'pending').length
    if (active.length + pending >= PLAN_ENTITLEMENTS[space.plan].maxMembers) throw new AppError('LIMIT_REACHED')
    const token = randomBytes(24).toString('base64url')
    const invitation = {
      id: randomUUID(),
      spaceId,
      email: normalized,
      role,
      status: 'pending' as const,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      createdAt: new Date().toISOString(),
      invitedBy: this.userId,
      acceptedAt: null,
      tokenHash: sha256(token),
    }
    this.db.invitations.push(invitation)
    space.type = 'shared'
    this.audit(spaceId, 'invitation.created', invitation.id)
    const { tokenHash: _t, ...publicInvitation } = invitation
    return { invitation: publicInvitation, token }
  }

  async revokeInvitation(invitationId: UUID) {
    const inv = this.db.invitations.find((i) => i.id === invitationId)
    if (!inv || !canPerform(this.member(inv.spaceId)?.role, 'members.invite')) throw new AppError('FORBIDDEN')
    if (inv.status === 'pending') inv.status = 'revoked'
  }

  async getInvitationPreview(token: string) {
    const inv = this.db.invitations.find((i) => i.tokenHash === sha256(token))
    if (!inv) return null
    const [local = '', domain = ''] = inv.email.split('@')
    const expired = inv.status === 'pending' && new Date(inv.expiresAt).getTime() < Date.now()
    return {
      spaceName: this.db.spaces.find((s) => s.id === inv.spaceId)?.name ?? 'Espaço',
      inviterName: this.db.profiles.get(inv.invitedBy)?.fullName ?? 'Alguém',
      email: `${local.slice(0, 2)}•••@${domain}`,
      status: expired ? ('expired' as const) : inv.status,
      expired,
    }
  }

  async acceptInvitation(token: string): Promise<UUID> {
    const inv = this.db.invitations.find((i) => i.tokenHash === sha256(token))
    if (!inv) throw new AppError('NOT_FOUND')
    if (inv.status === 'accepted' && this.member(inv.spaceId)) return inv.spaceId
    if (inv.status !== 'pending' || new Date(inv.expiresAt).getTime() < Date.now()) {
      throw new AppError('VALIDATION', 'Este convite não é mais válido. Peça um novo link.')
    }
    const me = this.db.users.find((u) => u.id === this.userId)
    if (me?.email !== inv.email) {
      throw new AppError('FORBIDDEN', 'Este convite foi enviado para outro e-mail. Entre com a conta convidada.')
    }
    this.db.members.push({ spaceId: inv.spaceId, userId: this.userId, role: inv.role, status: 'active', joinedAt: new Date().toISOString() })
    inv.status = 'accepted'
    inv.acceptedAt = new Date().toISOString()
    return inv.spaceId
  }

  async removeMember(spaceId: UUID, userId: UUID) {
    const actor = this.requireMember(spaceId)
    const target = this.db.members.find((m) => m.spaceId === spaceId && m.userId === userId && m.status === 'active')
    if (!target) throw new AppError('NOT_FOUND')
    if (!canRemoveMember(actor.role, target.role, this.userId, userId)) throw new AppError('FORBIDDEN')
    target.status = 'removed'
    this.audit(spaceId, 'member.removed', userId)
  }

  // ─── Reference data ────────────────────────────────────────────────────────
  async listGroups(spaceId: UUID) {
    this.requireMember(spaceId)
    return this.db.groups.filter((g) => g.spaceId === spaceId).sort((a, b) => a.sortOrder - b.sortOrder)
  }

  async listCategories(spaceId: UUID) {
    this.requireMember(spaceId)
    return this.db.categories
      .filter((c) => c.spaceId === spaceId)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  }

  async createCategory(spaceId: UUID, input: CategoryInput) {
    this.requireMember(spaceId)
    if (this.db.categories.some((c) => c.spaceId === spaceId && c.isActive && c.kind === input.kind && normalize(c.name) === normalize(input.name))) {
      throw new AppError('CONFLICT', 'Já existe uma categoria com esse nome.')
    }
    const category = {
      id: randomUUID(),
      spaceId,
      groupId: input.kind === 'expense' ? input.groupId : null,
      systemKey: null,
      name: input.name,
      kind: input.kind,
      icon: input.icon,
      tone: null,
      isActive: true,
      isSystem: false,
      sortOrder: 50,
    }
    this.db.categories.push(category)
    return category
  }

  async updateCategory(spaceId: UUID, categoryId: UUID, input: Partial<CategoryInput>) {
    this.requireMember(spaceId)
    const c = this.db.categories.find((x) => x.spaceId === spaceId && x.id === categoryId)
    if (!c) throw new AppError('NOT_FOUND')
    Object.assign(c, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    })
  }

  async listAccounts(spaceId: UUID) {
    this.requireMember(spaceId)
    return this.db.accounts.filter((a) => a.spaceId === spaceId).sort((a, b) => a.sortOrder - b.sortOrder)
  }

  async saveAccount(spaceId: UUID, input: AccountInput) {
    this.requireMember(spaceId)
    const existing = input.id ? this.db.accounts.find((a) => a.spaceId === spaceId && a.id === input.id) : undefined
    if (input.id && !existing) throw new AppError('NOT_FOUND')
    const account = { ...(existing ?? { id: randomUUID(), spaceId, sortOrder: this.db.accounts.length + 1 }), ...input, id: existing?.id ?? randomUUID() }
    if (existing) Object.assign(existing, account)
    else this.db.accounts.push(account)
    return account
  }

  async listCards(spaceId: UUID) {
    this.requireMember(spaceId)
    return this.db.cards.filter((c) => c.spaceId === spaceId)
  }

  async saveCard(spaceId: UUID, input: CardInput) {
    this.requireMember(spaceId)
    const existing = input.id ? this.db.cards.find((c) => c.spaceId === spaceId && c.id === input.id) : undefined
    if (input.id && !existing) throw new AppError('NOT_FOUND')
    const card = { ...input, id: existing?.id ?? randomUUID(), spaceId }
    if (existing) Object.assign(existing, card)
    else this.db.cards.push(card)
    return card
  }

  // ─── Transactions ──────────────────────────────────────────────────────────
  private query(spaceId: UUID) {
    this.requireMember(spaceId)
    return this.db.transactions.filter((t) => t.spaceId === spaceId && this.visible(t))
  }

  async listTransactions(spaceId: UUID, query: TransactionQuery): Promise<Page<StoredTransaction>> {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(Math.max(query.pageSize ?? 30, 1), 100)
    const search = query.search ? normalize(query.search.trim()) : ''
    const rows = this.query(spaceId).filter(
      (t) =>
        t.type !== 'transfer' &&
        (!query.from || t.occurredOn >= query.from) &&
        (!query.to || t.occurredOn <= query.to) &&
        (!query.type || t.type === query.type) &&
        (!query.categoryId || (query.categoryId === 'none' ? t.categoryId === null : t.categoryId === query.categoryId)) &&
        (!query.memberId || t.memberId === query.memberId) &&
        (!query.scope || t.scope === query.scope) &&
        (!query.accountId || t.accountId === query.accountId) &&
        (!query.cardId || t.cardId === query.cardId) &&
        (!query.source || (query.source === 'whatsapp' ? t.source.startsWith('whatsapp') : t.source === query.source)) &&
        (!search || normalize(`${t.description} ${t.merchant ?? ''}`).includes(search)),
    )
    const sort = query.sort ?? 'date_desc'
    rows.sort((a, b) => {
      if (sort === 'amount_desc') return b.amountCents - a.amountCents
      if (sort === 'amount_asc') return a.amountCents - b.amountCents
      const cmp = a.occurredOn.localeCompare(b.occurredOn) || a.createdAt.localeCompare(b.createdAt)
      return sort === 'date_asc' ? cmp : -cmp
    })
    return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize }
  }

  async getTransaction(spaceId: UUID, id: UUID) {
    return this.query(spaceId).find((t) => t.id === id) ?? null
  }

  private validateRefs(spaceId: UUID, input: TransactionInput) {
    const ok =
      (!input.categoryId || this.db.categories.some((c) => c.spaceId === spaceId && c.id === input.categoryId)) &&
      (!input.accountId || this.db.accounts.some((a) => a.spaceId === spaceId && a.id === input.accountId)) &&
      (!input.cardId || this.db.cards.some((c) => c.spaceId === spaceId && c.id === input.cardId)) &&
      this.db.members.some((m) => m.spaceId === spaceId && m.userId === input.memberId)
    if (!ok) throw new AppError('VALIDATION', 'Uma referência escolhida não pertence a este espaço.')
  }

  async createTransaction(spaceId: UUID, input: CreateTransactionInput) {
    this.requireMember(spaceId)
    this.validateRefs(spaceId, input)
    if (input.sourceRef && this.db.transactions.some((t) => t.spaceId === spaceId && t.source === input.source && t.sourceRef === input.sourceRef)) {
      throw new AppError('CONFLICT', 'Essa movimentação já foi registrada.')
    }
    if (
      input.recurringRuleId &&
      this.db.transactions.some((t) => t.recurringRuleId === input.recurringRuleId && t.recurringOccurrenceOn === input.recurringOccurrenceOn)
    ) {
      throw new AppError('CONFLICT', 'Essa ocorrência já foi lançada.')
    }
    const now = new Date().toISOString()
    const base = {
      spaceId,
      type: input.type,
      status: 'confirmed' as const,
      description: input.description,
      merchant: input.merchant,
      notes: input.notes,
      categoryId: input.categoryId,
      accountId: input.accountId,
      cardId: input.type === 'expense' ? input.cardId : null,
      memberId: input.memberId,
      createdBy: this.userId,
      scope: input.scope,
      visibility: normalizeVisibility(input.scope, input.visibility),
      source: input.source ?? 'dashboard',
      recurringRuleId: input.recurringRuleId ?? null,
      recurringOccurrenceOn: input.recurringOccurrenceOn ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      sourceRef: input.sourceRef ?? null,
    }
    const plan =
      input.installments && input.installments >= 2
        ? buildInstallmentPlan(input.amountCents, input.installments, input.occurredOn)
        : [{ number: 1, count: 1, amountCents: input.amountCents, occurredOn: input.occurredOn }]
    const groupId = randomUUID()
    const created: StoredTransaction[] = plan.map((item) => ({
      ...base,
      id: randomUUID(),
      amountCents: item.amountCents,
      occurredOn: item.occurredOn,
      installment: plan.length > 1 ? { groupId, number: item.number, count: item.count, totalCents: input.amountCents } : null,
    }))
    this.db.transactions.push(...created)
    for (const t of created) this.audit(spaceId, 'transaction.created', t.id)
    return created
  }

  async updateTransaction(spaceId: UUID, id: UUID, input: TransactionInput) {
    const tx = await this.getTransaction(spaceId, id)
    if (!tx) throw new AppError('NOT_FOUND')
    if (!canEditTransaction(tx, this.userId)) throw new AppError('FORBIDDEN', 'Só quem registrou ou é responsável pode editar uma movimentação pessoal.')
    this.validateRefs(spaceId, input)
    Object.assign(tx, {
      ...input,
      cardId: input.type === 'expense' ? input.cardId : null,
      visibility: normalizeVisibility(input.scope, input.visibility),
      updatedAt: new Date().toISOString(),
    })
    this.audit(spaceId, 'transaction.updated', id)
    return tx
  }

  async deleteTransaction(spaceId: UUID, id: UUID, options?: { wholeInstallmentGroup?: boolean }) {
    const tx = await this.getTransaction(spaceId, id)
    if (!tx) throw new AppError('NOT_FOUND')
    if (!canEditTransaction(tx, this.userId)) throw new AppError('FORBIDDEN')
    const targets =
      options?.wholeInstallmentGroup && tx.installment
        ? this.query(spaceId).filter((t) => t.installment?.groupId === tx.installment!.groupId)
        : [tx]
    const now = new Date().toISOString()
    for (const t of targets) {
      t.deletedAt = now
      this.audit(spaceId, 'transaction.deleted', t.id)
    }
    return targets.length
  }

  // ─── Aggregations ──────────────────────────────────────────────────────────
  private scoped(spaceId: UUID, from: string, to: string, perspective?: Perspective) {
    return this.query(spaceId).filter(
      (t) =>
        t.status === 'confirmed' &&
        t.type !== 'transfer' &&
        t.occurredOn >= from &&
        t.occurredOn <= to &&
        (!perspective?.memberId || t.memberId === perspective.memberId) &&
        (!perspective?.scope || t.scope === perspective.scope),
    )
  }

  async categoryTotals(spaceId: UUID, from: string, to: string, perspective?: Perspective): Promise<CategoryTotal[]> {
    const map = new Map<string, CategoryTotal>()
    for (const t of this.scoped(spaceId, from, to, perspective)) {
      const key = `${t.categoryId}:${t.type}`
      const row = map.get(key) ?? { categoryId: t.categoryId, type: t.type as 'income' | 'expense', totalCents: 0, count: 0 }
      row.totalCents += t.amountCents
      row.count += 1
      map.set(key, row)
    }
    return [...map.values()]
  }

  async monthlyTotals(spaceId: UUID, fromMonth: MonthKey, toMonth: MonthKey, perspective?: Perspective): Promise<MonthlyTotal[]> {
    const index = indexCategories(this.db.categories.filter((c) => c.spaceId === spaceId), this.db.groups.filter((g) => g.spaceId === spaceId))
    const map = new Map<string, MonthlyTotal>()
    for (const t of this.scoped(spaceId, monthStart(fromMonth), monthEnd(toMonth), perspective)) {
      const month = monthOf(t.occurredOn)
      const row = map.get(month) ?? { month, incomeCents: 0, expenseCents: 0, savingsCents: 0 }
      if (t.type === 'income') row.incomeCents += t.amountCents
      else if (isSavingsCategory(t.categoryId, index)) row.savingsCents += t.amountCents
      else row.expenseCents += t.amountCents
      map.set(month, row)
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month))
  }

  async cardTotals(spaceId: UUID, from: string, to: string) {
    const map = new Map<string, { cardId: string; totalCents: number; count: number }>()
    for (const t of this.scoped(spaceId, from, to)) {
      if (!t.cardId) continue
      const row = map.get(t.cardId) ?? { cardId: t.cardId, totalCents: 0, count: 0 }
      row.totalCents += t.amountCents
      row.count += 1
      map.set(t.cardId, row)
    }
    return [...map.values()]
  }

  // ─── Planning ──────────────────────────────────────────────────────────────
  async getPlan(spaceId: UUID, month: MonthKey) {
    this.requireMember(spaceId)
    const plan = this.db.plans.find((p) => p.spaceId === spaceId && p.month === month)
    return plan ? structuredClone(plan) : null
  }

  async savePlan(spaceId: UUID, month: MonthKey, input: PlanInput) {
    this.requireMember(spaceId)
    const existing = this.db.plans.find((p) => p.spaceId === spaceId && p.month === month)
    if (existing) Object.assign(existing, structuredClone(input))
    else this.db.plans.push({ id: randomUUID(), spaceId, month, ...structuredClone(input) })
  }

  async copyPlan(spaceId: UUID, fromMonth: MonthKey, toMonth: MonthKey) {
    const source = await this.getPlan(spaceId, fromMonth)
    if (!source) throw new AppError('NOT_FOUND', 'Não há planejamento no mês anterior para copiar.')
    await this.savePlan(spaceId, toMonth, { expectedIncomeCents: source.expectedIncomeCents, groups: source.groups, categories: source.categories })
  }

  // ─── Goals ─────────────────────────────────────────────────────────────────
  async listGoals(spaceId: UUID): Promise<Goal[]> {
    this.requireMember(spaceId)
    return this.db.goals
      .filter((g) => g.spaceId === spaceId)
      .map((g) => ({
        ...g,
        currentAmountCents: this.db.contributions.filter((c) => c.goalId === g.id).reduce((acc, c) => acc + c.amountCents, 0),
      }))
  }

  async saveGoal(spaceId: UUID, input: GoalInput) {
    this.requireMember(spaceId)
    const values = {
      name: input.name,
      targetAmountCents: input.targetAmountCents,
      targetDate: input.targetDate,
      scope: input.scope,
      ownerId: input.scope === 'personal' ? (input.ownerId ?? this.userId) : null,
      tone: input.tone,
    }
    let id = input.id
    if (id) {
      const goal = this.db.goals.find((g) => g.spaceId === spaceId && g.id === id)
      if (!goal) throw new AppError('NOT_FOUND')
      Object.assign(goal, values)
    } else {
      id = randomUUID()
      this.db.goals.push({ id, spaceId, status: 'active', createdAt: new Date().toISOString(), ...values })
      if (input.initialAmountCents && input.initialAmountCents > 0) {
        await this.addContribution(spaceId, id, { amountCents: input.initialAmountCents, contributedOn: todayIn(), note: 'Valor inicial' })
      }
    }
    return (await this.listGoals(spaceId)).find((g) => g.id === id)!
  }

  async setGoalStatus(spaceId: UUID, goalId: UUID, status: GoalStatus) {
    this.requireMember(spaceId)
    const goal = this.db.goals.find((g) => g.spaceId === spaceId && g.id === goalId)
    if (!goal) throw new AppError('NOT_FOUND')
    goal.status = status
  }

  async listContributions(spaceId: UUID, goalId: UUID) {
    this.requireMember(spaceId)
    return this.db.contributions.filter((c) => c.goalId === goalId).sort((a, b) => b.contributedOn.localeCompare(a.contributedOn))
  }

  async addContribution(spaceId: UUID, goalId: UUID, input: ContributionInput) {
    this.requireMember(spaceId)
    if (!this.db.goals.some((g) => g.spaceId === spaceId && g.id === goalId)) throw new AppError('NOT_FOUND')
    this.db.contributions.push({ id: randomUUID(), goalId, createdBy: this.userId, ...input })
  }

  // ─── Recurring ─────────────────────────────────────────────────────────────
  async listRecurring(spaceId: UUID) {
    this.requireMember(spaceId)
    return this.db.recurring
      .filter((r) => r.spaceId === spaceId)
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.nextOccurrenceOn.localeCompare(b.nextOccurrenceOn))
  }

  async saveRecurring(spaceId: UUID, input: RecurringInput) {
    this.requireMember(spaceId)
    const existing = input.id ? this.db.recurring.find((r) => r.spaceId === spaceId && r.id === input.id) : undefined
    if (input.id && !existing) throw new AppError('NOT_FOUND')
    const rule = { ...input, id: existing?.id ?? randomUUID(), spaceId, autoPost: true, cardId: input.type === 'expense' ? input.cardId : null }
    if (existing) Object.assign(existing, rule)
    else this.db.recurring.push(rule)
    return rule
  }

  async deleteRecurring(spaceId: UUID, id: UUID) {
    this.requireMember(spaceId)
    this.db.recurring = this.db.recurring.filter((r) => !(r.spaceId === spaceId && r.id === id))
  }

  async markRecurringPosted(spaceId: UUID, id: UUID, nextOccurrenceOn: string) {
    this.requireMember(spaceId)
    const rule = this.db.recurring.find((r) => r.spaceId === spaceId && r.id === id)
    if (rule) rule.nextOccurrenceOn = nextOccurrenceOn
  }

  // ─── WhatsApp ──────────────────────────────────────────────────────────────
  async listWhatsAppIdentities() {
    return this.db.identities
      .filter((i) => i.userId === this.userId && i.status !== 'revoked')
      .map(({ codeHash: _c, codeExpiresAt: _e, attempts: _a, ...rest }) => rest)
  }

  async startWhatsAppLink(phoneE164: string, spaceId: UUID) {
    this.requireMember(spaceId)
    if (this.db.identities.some((i) => i.phoneE164 === phoneE164 && i.status === 'verified' && i.userId !== this.userId)) {
      throw new AppError('CONFLICT', 'Esse número já está vinculado a outra conta.')
    }
    let identity = this.db.identities.find((i) => i.userId === this.userId && i.phoneE164 === phoneE164 && i.status !== 'revoked')
    if (identity?.status === 'verified') {
      identity.defaultSpaceId = spaceId
      return { identityId: identity.id, code: null, expiresAt: null, status: 'verified' as const }
    }
    if (!identity) {
      identity = {
        id: randomUUID(),
        userId: this.userId,
        phoneE164,
        status: 'pending',
        defaultSpaceId: spaceId,
        verifiedAt: null,
        createdAt: new Date().toISOString(),
        codeHash: null,
        codeExpiresAt: null,
        attempts: 0,
      }
      this.db.identities.push(identity)
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    identity.codeHash = sha256(`${identity.id}:${code}`)
    identity.codeExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
    identity.attempts = 0
    identity.defaultSpaceId = spaceId
    return { identityId: identity.id, code, expiresAt: identity.codeExpiresAt, status: 'pending' as const }
  }

  async revokeWhatsAppIdentity(identityId: UUID) {
    const identity = this.db.identities.find((i) => i.id === identityId && i.userId === this.userId)
    if (!identity) throw new AppError('NOT_FOUND')
    identity.status = 'revoked'
  }

  async listWhatsAppActivity(limit = 10): Promise<WhatsAppActivity[]> {
    return this.db.messages
      .filter((m) => m.userId === this.userId)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .slice(0, limit)
      .map((m) => ({
        id: m.id,
        direction: m.direction,
        messageType: m.messageType,
        status: m.status,
        receivedAt: m.receivedAt,
        transactionId: m.transactionId,
      }))
  }
}
