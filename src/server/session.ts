import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { todayIn } from '@/domain/dates'
import type { ISODate, Profile, SpaceWithMembers } from '@/domain/types'
import { getDataMode } from '@/lib/env'
import type { FinanceRepository, SpaceSummary } from '@/server/data/contracts'
import { DEMO_USERS } from '@/server/data/demo/dataset'
import { DemoRepository } from '@/server/data/demo/repository'
import { getDemoDb } from '@/server/data/demo/store'
import { SupabaseRepository } from '@/server/data/supabase/repository'
import { createUserClient } from '@/server/supabase/clients'

export const ACTIVE_SPACE_COOKIE = 'prumo_space'
export const DEMO_SESSION_COOKIE = 'prumo_demo_user'

export interface Viewer {
  userId: string
  email: string | null
  mode: 'supabase' | 'demo'
  repo: FinanceRepository
}

/** The signed-in user for this request (memoized per request), or null. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const mode = getDataMode()
  if (mode === 'unconfigured') return null

  if (mode === 'demo') {
    const who = (await cookies()).get(DEMO_SESSION_COOKIE)?.value
    const user = who === 'marina' ? DEMO_USERS.marina : who === 'lucas' ? DEMO_USERS.lucas : null
    if (!user) return null
    return { userId: user.id, email: user.email, mode, repo: new DemoRepository(getDemoDb(), user.id) }
  }

  const supabase = await createUserClient()
  // getClaims() verifies the JWT signature; never trust an unverified session from cookies.
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return null
  const email = typeof claims.email === 'string' ? claims.email : null
  return { userId: claims.sub, email, mode, repo: new SupabaseRepository(supabase, claims.sub, email) }
})

export async function requireViewer(): Promise<Viewer> {
  if (getDataMode() === 'unconfigured') redirect('/configuracao')
  const viewer = await getViewer()
  if (!viewer) redirect('/entrar')
  return viewer
}

export interface SpaceContext {
  viewer: Viewer
  profile: Profile
  spaces: SpaceSummary[]
  space: SpaceWithMembers
  today: ISODate
}

/** Viewer + active financial space. Redirects to onboarding when the user has no space yet. */
export const getSpaceContext = cache(async (): Promise<SpaceContext> => {
  const viewer = await requireViewer()
  const [profile, spaces] = await Promise.all([viewer.repo.getProfile(), viewer.repo.listSpaces()])
  if (spaces.length === 0 || !profile.onboardedAt) redirect('/comecar')

  const preferred = (await cookies()).get(ACTIVE_SPACE_COOKIE)?.value
  const active = spaces.find((s) => s.id === preferred) ?? spaces.find((s) => s.id === profile.defaultSpaceId) ?? spaces[0]!
  const space = await viewer.repo.getSpace(active.id)
  if (!space) redirect('/comecar')

  return { viewer, profile, spaces, space, today: todayIn(space.timezone) }
})

/** Categories, groups, accounts and cards of the active space — loaded once per request. */
export const getReferenceData = cache(async (spaceId: string) => {
  const { viewer } = await getSpaceContext()
  const [groups, categories, accounts, cards] = await Promise.all([
    viewer.repo.listGroups(spaceId),
    viewer.repo.listCategories(spaceId),
    viewer.repo.listAccounts(spaceId),
    viewer.repo.listCards(spaceId),
  ])
  return { groups, categories, accounts, cards }
})
