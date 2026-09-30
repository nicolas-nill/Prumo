import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ForgotPasswordForm } from '@/components/auth/auth-forms'

export const metadata: Metadata = { title: 'Recuperar senha' }

export default function ForgotPasswordPage() {
  return (
    <div>
      <Link href="/entrar" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Voltar
      </Link>
      <h1 className="text-page-title">Recuperar senha</h1>
      <p className="mt-2 text-secondary">Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.</p>
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
    </div>
  )
}
