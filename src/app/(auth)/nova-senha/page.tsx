import type { Metadata } from 'next'
import { NewPasswordForm } from '@/components/auth/auth-forms'

export const metadata: Metadata = { title: 'Nova senha' }

export default function NewPasswordPage() {
  return (
    <div>
      <h1 className="text-page-title">Crie uma nova senha</h1>
      <p className="mt-2 text-secondary">Depois de salvar, você já entra direto na sua conta.</p>
      <div className="mt-8">
        <NewPasswordForm />
      </div>
    </div>
  )
}
