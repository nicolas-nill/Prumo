'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { AppError, runAction } from '@/lib/errors'
import { getReferenceData, getSpaceContext } from '@/server/session'
import { BR_TIMEZONES } from './constants'

export async function updateProfileAction(raw: unknown) {
  return runAction('profile.update', async () => {
    const { viewer } = await getSpaceContext()
    const v = z
      .object({
        fullName: z.string().trim().min(1, 'Informe seu nome.').max(120),
        timezone: z.enum(BR_TIMEZONES.map((t) => t.value) as [string, ...string[]]),
      })
      .parse(raw)
    await viewer.repo.updateProfile(v)
    revalidatePath('/', 'layout')
    return null
  })
}

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome.').max(40),
  kind: z.enum(['income', 'expense']),
  groupId: z.string().nullable(),
  icon: z.string().max(40).nullable(),
})

export async function createCategoryAction(raw: unknown) {
  return runAction('categories.create', async () => {
    const { viewer, space } = await getSpaceContext()
    const v = categorySchema.parse(raw)
    const { groups } = await getReferenceData(space.id)
    if (v.groupId && !groups.some((g) => g.id === v.groupId)) throw new AppError('VALIDATION')
    await viewer.repo.createCategory(space.id, { ...v, groupId: v.kind === 'expense' ? v.groupId : null })
    revalidatePath('/', 'layout')
    return null
  })
}

export async function updateCategoryAction(categoryId: string, raw: unknown) {
  return runAction('categories.update', async () => {
    const { viewer, space } = await getSpaceContext()
    const id = z.uuid().parse(categoryId)
    const v = categorySchema.partial().extend({ isActive: z.boolean().optional() }).parse(raw)
    const { groups, categories } = await getReferenceData(space.id)
    const category = categories.find((c) => c.id === id)
    if (!category) throw new AppError('NOT_FOUND')
    if (v.groupId && !groups.some((g) => g.id === v.groupId)) throw new AppError('VALIDATION')
    if (category.systemKey === 'other' && v.isActive === false) throw new AppError('VALIDATION', '“Outros” é usado como categoria de segurança e não pode ser arquivada.')
    await viewer.repo.updateCategory(space.id, id, { name: v.name, groupId: category.kind === 'expense' ? v.groupId : undefined, icon: v.icon, isActive: v.isActive })
    revalidatePath('/', 'layout')
    return null
  })
}
