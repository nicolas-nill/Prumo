import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { AcceptInvitationForm } from '@/components/space/accept-invitation'
import { previewInvitation } from '@/server/invitations'
import { getViewer } from '@/server/session'

export const metadata: Metadata = { title: 'Convite', robots: { index: false } }

export default async function InvitationPage({ params }: PageProps<'/convite/[token]'>) {
  const { token } = await params
  const viewer = await getViewer()
  const preview = await previewInvitation(token)

  const next = `/convite/${token}`
  const valid = preview && preview.status === 'pending' && !preview.expired

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <Logo />
      {!preview ? (
        <>
          <h1 className="mt-10 text-page-title">Convite não encontrado</h1>
          <p className="mt-2 text-secondary">O link pode estar incompleto. {viewer ? '' : 'Se você já tem conta, entre para ver o convite.'}</p>
          {viewer ? null : (
            <Link href={`/entrar?next=${encodeURIComponent(next)}`} className="mt-6 text-sm font-medium text-accent hover:underline">
              Entrar
            </Link>
          )}
        </>
      ) : !valid ? (
        <>
          <h1 className="mt-10 text-page-title">Este convite não é mais válido</h1>
          <p className="mt-2 text-secondary">
            {preview.status === 'accepted' ? 'Ele já foi aceito.' : preview.expired ? 'Ele expirou.' : 'Ele foi cancelado.'} Peça a {preview.inviterName.split(' ')[0]} um novo link.
          </p>
        </>
      ) : (
        <>
          <p className="mt-10 text-eyebrow">Convite</p>
          <h1 className="mt-2 text-page-title">
            {preview.inviterName.split(' ')[0]} te convidou para “{preview.spaceName}”
          </h1>
          <p className="mt-3 text-secondary">
            Vocês vão acompanhar juntos os gastos compartilhados, o planejamento e as metas. O que cada um marcar como privado continua só seu. Convite para <strong className="text-fg">{preview.email}</strong>.
          </p>
          {viewer ? (
            <AcceptInvitationForm token={token} />
          ) : (
            <div className="mt-8 flex flex-col gap-2">
              <Link href={`/cadastro?next=${encodeURIComponent(next)}`} className="inline-flex h-12 items-center justify-center rounded-[12px] bg-primary font-medium text-primary-fg hover:bg-primary-hover">
                Criar conta e aceitar
              </Link>
              <Link href={`/entrar?next=${encodeURIComponent(next)}`} className="inline-flex h-12 items-center justify-center rounded-[12px] border border-border bg-surface font-medium hover:bg-surface-muted">
                Já tenho conta
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  )
}
