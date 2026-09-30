'use server'

import { cookies } from 'next/headers'
import { z } from 'zod'
import { SELECTABLE_EXPENSE_CATEGORIES } from '@/domain/catalog'
import { MAX_CENTS } from '@/domain/money'
import { runAction } from '@/lib/errors'
import { logger } from '@/lib/observability/logger'
import { ACTIVE_SPACE_COOKIE, requireViewer } from '@/server/session'

const selectable = new Set(SELECTABLE_EXPENSE_CATEGORIES.map((c) => c.key))

const onboardingSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Como podemos te chamar?').max(120),
    spaceType: z.enum(['personal', 'shared']),
    spaceName: z.string().trim().min(1, 'Dê um nome ao espaço.').max(80),
    expectedIncomeCents: z.number().int().min(0).max(MAX_CENTS),
    planMode: z.enum(['preset', 'custom', 'skip']),
    groupPercents: z.object({ essentials: z.number().int().min(0).max(10_000), lifestyle: z.number().int().min(0).max(10_000), savings: z.number().int().min(0).max(10_000) }),
    categoryKeys: z.array(z.string()).max(40),
  })
  .refine((v) => v.planMode !== 'custom' || v.groupPercents.essentials + v.groupPercents.lifestyle + v.groupPercents.savings <= 10_000, {
    path: ['groupPercents'],
    message: 'A soma passa de 100%.',
  })

export async function completeOnboardingAction(raw: unknown) {
  return runAction('onboarding.complete', async () => {
    const viewer = await requireViewer()
    const v = onboardingSchema.parse(raw)
    const spaceId = await viewer.repo.completeOnboarding({
      fullName: v.fullName,
      spaceName: v.spaceName,
      spaceType: v.spaceType,
      expectedIncomeCents: v.expectedIncomeCents,
      planMode: v.planMode,
      groupPercents: v.planMode === 'custom' ? v.groupPercents : null,
      categoryKeys: v.categoryKeys.filter((k) => selectable.has(k)),
    })
    ;(await cookies()).set(ACTIVE_SPACE_COOKIE, spaceId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
    logger.info('onboarding.completed', { spaceType: v.spaceType, planMode: v.planMode })
    return { spaceId }
  })
}
