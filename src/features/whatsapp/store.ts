import type { CategoryTotal } from '@/domain/finance'
import type {
  Account,
  Card,
  Category,
  CategoryGroup,
  FinancialSpace,
  ISODate,
  MemberRole,
  MonthKey,
  MonthlyPlan,
  Transaction,
  UUID,
} from '@/domain/types'
import type { CreateTransactionInput, TransactionInput } from '@/server/data/contracts'
import type { AIOperation } from '@/features/ai/provider'
import type { InboundType } from './meta/normalize'

/**
 * Persistence used by the WhatsApp pipeline. The pipeline runs without a user session
 * (Meta calls the webhook), so every "acting" operation receives the resolved user
 * explicitly and implementations enforce membership and privacy themselves.
 */

export type ProcessingStatus = 'received' | 'processing' | 'needs_confirmation' | 'processed' | 'ignored' | 'failed'

export interface ResolvedIdentity {
  identityId: UUID
  userId: UUID
  phoneE164: string
  defaultSpaceId: UUID | null
  userName: string
}

export interface SpaceSnapshot {
  space: FinancialSpace
  role: MemberRole
  members: { userId: UUID; fullName: string }[]
  categories: Category[]
  groups: CategoryGroup[]
  accounts: Account[]
  cards: Card[]
}

export type PendingKind = 'confirm_create' | 'choose_category' | 'confirm_delete' | 'choose_candidate'

export interface PendingAction {
  id: UUID
  identityId: UUID
  spaceId: UUID
  userId: UUID
  kind: PendingKind
  payload: unknown
  expiresAt: string
}

export interface AiUsageEvent {
  userId: UUID | null
  spaceId: UUID | null
  operation: AIOperation
  provider: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
  audioSeconds: number | null
  estimatedCostUsdMicros: number | null
  latencyMs: number
  success: boolean
  correlationId: string
}

/** Operations on behalf of one user inside one space (membership already verified). */
export interface ActingFinance {
  createTransactions(input: CreateTransactionInput): Promise<Transaction[]>
  getTransaction(id: UUID): Promise<Transaction | null>
  /** Transactions this user registered since `sinceIso` (created_at), newest first. */
  recentlyCreated(sinceIso: string, limit: number): Promise<Transaction[]>
  /** Transactions visible to the user that occurred on/after `fromDate`, newest first. */
  visibleSince(fromDate: ISODate, limit: number): Promise<Transaction[]>
  updateTransaction(id: UUID, input: TransactionInput): Promise<Transaction>
  softDelete(id: UUID): Promise<void>
  categoryTotals(from: ISODate, to: ISODate): Promise<CategoryTotal[]>
  getPlan(month: MonthKey): Promise<MonthlyPlan | null>
}

export interface WhatsAppStore {
  readonly mode: 'supabase' | 'demo'

  /** Idempotent: a second delivery of the same wamid returns duplicate=true. */
  recordInbound(input: {
    waMessageId: string
    senderHash: string
    type: InboundType
    content: string | null
    mediaId: string | null
    waTimestamp: string
    correlationId: string
  }): Promise<{ id: UUID; duplicate: boolean }>
  updateInbound(
    id: UUID,
    patch: Partial<{
      status: ProcessingStatus
      identityId: UUID
      userId: UUID
      spaceId: UUID
      content: string | null
      intent: unknown
      errorCode: string | null
      transactionId: UUID | null
    }>,
  ): Promise<void>
  recordOutbound(input: {
    waMessageId: string | null
    identityId: UUID | null
    userId: UUID | null
    spaceId: UUID | null
    replyToId: UUID | null
    transactionId: UUID | null
    correlationId: string
  }): Promise<void>
  updateOutboundStatus(waMessageId: string, status: 'sent' | 'delivered' | 'read' | 'failed', errorCode: number | null): Promise<void>
  /** Transaction created from a previous message (for WhatsApp "reply to" corrections). */
  transactionForMessage(waMessageId: string, userId: UUID): Promise<UUID | null>
  /** Whether the last reply to this unknown sender was after `sinceIso` (anti-spam). */
  unknownSenderRepliedSince(senderHash: string, sinceIso: string): Promise<boolean>

  findVerifiedIdentity(phones: string[]): Promise<ResolvedIdentity | null>
  verifyLinkCode(phones: string[], code: string): Promise<{ status: 'verified' | 'invalid' | 'expired' | 'not_found' | 'conflict' | 'locked'; userId?: UUID }>
  userName(userId: UUID): Promise<string>

  snapshot(spaceId: UUID, userId: UUID): Promise<SpaceSnapshot | null>
  acting(spaceId: UUID, userId: UUID): ActingFinance

  getOpenAction(identityId: UUID): Promise<PendingAction | null>
  saveAction(action: Omit<PendingAction, 'id' | 'expiresAt'> & { ttlMinutes?: number; messageId: UUID | null }): Promise<void>
  closeAction(id: UUID, status: 'resolved' | 'cancelled' | 'expired'): Promise<void>

  countAiUsageSince(spaceId: UUID, sinceIso: string): Promise<number>
  logAiUsage(event: AiUsageEvent): Promise<void>
}
