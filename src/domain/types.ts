/**
 * Domain model. Money is always integer cents (`*Cents`), dates are ISO calendar dates
 * (`YYYY-MM-DD`) interpreted in the space timezone, months are `YYYY-MM`.
 */

export type UUID = string
export type ISODate = string
export type MonthKey = string

export type SpaceType = 'personal' | 'shared'
export type MemberRole = 'owner' | 'admin' | 'member'
export type MemberStatus = 'active' | 'removed'
export type PlanCode = 'free' | 'premium'

export type TransactionType = 'income' | 'expense' | 'transfer'
export type TransactionScope = 'personal' | 'shared'
export type TransactionVisibility = 'space' | 'private'
export type TransactionStatus = 'confirmed' | 'pending'
export type TransactionSource =
  | 'dashboard'
  | 'whatsapp_text'
  | 'whatsapp_audio'
  | 'whatsapp_image'
  | 'import'
  | 'recurring'
  | 'open_finance'

export type CategoryKind = 'income' | 'expense'
export const TONES = ['blue', 'rose', 'lilac', 'sage', 'sand', 'slate'] as const
export type Tone = (typeof TONES)[number]

export type AccountType = 'checking' | 'savings' | 'wallet' | 'cash' | 'other'
export type RecurrenceFrequency = 'weekly' | 'monthly' | 'yearly'
export type GoalStatus = 'active' | 'completed' | 'archived'
export type AllocationMode = 'percent' | 'amount'
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export interface Profile {
  id: UUID
  email: string | null
  fullName: string | null
  avatarUrl: string | null
  timezone: string
  currency: string
  locale: string
  onboardedAt: string | null
  defaultSpaceId: UUID | null
}

export interface SpaceMember {
  userId: UUID
  role: MemberRole
  status: MemberStatus
  joinedAt: string
  fullName: string
  avatarUrl: string | null
}

export interface FinancialSpace {
  id: UUID
  name: string
  type: SpaceType
  currency: string
  timezone: string
  plan: PlanCode
  ownerId: UUID
  createdAt: string
}

export interface SpaceWithMembers extends FinancialSpace {
  members: SpaceMember[]
  myRole: MemberRole
}

export type GroupKey = 'essentials' | 'lifestyle' | 'savings'

export interface CategoryGroup {
  id: UUID
  spaceId: UUID
  /** System preset key for the default groups; null for user-created groups. */
  key: GroupKey | null
  name: string
  tone: Tone
  sortOrder: number
  isSavings: boolean
  isSystem: boolean
}

export interface Category {
  id: UUID
  spaceId: UUID
  groupId: UUID | null
  /** Stable catalog key (see domain/catalog.ts); null for user-created categories. */
  systemKey: string | null
  name: string
  kind: CategoryKind
  icon: string | null
  tone: Tone | null
  isActive: boolean
  isSystem: boolean
  sortOrder: number
}

export interface Account {
  id: UUID
  spaceId: UUID
  name: string
  type: AccountType
  openingBalanceCents: number
  ownerId: UUID | null
  isActive: boolean
  sortOrder: number
}

export interface Card {
  id: UUID
  spaceId: UUID
  name: string
  lastFour: string | null
  closingDay: number
  dueDay: number
  limitCents: number | null
  holderId: UUID | null
  tone: Tone
  isActive: boolean
}

export interface InstallmentInfo {
  groupId: UUID
  number: number
  count: number
  totalCents: number
}

export interface Transaction {
  id: UUID
  spaceId: UUID
  type: TransactionType
  status: TransactionStatus
  amountCents: number
  occurredOn: ISODate
  description: string
  merchant: string | null
  notes: string | null
  categoryId: UUID | null
  accountId: UUID | null
  cardId: UUID | null
  memberId: UUID
  createdBy: UUID
  scope: TransactionScope
  visibility: TransactionVisibility
  source: TransactionSource
  installment: InstallmentInfo | null
  recurringRuleId: UUID | null
  createdAt: string
  updatedAt: string
}

export interface TransactionView extends Transaction {
  category: Pick<Category, 'id' | 'name' | 'tone' | 'icon' | 'groupId' | 'kind'> | null
  account: Pick<Account, 'id' | 'name'> | null
  card: Pick<Card, 'id' | 'name' | 'lastFour'> | null
  member: { id: UUID; fullName: string } | null
}

export interface GroupBudget {
  groupId: UUID
  mode: AllocationMode
  percentBp: number | null
  amountCents: number | null
}

export interface CategoryBudget {
  categoryId: UUID
  amountCents: number
}

export interface MonthlyPlan {
  id: UUID
  spaceId: UUID
  month: MonthKey
  expectedIncomeCents: number
  groups: GroupBudget[]
  categories: CategoryBudget[]
}

export interface Goal {
  id: UUID
  spaceId: UUID
  name: string
  targetAmountCents: number
  currentAmountCents: number
  targetDate: ISODate | null
  status: GoalStatus
  scope: TransactionScope
  ownerId: UUID | null
  tone: Tone
  createdAt: string
}

export interface GoalContribution {
  id: UUID
  goalId: UUID
  amountCents: number
  contributedOn: ISODate
  note: string | null
  createdBy: UUID
}

export interface RecurringRule {
  id: UUID
  spaceId: UUID
  type: Exclude<TransactionType, 'transfer'>
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
  autoPost: boolean
}

export interface Invitation {
  id: UUID
  spaceId: UUID
  email: string
  role: Exclude<MemberRole, 'owner'>
  status: InvitationStatus
  expiresAt: string
  createdAt: string
  invitedBy: UUID
  acceptedAt: string | null
}

export interface InvitationPreview {
  spaceName: string
  inviterName: string
  email: string
  status: InvitationStatus
  expired: boolean
}

export type WhatsAppIdentityStatus = 'pending' | 'verified' | 'revoked'

export interface WhatsAppIdentity {
  id: UUID
  userId: UUID
  phoneE164: string
  status: WhatsAppIdentityStatus
  defaultSpaceId: UUID | null
  verifiedAt: string | null
  createdAt: string
}
