import type { CategoryTotal } from '@/domain/finance'
import type {
  Account,
  AccountType,
  Card,
  Category,
  CategoryBudget,
  CategoryGroup,
  FinancialSpace,
  Goal,
  GoalContribution,
  GoalStatus,
  GroupBudget,
  Invitation,
  InvitationPreview,
  ISODate,
  MemberRole,
  MonthKey,
  MonthlyPlan,
  Profile,
  RecurrenceFrequency,
  RecurringRule,
  SpaceWithMembers,
  Tone,
  Transaction,
  TransactionScope,
  TransactionSource,
  TransactionType,
  TransactionVisibility,
  UUID,
  WhatsAppIdentity,
} from '@/domain/types'

/**
 * Data access contract used by pages and server actions. Two implementations:
 *  - SupabaseRepository: user-scoped client, RLS enforces isolation and privacy.
 *  - DemoRepository: in-memory, isolated, fictitious data (development/demo only).
 * Callers never know which one they got.
 */

export interface Perspective {
  /** Only transactions whose responsible member is this user. */
  memberId?: UUID | null
  scope?: TransactionScope | null
}

export interface TransactionQuery {
  from?: ISODate
  to?: ISODate
  type?: Exclude<TransactionType, 'transfer'>
  categoryId?: UUID
  memberId?: UUID
  scope?: TransactionScope
  accountId?: UUID
  cardId?: UUID
  source?: 'dashboard' | 'whatsapp' | 'recurring' | 'import'
  search?: string
  sort?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
  page?: number
  pageSize?: number
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface MonthlyTotal {
  month: MonthKey
  incomeCents: number
  expenseCents: number
  savingsCents: number
}

export interface TransactionInput {
  type: Exclude<TransactionType, 'transfer'>
  amountCents: number
  occurredOn: ISODate
  description: string
  merchant: string | null
  notes: string | null
  categoryId: UUID | null
  accountId: UUID | null
  cardId: UUID | null
  memberId: UUID
  scope: TransactionScope
  visibility: TransactionVisibility
}

export interface CreateTransactionInput extends TransactionInput {
  /** ≥ 2 splits the amount into monthly installments (card purchases). */
  installments?: number
  source?: TransactionSource
  sourceRef?: string | null
  recurringRuleId?: UUID | null
  recurringOccurrenceOn?: ISODate | null
}

export interface OnboardingInput {
  fullName: string
  spaceName: string
  spaceType: 'personal' | 'shared'
  expectedIncomeCents: number
  planMode: 'preset' | 'custom' | 'skip'
  groupPercents: Partial<Record<'essentials' | 'lifestyle' | 'savings', number>> | null
  categoryKeys: string[]
}

export interface PlanInput {
  expectedIncomeCents: number
  groups: GroupBudget[]
  categories: CategoryBudget[]
}

export interface CategoryInput {
  name: string
  kind: 'income' | 'expense'
  groupId: UUID | null
  icon: string | null
  isActive?: boolean
}

export interface AccountInput {
  id?: UUID
  name: string
  type: AccountType
  openingBalanceCents: number
  ownerId: UUID | null
  isActive: boolean
}

export interface CardInput {
  id?: UUID
  name: string
  lastFour: string | null
  closingDay: number
  dueDay: number
  limitCents: number | null
  holderId: UUID | null
  tone: Tone
  isActive: boolean
}

export interface GoalInput {
  id?: UUID
  name: string
  targetAmountCents: number
  targetDate: ISODate | null
  scope: TransactionScope
  ownerId: UUID | null
  tone: Tone
  initialAmountCents?: number
}

export interface ContributionInput {
  amountCents: number
  contributedOn: ISODate
  note: string | null
}

export interface RecurringInput {
  id?: UUID
  type: 'income' | 'expense'
  description: string
  amountCents: number
  categoryId: UUID | null
  accountId: UUID | null
  cardId: UUID | null
  memberId: UUID
  scope: TransactionScope
  frequency: RecurrenceFrequency
  interval: number
  startOn: ISODate
  nextOccurrenceOn: ISODate
  endOn: ISODate | null
  isActive: boolean
}

export interface WhatsAppActivity {
  id: UUID
  direction: 'inbound' | 'outbound'
  messageType: string
  status: string
  receivedAt: string
  transactionId: UUID | null
}

export interface SpaceSummary extends FinancialSpace {
  myRole: MemberRole
  memberCount: number
}

export interface FinanceRepository {
  readonly mode: 'supabase' | 'demo'

