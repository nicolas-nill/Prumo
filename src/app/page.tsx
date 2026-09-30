import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, MessageCircle, SlidersHorizontal, Users } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { ChatPreview } from '@/components/brand/chat-preview'
import { DemoBanner } from '@/components/layout/demo-banner'
import { getViewer } from '@/server/session'

const POINTS = [
  { icon: MessageCircle, title: 'Registre pelo WhatsApp', text: 'Texto, áudio ou foto do comprovante. O PRUMO entende e organiza.' },
  { icon: SlidersHorizontal, title: 'Planeje o mês', text: 'Distribua a renda do seu jeito e acompanhe o ritmo dos gastos.' },
  { icon: Users, title: 'Sozinho ou a dois', text: 'Um espaço compartilhado, com o que é pessoal continuando pessoal.' },
]

export default async function HomePage() {
  const viewer = await getViewer()
  if (viewer) redirect('/visao-geral')

  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner />
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/entrar" className="rounded-[10px] px-4 py-2 text-sm font-medium text-fg-muted hover:text-fg">
            Entrar
          </Link>
          <Link href="/cadastro" className="rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover">
            Criar conta
          </Link>
        </nav>
      </header>
      <main className="mx-auto grid w-full max-w-[1120px] flex-1 items-center gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
        <div>
          <p className="text-eyebrow">Assistente financeiro · pessoal e a dois</p>
          <h1 className="mt-4 font-display text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.045em] sm:text-[3.25rem]">
            Seu dinheiro no prumo, sem planilha.
          </h1>
          <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-fg-muted">
            Mande “gastei 47,90 no almoço” no WhatsApp. O PRUMO registra, categoriza e mostra se o mês está no ritmo do que você planejou.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/cadastro" className="inline-flex h-12 items-center gap-2 rounded-[12px] bg-primary px-5 font-medium text-primary-fg hover:bg-primary-hover">
              Começar agora <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/entrar" className="inline-flex h-12 items-center rounded-[12px] border border-border bg-surface px-5 font-medium hover:bg-surface-muted">
              Já tenho conta
            </Link>
          </div>
          <ul className="mt-12 grid gap-6 sm:grid-cols-3">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <Icon className="size-5 text-accent" aria-hidden />
                <p className="mt-3 text-card-title">{title}</p>
                <p className="mt-1 text-secondary">{text}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[24px] bg-chat-canvas p-6 sm:p-8">
          <ChatPreview />
        </div>
      </main>
    </div>
  )
}
