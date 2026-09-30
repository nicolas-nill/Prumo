'use server'

import { revalidatePath } from 'next/cache'
import { addMonths, isMonthKey } from '@/domain/dates'
import { presetForGroups } from '@/domain/finance'
import { AppError, runAction } from '@/lib/errors'
import { getReferenceData, getSpaceContext } from '@/server/session'
import { planSchema } from './schemas'

export async function savePlanAction(raw: unknown) {
  return runAction('plan.save', async () => {
    const { viewer, space } = await getSpaceContext()
    const input = planSchema.parse(raw)
    const ref = await getReferenceData(space.id)
    const groupIds = new Set(ref.groups.map((g) => g.id))
    const categoryIds = new Set(ref.categories.filter((c) => c.kind === 'expense').map((c) => c.id))
    if (input.groups.some((g) => !groupIds.has(g.groupId)) || input.categories.some((c) => !categoryIds.has(c.categoryId))) {
      throw new AppError('VALIDATION', 'O plano referencia grupos ou categorias que não existem neste espaço.')
    }
    await viewer.repo.savePlan(space.id, input.month, {
      expectedIncomeCents: input.expectedIncomeCents,
      groups: input.groups.map((g) => ({
        groupId: g.groupId,
        mode: g.mode,
        percentBp: g.mode === 'percent' ? (g.percentBp ?? 0) : null,
        amountCents: g.mode === 'amount' ? (g.amountCents ?? 0) : null,
      })),
      categories: input.categories.filter((c) => c.amountCents > 0),
    })
    revalidatePath('/', 'layout')
    return null
  })
}

export async function copyPreviousPlanAction(month: string) {
  return runAction('plan.copy', async () => {
    if (!isMonthKey(month)) throw new AppError('VALIDATION')
    const { viewer, space } = await getSpaceContext()
    await viewer.repo.copyPlan(space.id, addMonths(month, -1), month)
    revalidatePath('/', 'layout')
    return null
  })
}

export async function startPlanAction(month: string, expectedIncomeCents: number, usePreset: boolean) {
  return runAction('plan.start', async () => {
    if (!isMonthKey(month) || !Number.isSafeInteger(expectedIncomeCents) || expectedIncomeCents < 0) throw new AppError('VALIDATION')
    const { viewer, space } = await getSpaceContext()
    const { groups } = await getReferenceData(space.id)
    await viewer.repo.savePlan(space.id, month, {
      expectedIncomeCents,
      groups: usePreset ? presetForGroups(groups) : groups.map((g) => ({ groupId: g.id, mode: 'percent', percentBp: 0, amountCents: null })),
      categories: [],
    })
    revalidatePath('/', 'layout')
    return null
  })
}
