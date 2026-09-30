import { NextResponse, type NextRequest } from 'next/server'
import { safeNext } from '@/features/auth/schemas'
import { logger } from '@/lib/observability/logger'
import { createUserClient } from '@/server/supabase/clients'

/** OAuth callback (Google sign-in, planned). Exchanges the PKCE code for a session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))
  if (code) {
    const supabase = await createUserClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, origin))
    logger.info('auth.oauth_callback_failed', { reason: error.code })
  }
  return NextResponse.redirect(new URL('/entrar?erro=oauth', origin))
}
