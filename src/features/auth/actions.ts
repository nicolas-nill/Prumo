'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAppUrl, getDataMode } from '@/lib/env'
import { zodFieldErrors } from '@/lib/errors'
import { logger } from '@/lib/observability/logger'
import { ACTIVE_SPACE_COOKIE, DEMO_SESSION_COOKIE } from '@/server/session'
import { createUserClient } from '@/server/supabase/clients'
import { forgotPasswordSchema, newPasswordSchema, safeNext, signInSchema, signUpSchema } from './schemas'

export interface AuthFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: string
  email?: string
}

function authErrorMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Já existe uma conta com esse e-mail. Tente entrar.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.'
  if (m.includes('weak password') || m.includes('password should')) return 'Escolha uma senha mais forte.'
  if (m.includes('same password')) return 'A nova senha precisa ser diferente da atual.'
  return 'Não foi possível concluir agora. Tente novamente.'
}

const demoUnavailable = (): AuthFormState => ({
  error: 'No modo demonstração não é possível criar contas. Use os perfis de exemplo em “Entrar”.',
})

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), email: String(formData.get('email') ?? '') }
  if (getDataMode() === 'demo') return { error: 'Modo demonstração: use um dos perfis de exemplo abaixo.' }

  const supabase = await createUserClient()
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password })
  if (error) {
    logger.info('auth.sign_in_failed', { reason: error.code ?? error.status })
    return { error: authErrorMessage(error.message), email: parsed.data.email }
  }
  redirect(safeNext(parsed.data.next))
}

export async function signInDemoAction(formData: FormData) {
  if (getDataMode() !== 'demo') redirect('/entrar')
  const who = formData.get('who') === 'marina' ? 'marina' : 'lucas'
  const store = await cookies()
  store.set(DEMO_SESSION_COOKIE, who, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
  redirect(safeNext(String(formData.get('next') ?? '')))
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), email: String(formData.get('email') ?? '') }
  if (getDataMode() === 'demo') return demoUnavailable()

  const supabase = await createUserClient()
  const next = safeNext(String(formData.get('next') ?? ''), '/comecar')
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${getAppUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  })
  if (error) return { error: authErrorMessage(error.message), email: parsed.data.email }
  logger.info('auth.signed_up', { confirmed: Boolean(data.session) })
  if (data.session) redirect(next)
  return { success: `Enviamos um link de confirmação para ${parsed.data.email}. Abra o e-mail para ativar sua conta.` }
}

export async function requestPasswordResetAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) }
  if (getDataMode() === 'demo') return demoUnavailable()

  const supabase = await createUserClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getAppUrl()}/auth/confirm?next=/nova-senha`,
  })
  if (error) logger.warn('auth.reset_request_failed', { reason: error.code ?? error.status })
  // Same answer whether the account exists or not (no account enumeration).
  return { success: 'Se existir uma conta com esse e-mail, você receberá um link para criar uma nova senha em instantes.' }
}

export async function updatePasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) }
  if (getDataMode() === 'demo') return demoUnavailable()

  const supabase = await createUserClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims?.sub) return { error: 'O link de recuperação expirou. Peça um novo.' }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: authErrorMessage(error.message) }
  redirect('/visao-geral')
}

export async function signOutAction() {
  const store = await cookies()
  store.delete(ACTIVE_SPACE_COOKIE)
  if (getDataMode() === 'demo') {
    store.delete(DEMO_SESSION_COOKIE)
  } else if (getDataMode() === 'supabase') {
    const supabase = await createUserClient()
    await supabase.auth.signOut()
  }
  redirect('/entrar')
}
