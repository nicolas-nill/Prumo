'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { AppError, runAction } from '@/lib/errors'
import { getReferenceData, getSpaceContext } from '@/server/session'
import { recurringFormSchema } from './schemas'
import { postDueRecurring } from './service'


export async function saveRecurringAction(raw: unknown) {
  return runAction('recurring.save', async () => {
    const { viewer, space } = await getSpaceContext()
    const v = recurringFormSchema.parse(raw)
    const ref = await getReferenceData(space.id)
    const category = v.categoryId ? ref.categories.find((c) => c.id === v.categoryId) : null
    if (v.categoryId && (!category || category.kind !== v.type)) throw new AppError('VALIDATION', undefined, { fieldErrors: { categoryId: 'Categoria inválida para o tipo.' } })
    if (!space.members.some((m) => m.userId === v.memberId)) throw new AppError('FORBIDDEN')
    const existing = v.id ? (await viewer.repo.listRecurring(space.id)).find((r) => r.id === v.id) : null
    await viewer.repo.saveRecurring(space.id, {
      id: existing?.id,
      type: v.type,
      description: v.description,
      amountCents: v.amountCents,
      categoryId: v.categoryId,
      accountId: v.paymentKind === 'account' ? v.accountId : null,
      cardId: v.paymentKind === 'card' ? v.cardId : null,
      memberId: v.memberId,
      scope: space.type === 'personal' ? 'personal' : v.scope,
      frequency: v.frequency,
      interval: v.interval,
      startOn: existing?.startOn ?? v.nextOccurrenceOn,
      nextOccurrenceOn: v.nextOccurrenceOn,
      endOn: v.endOn,
      isActive: v.isActive,
    })
    revalidatePath('/', 'layout')
    return null
  })
}

export async function toggleRecurringAction(id: string, active: boolean) {
  return runAction('recurring.toggle', async () => {
    const { viewer, space } = await getSpaceContext()
    const rule = (await viewer.repo.listRecurring(space.id)).find((r) => r.id === z.uuid().parse(id))
    if (!rule) throw new AppError('NOT_FOUND')
    await viewer.repo.saveRecurring(space.id, { ...rule, isActive: active })
    revalidatePath('/movimentacoes/recorrentes')
    return null
  })
}

export async function deleteRecurringAction(id: string) {
  return runAction('recurring.delete', async () => {
    const { viewer, space } = await getSpaceContext()
    await viewer.repo.deleteRecurring(space.id, z.uuid().parse(id))
    revalidatePath('/', 'layout')
    return null
  })
}

export async function postDueRecurringAction() {
  return runAction('recurring.post', async () => {
    const { viewer, space, today } = await getSpaceContext()
    const result = await postDueRecurring(viewer.repo, space.id, today)
    revalidatePath('/', 'layout')
    return result
  })
}
