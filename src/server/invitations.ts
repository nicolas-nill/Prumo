import 'server-only'
import type { InvitationPreview } from '@/domain/types'
import { getDataMode } from '@/lib/env'
import { DEMO_USERS } from '@/server/data/demo/dataset'
import { DemoRepository } from '@/server/data/demo/repository'
import { getDemoDb } from '@/server/data/demo/store'
import { SupabaseRepository } from '@/server/data/supabase/repository'
import { createUserClient } from '@/server/supabase/clients'

/**
 * Invitation preview for the landing page, available before sign-in. Reveals only the space
 * name, the inviter's first name and a masked e-mail; requires the secret token.
 */
export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  if (token.length < 20 || token.length > 100) return null
  const mode = getDataMode()
  if (mode === 'demo') return new DemoRepository(getDemoDb(), DEMO_USERS.lucas.id).getInvitationPreview(token)
  if (mode === 'supabase') {
    const db = await createUserClient()
    // The RPC does not depend on the caller; user id/email are unused here.
    return new SupabaseRepository(db, '00000000-0000-0000-0000-000000000000', null).getInvitationPreview(token).catch(() => null)
  }
  return null
}
