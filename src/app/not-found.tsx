import Link from 'next/link'
import { Logo } from '@/components/brand/logo'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center px-6">
      <Logo />
      <h1 className="mt-10 text-page-title">Página não encontrada</h1>
      <p className="mt-2 text-secondary">O endereço pode ter mudado ou não existe mais.</p>
      <Link href="/visao-geral" className="mt-6 text-sm font-medium text-accent hover:underline">
        Voltar para a visão geral
      </Link>
    </main>
  )
}
