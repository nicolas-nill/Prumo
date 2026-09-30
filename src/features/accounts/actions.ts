'use server'

import { revalidatePath } from 'next/cache'
import { AppError, runAction } from '@/lib/errors'
import { getSpaceContext } from '@/server/session'
import { accountSchema, cardSchema } from './schemas'

export async function saveAccountAction(raw: unknown) {
  return runAction('accounts.save', async () => {
    const { viewer, space } = await getSpaceContext()
    const v = accountSchema.parse(raw)
    if (v.ownerId && !space.members.some((m) => m.userId === v.ownerId)) throw new AppError('VALIDATION')
    await viewer.repo.saveAccount(space.id, { ...v, id: v.id || undefined })
    revalidatePath('/', 'layout')
    return null
  })
}

export async function saveCardAction(raw: unknown) {
  return runAction('cards.save', async () => {
    const { viewer, space } = await getSpaceContext()
    const v = cardSchema.parse(raw)
    if (v.holderId && !space.members.some((m) => m.userId === v.holderId)) throw new AppError('VALIDATION')
    await viewer.repo.saveCard(space.id, { ...v, id: v.id || undefined, lastFour: v.lastFour || null })
    revalidatePath('/', 'layout')
    return null
  })
}
