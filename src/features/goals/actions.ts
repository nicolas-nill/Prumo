'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { AppError, runAction } from '@/lib/errors'
import { getSpaceContext } from '@/server/session'
import { contributionSchema, goalSchema } from './schemas'

export async function saveGoalAction(raw: unknown) {
  return runAction('goals.save', async () => {
    const { viewer, space } = await getSpaceContext()
    const v = goalSchema.parse(raw)
    const goal = await viewer.repo.saveGoal(space.id, {
      id: v.id,
      name: v.name,
      targetAmountCents: v.targetAmountCents,
      targetDate: v.targetDate,
      scope: space.type === 'personal' ? 'shared' : v.scope,
      ownerId: v.scope === 'personal' ? viewer.userId : null,
      tone: v.tone,
      initialAmountCents: v.id ? undefined : v.initialAmountCents,
    })
    revalidatePath('/', 'layout')
    return { id: goal.id }
  })
}

export async function addContributionAction(goalId: string, raw: unknown) {
  return runAction('goals.contribute', async () => {
    const { viewer, space } = await getSpaceContext()
    const v = contributionSchema.parse(raw)
    const id = z.uuid().parse(goalId)
    const goal = (await viewer.repo.listGoals(space.id)).find((g) => g.id === id)
    if (!goal) throw new AppError('NOT_FOUND')
    const amount = v.kind === 'withdraw' ? -v.amountCents : v.amountCents
    if (goal.currentAmountCents + amount < 0) {
      throw new AppError('VALIDATION', undefined, { fieldErrors: { amountCents: 'A retirada é maior que o valor guardado.' } })
    }
    await viewer.repo.addContribution(space.id, id, { amountCents: amount, contributedOn: v.contributedOn, note: v.note || null })
    // Reaching the target completes the goal; the user can reopen it.
    if (goal.status === 'active' && goal.currentAmountCents + amount >= goal.targetAmountCents) {
      await viewer.repo.setGoalStatus(space.id, id, 'completed')
    }
    revalidatePath('/', 'layout')
    return null
  })
}

export async function setGoalStatusAction(goalId: string, status: 'active' | 'completed' | 'archived') {
  return runAction('goals.status', async () => {
    const { viewer, space } = await getSpaceContext()
    await viewer.repo.setGoalStatus(space.id, z.uuid().parse(goalId), z.enum(['active', 'completed', 'archived']).parse(status))
    revalidatePath('/', 'layout')
    return null
  })
}
