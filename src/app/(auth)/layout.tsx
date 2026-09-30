import Link from 'next/link'
import type { ReactNode } from 'react'
import { Logo } from '@/components/brand/logo'
import { ChatPreview } from '@/components/brand/chat-preview'
import { DemoBanner } from '@/components/layout/demo-banner'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner />
      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <main className="flex flex-col px-5 py-8 sm:px-10 lg:px-16">
          <Link href="/" className="self-start rounded-md" aria-label="PRUMO — início">
            <Logo />
          </Link>
          <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">{children}</div>
          <p className="text-caption">Seus dados são protegidos por isolamento por espaço e criptografia em trânsito.</p>
        </main>
        <aside className="relative hidden overflow-hidden bg-surface-inverse lg:flex lg:flex-col lg:justify-center lg:px-16">
          <div className="max-w-[440px]">
            <p className="text-eyebrow !text-fg-inverse-muted">Seu dinheiro no prumo</p>
            <p className="mt-3 font-display text-[2rem] leading-[1.12] font-semibold tracking-[-0.035em] text-fg-inverse">
              Mande uma mensagem. O PRUMO organiza o resto.
            </p>
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-fg-inverse-muted">
              Registre gastos pelo WhatsApp em segundos e acompanhe o mês com clareza — sozinho ou a dois.
            </p>
            <ChatPreview className="mt-10" />
          </div>
        </aside>
      </div>
    </div>
  )
}
