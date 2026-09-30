import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { safeNext } from '@/features/auth/schemas'
import { logger } from '@/lib/observability/logger'
import { createUserClient } from '@/server/supabase/clients'

const OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']

/**
 * Email links (confirmation, password recovery). Supports both formats:
 *  - ?token_hash=…&type=…   (recommended email templates, see README → Auth)
 *  - ?code=…                (PKCE default)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const next = safeNext(searchParams.get('next'))
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const supabase = await createUserClient()

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(new URL(type === 'recovery' ? '/nova-senha' : next, origin))
    logger.info('auth.confirm_failed', { type, reason: error.code })
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, origin))
    logger.info('auth.code_exchange_failed', { reason: error.code })
  }
  return NextResponse.redirect(new URL('/entrar?erro=link', origin))
}
