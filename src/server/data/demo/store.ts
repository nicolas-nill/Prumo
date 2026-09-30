import 'server-only'
import { CATALOG_CATEGORIES, CATALOG_GROUPS } from '@/domain/catalog'
import { addMonths, compareDates, daysInMonth, monthOf, todayIn } from '@/domain/dates'
import type {
  Account,
  Card,
  Category,
  CategoryGroup,
  FinancialSpace,
  Goal,
  GoalContribution,
  ISODate,
  Invitation,
  MemberRole,
  MonthlyPlan,
  Profile,
  RecurringRule,
  Transaction,
  WhatsAppIdentity,
} from '@/domain/types'
import {
  DEMO_ACCOUNTS,
  DEMO_CARDS,
  DEMO_GOALS,
  DEMO_PLANS,
  DEMO_RECURRING,
  DEMO_SPACE,
  DEMO_TIMEZONE,
  DEMO_USERS,
  demoTransactions,
  type DemoMember,
} from './dataset'
import { demoId } from './ids'

/**
 * In-memory "database" for the demo mode. Clearly isolated: nothing here ever talks to
 * Supabase, and it only exists while PRUMO_DEMO_MODE is active (or in development without
 * Supabase credentials). Lives on globalThis so hot reloads keep state.
 */

export interface StoredTransaction extends Transaction {
  deletedAt: string | null
  sourceRef: string | null
  recurringOccurrenceOn: ISODate | null
}

export interface StoredMember {
  spaceId: string
  userId: string
  role: MemberRole
  status: 'active' | 'removed'
  joinedAt: string
}

export interface StoredInvitation extends Invitation {
  tokenHash: string
}

export interface StoredIdentity extends WhatsAppIdentity {
  codeHash: string | null
  codeExpiresAt: string | null
  attempts: number
}

export interface StoredMessage {
  id: string
  direction: 'inbound' | 'outbound'
  waMessageId: string | null
  identityId: string | null
  userId: string | null
  spaceId: string | null
  messageType: string
  status: string
  content: string | null
  intent: unknown
  errorCode: string | null
  correlationId: string
  transactionId: string | null
  receivedAt: string
  processedAt: string | null
}

export interface StoredAction {
  id: string
  identityId: string
  spaceId: string
  userId: string
  kind: string
  payload: unknown
  status: 'open' | 'resolved' | 'cancelled' | 'expired'
  expiresAt: string
  createdAt: string
}

export interface StoredAiUsage {
  userId: string | null
  spaceId: string | null
  operation: string
  provider: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
  estimatedCostUsdMicros: number | null
  success: boolean
  createdAt: string
}

export interface DemoDb {
  builtFor: ISODate
  users: { id: string; email: string; fullName: string; phone: string }[]
  profiles: Map<string, Profile>
  spaces: FinancialSpace[]
  members: StoredMember[]
  invitations: StoredInvitation[]
  groups: CategoryGroup[]
  categories: Category[]
  accounts: Account[]
  cards: Card[]
  transactions: StoredTransaction[]
  plans: MonthlyPlan[]
  goals: Omit<Goal, 'currentAmountCents'>[]
  contributions: GoalContribution[]
  recurring: RecurringRule[]
  identities: StoredIdentity[]
  messages: StoredMessage[]
  actions: StoredAction[]
  aiUsage: StoredAiUsage[]
  audit: { spaceId: string; actorId: string; action: string; entityId: string; at: string }[]
}

function resolveDate(today: ISODate, m: number, d: number): ISODate {
  const month = addMonths(monthOf(today), m)
  return `${month}-${String(Math.min(d, daysInMonth(month))).padStart(2, '0')}`
}

function nextMonthly(today: ISODate, day: number): ISODate {
  const thisMonth = resolveDate(today, 0, day)
  return compareDates(thisMonth, today) > 0 ? thisMonth : resolveDate(today, 1, day)
}

const userId = (m: DemoMember | null | undefined) => (m ? DEMO_USERS[m].id : null)

