import type {
  Account,
  Card,
  Category,
  CategoryGroup,
  Goal,
  GoalContribution,
  Invitation,
  Profile,
  RecurringRule,
  Transaction,
  WhatsAppIdentity,
} from '@/domain/types'
import type { Tables, Views } from '@/types/database.types'

// Text columns constrained by CHECKs in the database are narrowed here.
const as = <T>(value: unknown) => value as T

export function toProfile(row: Tables<'profiles'>, email: string | null): Profile {
  return {
    id: row.id,
    email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    timezone: row.timezone,
    currency: row.currency,
    locale: row.locale,
    onboardedAt: row.onboarded_at,
    defaultSpaceId: row.default_space_id,
  }
}

export function toGroup(row: Tables<'category_groups'>): CategoryGroup {
  return {
    id: row.id,
    spaceId: row.space_id,
    key: as(row.key),
    name: row.name,
    tone: as(row.tone),
    sortOrder: row.sort_order,
    isSavings: row.is_savings,
    isSystem: row.is_system,
  }
}

export function toCategory(row: Tables<'categories'>): Category {
  return {
    id: row.id,
    spaceId: row.space_id,
    groupId: row.group_id,
    systemKey: row.system_key,
    name: row.name,
    kind: as(row.kind),
    icon: row.icon,
    tone: as(row.tone),
    isActive: row.is_active,
    isSystem: row.is_system,
    sortOrder: row.sort_order,
  }
}

export function toAccount(row: Tables<'accounts'>): Account {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    type: as(row.type),
    openingBalanceCents: row.opening_balance_cents,
    ownerId: row.owner_id,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  }
}

export function toCard(row: Tables<'cards'>): Card {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    lastFour: row.last_four,
    closingDay: row.closing_day,
    dueDay: row.due_day,
    limitCents: row.limit_cents,
    holderId: row.holder_id,
    tone: as(row.tone),
    isActive: row.is_active,
  }
}

export function toTransaction(row: Tables<'transactions'>): Transaction {
  return {
    id: row.id,
    spaceId: row.space_id,
    type: as(row.type),
    status: as(row.status),
    amountCents: row.amount_cents,
    occurredOn: row.occurred_on,
    description: row.description,
    merchant: row.merchant,
    notes: row.notes,
    categoryId: row.category_id,
    accountId: row.account_id,
    cardId: row.card_id,
    memberId: row.member_id,
    createdBy: row.created_by,
    scope: as(row.scope),
    visibility: as(row.visibility),
    source: as(row.source),
    installment:
      row.installment_group_id && row.installment_number && row.installment_count
        ? {
            groupId: row.installment_group_id,
            number: row.installment_number,
            count: row.installment_count,
            totalCents: row.installment_total_cents ?? row.amount_cents,
          }
        : null,
    recurringRuleId: row.recurring_rule_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toGoal(row: Views<'goals_with_progress'>): Goal {
  return {
    id: row.id as string,
    spaceId: row.space_id as string,
    name: row.name as string,
    targetAmountCents: row.target_amount_cents as number,
    currentAmountCents: row.current_amount_cents ?? 0,
    targetDate: row.target_date,
    status: as(row.status),
    scope: as(row.scope),
    ownerId: row.owner_id,
    tone: as(row.tone),
    createdAt: row.created_at as string,
  }
}

export function toContribution(row: Tables<'goal_contributions'>): GoalContribution {
  return {
    id: row.id,
    goalId: row.goal_id,
    amountCents: row.amount_cents,
    contributedOn: row.contributed_on,
    note: row.note,
    createdBy: row.created_by,
  }
}

export function toRecurring(row: Tables<'recurring_rules'>): RecurringRule {
  return {
    id: row.id,
    spaceId: row.space_id,
    type: as(row.type),
    description: row.description,
    amountCents: row.amount_cents,
    categoryId: row.category_id,
    accountId: row.account_id,
    cardId: row.card_id,
    memberId: row.member_id,
    scope: as(row.scope),
    frequency: as(row.frequency),
    interval: row.interval,
    startOn: row.start_on,
    nextOccurrenceOn: row.next_occurrence_on,
    endOn: row.end_on,
    isActive: row.is_active,
    autoPost: row.auto_post,
  }
}

export function toInvitation(row: Tables<'space_invitations'>): Invitation {
  const expired = row.status === 'pending' && new Date(row.expires_at).getTime() < Date.now()
  return {
    id: row.id,
    spaceId: row.space_id,
    email: row.email,
    role: as(row.role),
    status: expired ? 'expired' : as(row.status),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    invitedBy: row.invited_by,
    acceptedAt: row.accepted_at,
  }
}

export function toWhatsAppIdentity(row: Tables<'whatsapp_identities'>): WhatsAppIdentity {
  return {
    id: row.id,
    userId: row.user_id,
    phoneE164: row.phone_e164,
    status: as(row.status),
    defaultSpaceId: row.default_space_id,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
  }
}

/** Removes characters with meaning in PostgREST filter syntax. */
export function sanitizeSearch(input: string): string {
  return input.replace(/[,()*%\\:."']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}