  getProfile(): Promise<Profile>
  updateProfile(input: { fullName?: string; timezone?: string; defaultSpaceId?: UUID }): Promise<void>

  listSpaces(): Promise<SpaceSummary[]>
  getSpace(spaceId: UUID): Promise<SpaceWithMembers | null>
  renameSpace(spaceId: UUID, name: string): Promise<void>
  completeOnboarding(input: OnboardingInput): Promise<UUID>

  listInvitations(spaceId: UUID): Promise<Invitation[]>
  createInvitation(spaceId: UUID, email: string, role: 'admin' | 'member'): Promise<{ invitation: Invitation; token: string }>
  revokeInvitation(invitationId: UUID): Promise<void>
  getInvitationPreview(token: string): Promise<InvitationPreview | null>
  acceptInvitation(token: string): Promise<UUID>
  removeMember(spaceId: UUID, userId: UUID): Promise<void>

  listGroups(spaceId: UUID): Promise<CategoryGroup[]>
  listCategories(spaceId: UUID): Promise<Category[]>
  createCategory(spaceId: UUID, input: CategoryInput): Promise<Category>
  updateCategory(spaceId: UUID, categoryId: UUID, input: Partial<CategoryInput>): Promise<void>

  listAccounts(spaceId: UUID): Promise<Account[]>
  saveAccount(spaceId: UUID, input: AccountInput): Promise<Account>
  listCards(spaceId: UUID): Promise<Card[]>
  saveCard(spaceId: UUID, input: CardInput): Promise<Card>

  listTransactions(spaceId: UUID, query: TransactionQuery): Promise<Page<Transaction>>
  getTransaction(spaceId: UUID, id: UUID): Promise<Transaction | null>
  createTransaction(spaceId: UUID, input: CreateTransactionInput): Promise<Transaction[]>
  updateTransaction(spaceId: UUID, id: UUID, input: TransactionInput): Promise<Transaction>
  deleteTransaction(spaceId: UUID, id: UUID, options?: { wholeInstallmentGroup?: boolean }): Promise<number>

  categoryTotals(spaceId: UUID, from: ISODate, to: ISODate, perspective?: Perspective): Promise<CategoryTotal[]>
  monthlyTotals(spaceId: UUID, fromMonth: MonthKey, toMonth: MonthKey, perspective?: Perspective): Promise<MonthlyTotal[]>
  cardTotals(spaceId: UUID, from: ISODate, to: ISODate): Promise<{ cardId: UUID; totalCents: number; count: number }[]>

  getPlan(spaceId: UUID, month: MonthKey): Promise<MonthlyPlan | null>
  savePlan(spaceId: UUID, month: MonthKey, input: PlanInput): Promise<void>
  copyPlan(spaceId: UUID, fromMonth: MonthKey, toMonth: MonthKey): Promise<void>

  listGoals(spaceId: UUID): Promise<Goal[]>
  saveGoal(spaceId: UUID, input: GoalInput): Promise<Goal>
  setGoalStatus(spaceId: UUID, goalId: UUID, status: GoalStatus): Promise<void>
  listContributions(spaceId: UUID, goalId: UUID): Promise<GoalContribution[]>
  addContribution(spaceId: UUID, goalId: UUID, input: ContributionInput): Promise<void>

  listRecurring(spaceId: UUID): Promise<RecurringRule[]>
  saveRecurring(spaceId: UUID, input: RecurringInput): Promise<RecurringRule>
  deleteRecurring(spaceId: UUID, id: UUID): Promise<void>
  /** Advances a rule after posting occurrences (idempotent via unique rule+date). */
  markRecurringPosted(spaceId: UUID, id: UUID, nextOccurrenceOn: ISODate): Promise<void>

  listWhatsAppIdentities(): Promise<WhatsAppIdentity[]>
  startWhatsAppLink(phoneE164: string, spaceId: UUID): Promise<{ identityId: UUID; code: string | null; expiresAt: string | null; status: 'pending' | 'verified' }>
  revokeWhatsAppIdentity(identityId: UUID): Promise<void>
  listWhatsAppActivity(limit?: number): Promise<WhatsAppActivity[]>
}
