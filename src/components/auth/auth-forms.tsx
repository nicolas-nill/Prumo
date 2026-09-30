'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { CircleCheckBig } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InlineError } from '@/components/ui/misc'
import {
  requestPasswordResetAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
  type AuthFormState,
} from '@/features/auth/actions'
import { PasswordInput } from './password-input'

const initial: AuthFormState = {}

function FormAlert({ state }: { state: AuthFormState }) {
  if (state.error) return <InlineError title={state.error} />
  if (state.success) {
    return (
      <div role="status" className="flex gap-3 rounded-[14px] border border-success/25 bg-success-soft px-4 py-3 text-sm text-success">
        <CircleCheckBig className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{state.success}</p>
      </div>
    )
  }
  return null
}

export function SignInForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action, pending] = useActionState(signInAction, initial)
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {linkError && !state.error ? <InlineError title="Esse link expirou ou já foi usado." message="Entre com sua senha ou peça um novo link." /> : null}
      <FormAlert state={state} />
      <input type="hidden" name="next" value={next ?? ''} />
      <Field label="E-mail" error={state.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" defaultValue={state.email} required autoFocus />
      </Field>
      <Field label="Senha" error={state.fieldErrors?.password}>
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>
      <div className="-mt-1 flex justify-end">
        <Link href="/recuperar-senha" className="text-sm font-medium text-accent hover:underline">
          Esqueci minha senha
        </Link>
      </div>
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        Entrar
      </Button>
    </form>
  )
}

export function SignUpForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signUpAction, initial)
  if (state.success) return <FormAlert state={state} />
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="next" value={next ?? ''} />
      <Field label="Seu nome" error={state.fieldErrors?.fullName}>
        <Input name="fullName" autoComplete="name" required autoFocus />
      </Field>
      <Field label="E-mail" error={state.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" defaultValue={state.email} required />
      </Field>
      <Field label="Senha" hint="Pelo menos 8 caracteres." error={state.fieldErrors?.password}>
        <PasswordInput name="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        Criar conta
      </Button>
      <p className="text-caption text-center">Ao criar a conta você concorda com os termos de uso e a política de privacidade.</p>
    </form>
  )
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial)
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormAlert state={state} />
      {state.success ? null : (
        <>
          <Field label="E-mail da conta" error={state.fieldErrors?.email}>
            <Input name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
          </Field>
          <Button type="submit" size="lg" loading={pending} className="w-full">
            Enviar link
          </Button>
        </>
      )}
    </form>
  )
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, initial)
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormAlert state={state} />
      <Field label="Nova senha" hint="Pelo menos 8 caracteres." error={state.fieldErrors?.password}>
        <PasswordInput name="password" autoComplete="new-password" required minLength={8} autoFocus />
      </Field>
      <Field label="Confirme a nova senha" error={state.fieldErrors?.confirm}>
        <PasswordInput name="confirm" autoComplete="new-password" required />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Salvar nova senha
      </Button>
    </form>
  )
}
