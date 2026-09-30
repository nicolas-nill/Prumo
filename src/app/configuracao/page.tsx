import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/brand/logo'
import { getDataMode } from '@/lib/env'

export const metadata: Metadata = { title: 'Configuração pendente' }
// Env is read at request time: a build made with other variables must not bake a redirect.
export const dynamic = 'force-dynamic'

/** Shown in production when Supabase is not configured — instead of crashing. */
export default function ConfigPendingPage() {
  if (getDataMode() !== 'unconfigured') redirect('/')
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-12">
      <Logo />
      <h1 className="mt-10 text-page-title">Quase lá</h1>
      <p className="mt-3 text-secondary">
        O banco de dados ainda não foi conectado a esta instalação. Defina as variáveis abaixo no provedor de hospedagem e publique novamente.
      </p>
      <ul className="mt-6 flex flex-col gap-2 font-mono text-sm">
        <li className="rounded-[10px] bg-surface-muted px-3 py-2">NEXT_PUBLIC_SUPABASE_URL</li>
        <li className="rounded-[10px] bg-surface-muted px-3 py-2">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</li>
      </ul>
      <p className="mt-6 text-caption">Detalhes em README.md → Variáveis de ambiente.</p>
    </main>
  )
}