export function buildDemoDb(today: ISODate = todayIn(DEMO_TIMEZONE)): DemoDb {
  const spaceId = DEMO_SPACE.id
  const now = new Date().toISOString()

  const groups: CategoryGroup[] = CATALOG_GROUPS.map((g) => ({
    id: demoId(`group:${g.key}`),
    spaceId,
    key: g.key,
    name: g.name,
    tone: g.tone,
    sortOrder: g.sortOrder,
    isSavings: g.isSavings,
    isSystem: true,
  }))
  const groupId = (key: string | null) => (key ? demoId(`group:${key}`) : null)

  const categories: Category[] = CATALOG_CATEGORIES.filter((c) => c.defaultOn).map((c) => ({
    id: demoId(`category:${c.key}`),
    spaceId,
    groupId: groupId(c.group),
    systemKey: c.key,
    name: c.name,
    kind: c.kind,
    icon: c.icon,
    tone: null,
    isActive: true,
    isSystem: true,
    sortOrder: c.sortOrder,
  }))
  const categoryId = (key: string) => demoId(`category:${key}`)

  const transactions: StoredTransaction[] = []
  demoTransactions().forEach((t, i) => {
    const occurredOn = resolveDate(today, t.m, t.d)
    if (compareDates(occurredOn, today) > 0 && !t.installment) return
    const createdAt = `${occurredOn}T15:00:00.000Z`
    transactions.push({
      id: demoId(`tx:${i}`),
      spaceId,
      type: t.type,
      status: 'confirmed',
      amountCents: t.amountCents,
      occurredOn,
      description: t.description,
      merchant: t.merchant ?? null,
      notes: t.notes ?? null,
      categoryId: categoryId(t.category),
      accountId: t.account ? DEMO_ACCOUNTS[t.account]!.id : null,
      cardId: t.card ? DEMO_CARDS[t.card]!.id : null,
      memberId: DEMO_USERS[t.member].id,
      createdBy: DEMO_USERS[t.member].id,
      scope: t.scope,
      visibility: t.visibility ?? 'space',
      source: t.source ?? 'dashboard',
      installment: t.installment
        ? { groupId: demoId(`installment:${t.installment.key}`), number: t.installment.number, count: t.installment.count, totalCents: t.installment.totalCents }
        : null,
      recurringRuleId: t.recurring ? DEMO_RECURRING[t.recurring]!.id : null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      sourceRef: null,
      recurringOccurrenceOn: t.recurring ? occurredOn : null,
    })
  })

  const plans: MonthlyPlan[] = DEMO_PLANS.map((p) => ({
    id: demoId(`plan:${p.m}`),
    spaceId,
    month: addMonths(monthOf(today), p.m),
    expectedIncomeCents: p.expectedIncomeCents,
    groups: p.groups.map((g) => ({ groupId: groupId(g.key)!, mode: 'percent' as const, percentBp: g.percentBp, amountCents: null })),
    categories: p.categories.map((c) => ({ categoryId: categoryId(c.key), amountCents: c.amountCents })),
  }))

  const goals: Omit<Goal, 'currentAmountCents'>[] = DEMO_GOALS.map((g) => ({
    id: g.id,
    spaceId,
    name: g.name,
    targetAmountCents: g.targetAmountCents,
    targetDate: resolveDate(today, g.targetMonthOffset, 28),
    status: 'completed' in g && g.completed ? 'completed' : 'active',
    scope: g.scope,
    ownerId: userId(g.owner),
    tone: g.tone,
    createdAt: `${resolveDate(today, g.createdMonthOffset, 1)}T12:00:00.000Z`,
  }))
  const contributions: GoalContribution[] = DEMO_GOALS.flatMap((g) =>
    g.contributions
      .map((c, i) => ({
        id: demoId(`contribution:${g.id}:${i}`),
        goalId: g.id,
        amountCents: c.amountCents,
        contributedOn: resolveDate(today, c.m, c.d),
        note: 'note' in c ? (c.note ?? null) : null,
        createdBy: DEMO_USERS.lucas.id,
      }))
      .filter((c) => compareDates(c.contributedOn, today) <= 0),
  )

  const recurring: RecurringRule[] = Object.values(DEMO_RECURRING).map((r) => ({
    id: r.id,
    spaceId,
    type: r.type,
    description: r.description,
    amountCents: r.amountCents,
    categoryId: categoryId(r.category),
    accountId: r.account ? DEMO_ACCOUNTS[r.account]!.id : null,
    cardId: r.card ? DEMO_CARDS[r.card]!.id : null,
    memberId: DEMO_USERS[r.member].id,
    scope: r.scope,
    frequency: r.frequency,
    interval: 1,
    startOn: resolveDate(today, -6, r.day),
    nextOccurrenceOn: nextMonthly(today, r.day),
    endOn: null,
    isActive: true,
    autoPost: true,
  }))

  const users = Object.values(DEMO_USERS).map((u) => ({ id: u.id, email: u.email, fullName: u.fullName, phone: u.phone }))

  return {
    builtFor: today,
    users,
    profiles: new Map(
      users.map((u) => [
        u.id,
        {
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          avatarUrl: null,
          timezone: DEMO_TIMEZONE,
          currency: 'BRL',
          locale: 'pt-BR',
          onboardedAt: now,
          defaultSpaceId: spaceId,
        },
      ]),
    ),
    spaces: [
      {
        id: spaceId,
        name: DEMO_SPACE.name,
        type: 'shared',
        currency: 'BRL',
        timezone: DEMO_TIMEZONE,
        plan: 'premium',
        ownerId: DEMO_USERS.lucas.id,
        createdAt: `${resolveDate(today, -10, 1)}T12:00:00.000Z`,
      },
    ],
    members: [
      { spaceId, userId: DEMO_USERS.lucas.id, role: 'owner', status: 'active', joinedAt: `${resolveDate(today, -10, 1)}T12:00:00.000Z` },
      { spaceId, userId: DEMO_USERS.marina.id, role: 'admin', status: 'active', joinedAt: `${resolveDate(today, -10, 2)}T12:00:00.000Z` },
    ],
    invitations: [],
    groups,
    categories,
    accounts: Object.values(DEMO_ACCOUNTS).map((a) => ({
      id: a.id,
      spaceId,
      name: a.name,
      type: a.type,
      openingBalanceCents: a.openingBalanceCents,
      ownerId: userId(a.owner),
      isActive: true,
      sortOrder: a.sortOrder,
    })),
    cards: Object.values(DEMO_CARDS).map((c) => ({
      id: c.id,
      spaceId,
      name: c.name,
      lastFour: c.lastFour,
      closingDay: c.closingDay,
      dueDay: c.dueDay,
      limitCents: c.limitCents,
      holderId: DEMO_USERS[c.holder].id,
      tone: c.tone,
      isActive: true,
    })),
    transactions,
    plans,
    goals,
    contributions,
    recurring,
    identities: Object.entries(DEMO_USERS).map(([key, u]) => ({
      id: demoId(`wa-identity:${key}`),
      userId: u.id,
      phoneE164: u.phone,
      status: 'verified' as const,
      defaultSpaceId: spaceId,
      verifiedAt: now,
      createdAt: now,
      codeHash: null,
      codeExpiresAt: null,
      attempts: 0,
    })),
    messages: [],
    actions: [],
    aiUsage: [],
    audit: [],
  }
}

const globalStore = globalThis as unknown as { __prumoDemoDb?: DemoDb }

/** Shared in-memory store. Rebuilt when the calendar day changes so relative dates stay fresh. */
export function getDemoDb(): DemoDb {
  const today = todayIn(DEMO_TIMEZONE)
  if (!globalStore.__prumoDemoDb || globalStore.__prumoDemoDb.builtFor !== today) {
    globalStore.__prumoDemoDb = buildDemoDb(today)
  }
  return globalStore.__prumoDemoDb
}

export function resetDemoDb(): DemoDb {
  globalStore.__prumoDemoDb = buildDemoDb()
  return globalStore.__prumoDemoDb
}
