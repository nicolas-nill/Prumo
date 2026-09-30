'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { canPerform } from '@/domain/permissions'
import { getAppUrl } from '@/lib/env'
import { AppError, runAction, toActionError } from '@/lib/errors'
import { logger } from '@/lib/observability/logger'
import { ACTIVE_SPACE_COOKIE, getSpaceContext, requireViewer } from '@/server/session'

const inviteSchema = z.object({
  email: z.email('Informe um e-mail válido.').trim().toLowerCase(),
  role: z.enum(['admin', 'member']),
})

export async function createInvitationAction(raw: unknown) {
  return runAction('invitations.create', async () => {
    const { viewer, space } = await getSpaceContext()
    if (!canPerform(space.myRole, 'members.invite')) throw new AppError('FORBIDDEN', 'Só titular ou administradores podem convidar.')
    const { email, role } = inviteSchema.parse(raw)
    if (email === (await viewer.repo.getProfile()).email) throw new AppError('VALIDATION', undefined, { fieldErrors: { email: 'Esse é o seu próprio e-mail.' } })
    const { invitation, token } = await viewer.repo.createInvitation(space.id, email, role)
    logger.info('invitation.created', { spaceId: space.id, invitationId: invitation.id })
    revalidatePath('/espaco')
    // The raw token exists only here and in the link; the database keeps its hash.
    return { url: `${getAppUrl()}/convite/${token}`, expiresAt: invitation.expiresAt, email: invitation.email }
  })
}

export async function revokeInvitationAction(invitationId: string) {
  return runAction('invitations.revoke', async () => {
    const { viewer } = await getSpaceContext()
    await viewer.repo.revokeInvitation(z.uuid().parse(invitationId))
    revalidatePath('/espaco')
    return null
  })
}

export async function removeMemberAction(userId: string) {
  return runAction('members.remove', async () => {
    const { viewer, space } = await getSpaceContext()
    const id = z.uuid().parse(userId)
    await viewer.repo.removeMember(space.id, id)
    if (id === viewer.userId) (await cookies()).delete(ACTIVE_SPACE_COOKIE)
    revalidatePath('/', 'layout')
    return { left: id === viewer.userId }
  })
}

export async function acceptInvitationAction(token: string) {
  const viewer = await requireViewer()
  let spaceId: string
  try {
    spaceId = await viewer.repo.acceptInvitation(z.string().min(20).max(100).parse(token))
  } catch (error) {
    return toActionError(error, 'invitations.accept')
  }
  ;(await cookies()).set(ACTIVE_SPACE_COOKIE, spaceId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
  logger.info('invitation.accepted', { spaceId })
  revalidatePath('/', 'layout')
  redirect('/visao-geral')
}

export async function renameSpaceFromFormAction(raw: unknown) {
  return runAction('spaces.rename', async () => {
    const { viewer, space } = await getSpaceContext()
    const name = z.object({ name: z.string().trim().min(1, 'Dê um nome ao espaço.').max(80) }).parse(raw).name
    await viewer.repo.renameSpace(space.id, name)
    revalidatePath('/', 'layout')
    return null
  })
}
