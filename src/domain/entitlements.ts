import type { PlanCode } from './types'

/**
 * Plan entitlements. Prices are intentionally absent — pricing is not decided.
 * Limits are provisional (early access) and mirrored in the `plans` table, which the
 * database uses to enforce the member limit when an invitation is accepted.
 * tests/db/rls.test.ts asserts both sources agree.
 */

export interface Entitlements {
  maxMembers: number
  /** WhatsApp messages interpreted by AI per space per month. */
  aiActionsPerMonth: number
  /** How far back the dashboard and lists go. null = unlimited. */
  historyMonths: number | null
  maxRecurringRules: number | null
  receiptImages: boolean
  audioMessages: boolean
}

export const PLAN_ENTITLEMENTS: Record<PlanCode, Entitlements> = {
  free: {
    maxMembers: 2,
    aiActionsPerMonth: 150,
    historyMonths: 12,
    maxRecurringRules: 15,
    receiptImages: true,
    audioMessages: true,
  },
  premium: {
    maxMembers: 2,
    aiActionsPerMonth: 3000,
    historyMonths: null,
    maxRecurringRules: null,
    receiptImages: true,
    audioMessages: true,
  },
}

export type LimitedFeature = 'members' | 'aiActions' | 'recurringRules'

export interface EntitlementCheck {
  allowed: boolean
  limit: number | null
  used: number
}

export function checkLimit(plan: PlanCode, feature: LimitedFeature, used: number): EntitlementCheck {
  const e = PLAN_ENTITLEMENTS[plan]
  const limit =
    feature === 'members' ? e.maxMembers : feature === 'aiActions' ? e.aiActionsPerMonth : e.maxRecurringRules
  return { allowed: limit === null || used < limit, limit, used }
}

export function planLabel(plan: PlanCode): string {
  return plan === 'premium' ? 'Premium' : 'Free'
}
