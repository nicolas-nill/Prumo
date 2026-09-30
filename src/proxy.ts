import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getDataMode, getSupabasePublicConfig } from '@/lib/env'

/**
 * Runs before routes render:
 *  1. refreshes the Supabase session cookie (so Server Components always see a valid JWT);
 *  2. keeps signed-out visitors away from the app and signed-in users away from auth pages.
 * Authorization of data is NOT done here — RLS and server-side checks handle that.
 */

const APP_PREFIXES = [
  '/visao-geral',
  '/movimentacoes',
  '/planejamento',
  '/metas',
  '/contas',
  '/espaco',
  '/whatsapp',
  '/configuracoes',
  '/comecar',
  '/dev',
]
const AUTH_PAGES = ['/entrar', '/cadastro']

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function redirectTo(request: NextRequest, pathname: string, withNext = false) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  if (withNext) url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(url)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApp = matches(pathname, APP_PREFIXES)
  const mode = getDataMode()

  if (mode === 'unconfigured') {
    return isApp || matches(pathname, AUTH_PAGES) ? redirectTo(request, '/configuracao') : NextResponse.next()
  }

  if (mode === 'demo') {
    const signedIn = Boolean(request.cookies.get('prumo_demo_user')?.value)
    if (isApp && !signedIn) return redirectTo(request, '/entrar', true)
    if (matches(pathname, AUTH_PAGES) && signedIn) return redirectTo(request, '/visao-geral')
    return NextResponse.next()
  }

  const config = getSupabasePublicConfig()!
  let response = NextResponse.next({ request })
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options)
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value)
      },
    },
  })

  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)

  if (isApp && !signedIn) return redirectTo(request, '/entrar', true)
  if (matches(pathname, AUTH_PAGES) && signedIn) return redirectTo(request, '/visao-geral')
  return response
}

export const config = {
  matcher: [
    // Everything except static assets, image optimization and the WhatsApp/cron endpoints
    // (those authenticate with signatures/secrets, not cookies).
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|api/whatsapp|api/cron|api/health|.*\\.(?:png|jpg|jpeg|svg|webp|woff2)$).*)',
  ],
}
