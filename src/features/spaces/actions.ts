'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { AppError, runAction } from '@/lib/errors'
import { ACTIVE_SPACE_COOKIE, getSpaceContext, requireViewer } from '@/server/session'

export async function switchSpaceAction(spaceId: string) {
  const viewer = await requireViewer()
  const id = z.uuid().parse(spaceId)
  const spaces = await viewer.repo.listSpaces()
  if (!spaces.some((s) => s.id === id)) throw new AppError('FORBIDDEN')
  ;(await cookies()).set(ACTIVE_SPACE_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
  await viewer.repo.updateProfile({ defaultSpaceId: id })
  revalidatePath('/', 'layout')
}

export async function renameSpaceAction(name: string) {
  return runAction('spaces.rename', async () => {
    const { viewer, space } = await getSpaceContext()
    const parsed = z.string().trim().min(1, 'Dê um nome ao espaço.').max(80).parse(name)
    await viewer.repo.renameSpace(space.id, parsed)
    revalidatePath('/', 'layout')
  })
}
