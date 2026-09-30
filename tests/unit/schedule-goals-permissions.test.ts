import { describe, expect, it } from 'vitest'
import { buildInstallmentPlan, cardInvoiceState, goalProgress, invoiceFor, occurrencesUntil } from '@/domain/finance'
import { checkLimit } from '@/domain/entitlements'
import { canEditTransaction, canPerform, canRemoveMember, canViewTransaction, normalizeVisibility } from '@/domain/permissions'
import type { Goal } from '@/domain/types'

describe('installments', () => {
  it('schedules R$ 1.200 em 12x monthly keeping the purchase day', () => {
    const plan = buildInstallmentPlan(120_000, 12, '2026-01-31')
    expect(plan).toHaveLength(12)
    expect(plan[0]).toEqual({ number: 1, count: 12, amountCents: 10_000, occurredOn: '2026-01-31' })
    expect(plan[1]!.occurredOn).toBe('2026-02-28')
    expect(plan[2]!.occurredOn).toBe('2026-03-31')
    expect(plan.reduce((a, p) => a + p.amountCents, 0)).toBe(120_000)
  })
})

describe('card invoices', () => {
  it('assigns purchases before the closing day to the current invoice', () => {
    const inv = invoiceFor('2026-09-10', 25, 5)
    expect(inv).toMatchObject({ referenceMonth: '2026-09', closingDate: '2026-09-25', dueDate: '2026-10-05', periodStart: '2026-08-25', periodEnd: '2026-09-24' })
  })
  it('sends purchases on/after closing to the next invoice', () => {
    expect(invoiceFor('2026-09-25', 25, 5).referenceMonth).toBe('2026-10')
  })
  it('puts the due date in the closing month when due day > closing day', () => {
    expect(invoiceFor('2026-09-01', 3, 10)).toMatchObject({ referenceMonth: '2026-09', dueDate: '2026-09-10' })
  })
  it('reports a closed invoice until it is due', () => {
    const state = cardInvoiceState('2026-09-28', 25, 5)
    expect(state.open.referenceMonth).toBe('2026-10')
    expect(state.closedUnpaid?.dueDate).toBe('2026-10-05')
    expect(cardInvoiceState('2026-10-06', 25, 5).closedUnpaid).toBeNull()
  })
})

describe('recurrence', () => {
  it('generates monthly occurrences with day clamping', () => {
    const pattern = { frequency: 'monthly' as const, interval: 1, startOn: '2026-01-31', endOn: null }
    expect(occurrencesUntil(pattern, '2026-01-31', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })
  it('respects end dates and weekly intervals', () => {
    const pattern = { frequency: 'weekly' as const, interval: 2, startOn: '2026-09-01', endOn: '2026-09-20' }
    expect(occurrencesUntil(pattern, '2026-09-01', '2026-12-31')).toEqual(['2026-09-01', '2026-09-15'])
  })
})

describe('goals', () => {
  const goal: Goal = {
    id: 'g',
    spaceId: 's',
    name: 'Reserva de emergência',
    targetAmountCents: 1_200_000,
    currentAmountCents: 300_000,
    targetDate: '2027-02-28',
    status: 'active',
    scope: 'shared',
    ownerId: null,
    tone: 'sage',
    createdAt: '2026-03-01T12:00:00Z',
  }
  it('computes the monthly contribution needed', () => {
    const p = goalProgress(goal, '2026-09-15')
    expect(p.ratio).toBeCloseTo(0.25)
    expect(p.monthsLeft).toBe(6)
    expect(p.monthlyNeededCents).toBe(150_000)
    expect(p.state).toBe('behind')
  })
  it('detects completion and overdue goals', () => {
    expect(goalProgress({ ...goal, currentAmountCents: 1_200_000 }, '2026-09-15').state).toBe('completed')
    expect(goalProgress(goal, '2027-03-01').state).toBe('overdue')
  })
})

describe('permissions', () => {
  const me = 'u-me'
  const partner = 'u-partner'
  it('hides private personal transactions from the partner', () => {
    const tx = { visibility: 'private' as const, memberId: me, createdBy: me, scope: 'personal' as const }
    expect(canViewTransaction(tx, me)).toBe(true)
    expect(canViewTransaction(tx, partner)).toBe(false)
  })
  it('lets any member edit shared transactions but not a partner personal one', () => {
    const shared = { visibility: 'space' as const, memberId: partner, createdBy: partner, scope: 'shared' as const }
    const personal = { ...shared, scope: 'personal' as const }
    expect(canEditTransaction(shared, me)).toBe(true)
    expect(canEditTransaction(personal, me)).toBe(false)
    expect(canEditTransaction(personal, partner)).toBe(true)
  })
  it('forces shared transactions to be space-visible', () => {
    expect(normalizeVisibility('shared', 'private')).toBe('space')
    expect(normalizeVisibility('personal', 'private')).toBe('private')
  })
  it('restricts member management to owner/admin', () => {
    expect(canPerform('member', 'members.invite')).toBe(false)
    expect(canPerform('admin', 'members.invite')).toBe(true)
    expect(canPerform('admin', 'space.delete')).toBe(false)
    expect(canPerform('member', 'transactions.create')).toBe(true)
    expect(canRemoveMember('owner', 'member', 'a', 'b')).toBe(true)
    expect(canRemoveMember('admin', 'owner', 'a', 'b')).toBe(false)
    expect(canRemoveMember('owner', 'owner', 'a', 'a')).toBe(false)
  })
  it('checks plan limits', () => {
    expect(checkLimit('free', 'members', 1).allowed).toBe(true)
    expect(checkLimit('free', 'members', 2).allowed).toBe(false)
  })
})
