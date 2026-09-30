'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { AppError, runAction } from '@/lib/errors'
import { logger } from '@/lib/observability/logger'
import { getSpaceContext } from '@/server/session'
import { normalizeBrazilianPhone } from './phone'

export async function startWhatsAppLinkAction(rawPhone: string) {
  return runAction('whatsapp.link_start', async () => {
    const { viewer, space } = await getSpaceContext()
    const phone = normalizeBrazilianPhone(z.string().max(30).parse(rawPhone))
    if (!phone) throw new AppError('VALIDATION', undefined, { fieldErrors: { phone: 'Informe o número com DDD, ex.: (11) 98765-4321.' } })
    const result = await viewer.repo.startWhatsAppLink(phone, space.id)
    logger.info('whatsapp.link_started', { spaceId: space.id, status: result.status })
    revalidatePath('/whatsapp')
    return { ...result, phone }
  })
}

export async function revokeWhatsAppIdentityAction(identityId: string) {
  return runAction('whatsapp.revoke', async () => {
    const { viewer } = await getSpaceContext()
    await viewer.repo.revokeWhatsAppIdentity(z.uuid().parse(identityId))
    revalidatePath('/whatsapp')
    return null
  })
}
