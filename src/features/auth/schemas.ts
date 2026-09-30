import { z } from 'zod'

const email = z.email('Informe um e-mail válido.').trim().toLowerCase().max(254)
const password = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(72, 'A senha pode ter no máximo 72 caracteres.')

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Informe sua senha.'),
  next: z.string().optional(),
})

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, 'Como podemos te chamar?').max(120),
  email,
  password,
})

export const forgotPasswordSchema = z.object({ email })

export const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'As senhas não coincidem.', path: ['confirm'] })

/** Only same-origin relative paths are accepted as post-login destinations (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = '/visao-geral'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}
