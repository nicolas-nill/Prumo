import type { Metadata } from 'next'
import Link from 'next/link'
import { SignUpForm } from '@/components/auth/auth-forms'

export const metadata: Metadata = { title: 'Criar conta' }

export default async function SignUpPage({ searchParams }: PageProps<'/cadastro'>) {
  const params = await searchParams
  const next = typeof params.next === 'string' ? params.next : undefined
  return (
    <div>
      <h1 className="text-page-title">Crie sua conta</h1>
      <p className="mt-2 text-secondary">Leva menos de um minuto. Depois, é só mandar mensagem.</p>
      <div className="mt-8">
        <SignUpForm next={next} />
      </div>
      <p className="mt-8 text-center text-sm text-fg-muted">
        Já tem conta?{' '}
        <Link href={next ? `/entrar?next=${encodeURIComponent(next)}` : '/entrar'} className="font-medium text-accent hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  )
}
