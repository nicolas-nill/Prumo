import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireSupabasePublicConfig, requireSupabaseSecretConfig } from '@/lib/env'
import type { Database } from '@/types/database.types'

export type DbClient = SupabaseClient<Database>

/**
 * User-scoped client for Server Components, Server Actions and Route Handlers.
 * Runs every query as the signed-in user — RLS is the security boundary.
 */
export async function createUserClient(): Promise<DbClient> {
  const { url, publishableKey } = requireSupabasePublicConfig()
  const cookieStore = await cookies()
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
        } catch {
          // Server Components cannot write cookies; the proxy refreshes the session instead.
        }
      },
    },
  })
}

let adminClient: DbClient | null = null

/**
 * Service-role client. BYPASSES RLS. Server-only (webhooks, cron). Every query made with it
 * must be explicitly scoped to a space and user resolved by trusted server logic.
 */
export function getAdminClient(): DbClient {
  if (adminClient) return adminClient
  const { url, secretKey } = requireSupabaseSecretConfig()
  adminClient = createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return adminClient
}
