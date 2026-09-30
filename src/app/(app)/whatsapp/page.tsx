import type { Metadata } from 'next'
import Link from 'next/link'
import { Image as ImageIcon, MessageCircle, Mic, Smartphone } from 'lucide-react'
import { LinkWhatsAppForm, RevokeIdentityButton } from '@/components/whatsapp/link-form'
import { Badge, Panel, SectionHeading } from '@/components/ui/misc'
import { formatDateShort } from '@/domain/dates'
import { formatBrazilianPhone } from '@/features/whatsapp/phone'
import { areDevToolsEnabled, getOpenAIConfig, getWhatsAppConfig, getWhatsAppDisplayNumber } from '@/lib/env'
import { getSpaceContext } from '@/server/session'

export const metadata: Metadata = { title: 'WhatsApp' }

const STATUS_LABEL: Record<string, string> = {
  processed: 'Registrado',
  needs_confirmation: 'Aguardando confirmação',
  ignored: 'Ignorado',
  failed: 'Falhou',
  received: 'Recebido',
  processing: 'Processando',
  sent: 'Enviado',
  delivered: 'Entregue',
  read: 'Lido',
}

export default async function WhatsAppPage() {
  const { viewer, space, today } = await getSpaceContext()
  const [identities, activity] = await Promise.all([viewer.repo.listWhatsAppIdentities(), viewer.repo.listWhatsAppActivity(12)])
  const verified = identities.filter((i) => i.status === 'verified')
  const metaReady = getWhatsAppConfig() !== null
  const aiReady = getOpenAIConfig() !== null
  const devTools = areDevToolsEnabled()

  return (
    <div className="flex flex-col gap-8">
      <header className="pt-2">
        <p className="text-eyebrow mb-2">WhatsApp</p>
        <h1 className="text-page-title">Registre tudo por mensagem</h1>
        <p className="mt-2 max-w-2xl text-secondary">
          Conecte seu número e mande gastos como mandaria para alguém: texto, áudio ou foto do comprovante. Os registros vão para “{space.name}”.
        </p>
      </header>

      {!metaReady ? (
        <div className="rounded-[14px] border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          <p className="font-medium">Integração com a Meta ainda não configurada nesta instalação.</p>
          <p className="mt-0.5 opacity-90">
            Você já pode conectar o número e testar tudo {devTools ? <Link href="/dev/whatsapp" className="underline">pelo simulador</Link> : 'pelo simulador em desenvolvimento'}. Veja docs/WHATSAPP.md.
          </p>
        </div>
      ) : null}

      <section aria-labelledby="numbers-title">
        <SectionHeading id="numbers-title" title="Seus números" description="Só números verificados por você podem registrar no seu nome." />
        {identities.length ? (
          <Panel className="mb-5 px-2 py-2">
            <ul>
              {identities.map((i) => (
                <li key={i.id} className="flex items-center gap-3 border-t border-divider px-3 py-3 first:border-t-0">
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Smartphone className="size-4" aria-hidden />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium tabular">{formatBrazilianPhone(i.phoneE164)}</span>
                    <span className="block text-caption">{i.status === 'verified' ? 'Conectado' : 'Aguardando o código pelo WhatsApp'}</span>
                  </span>
                  <Badge tone={i.status === 'verified' ? 'success' : 'warning'}>{i.status === 'verified' ? 'Verificado' : 'Pendente'}</Badge>
                  <RevokeIdentityButton identityId={i.id} />
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
        <LinkWhatsAppForm businessNumber={getWhatsAppDisplayNumber()} devTools={devTools} />
      </section>

      <section aria-labelledby="how-title">
        <SectionHeading id="how-title" title="Como mandar" />
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { icon: MessageCircle, title: 'Texto', lines: ['gastei 47,90 no almoço', 'recebi 5.000 de salário', 'notebook 2.400 em 10x no Nubank'] },
            { icon: Mic, title: 'Áudio', lines: ['Fale como numa conversa:', '“paguei trezentos e vinte no mercado hoje”'], note: aiReady ? null : 'Requer IA configurada.' },
            { icon: ImageIcon, title: 'Foto do comprovante', lines: ['Cupom, nota ou Pix.', 'O PRUMO lê o total e pede confirmação.'], note: aiReady ? null : 'Requer IA configurada.' },
          ].map(({ icon: Icon, title, lines, note }) => (
            <Panel key={title} className="px-5 py-4">
              <Icon className="size-5 text-accent" aria-hidden />
              <p className="mt-3 text-card-title">{title}</p>
              <ul className="mt-1.5 space-y-1 text-secondary">
                {lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {note ? <p className="mt-2 text-caption">{note}</p> : null}
            </Panel>
          ))}
        </div>
        <p className="mt-3 text-caption">
          Corrija com “na verdade foram 42” ou “foi no cartão Nubank”, apague com “apaga o último” e pergunte “quanto ainda posso gastar?”.
        </p>
      </section>

      {verified.length || activity.length ? (
        <section aria-labelledby="activity-title">
          <SectionHeading id="activity-title" title="Atividade recente" />
          {activity.length === 0 ? (
            <p className="text-secondary">Nenhuma mensagem ainda.</p>
          ) : (
            <Panel className="px-2 py-2">
              <ul>
                {activity.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 border-t border-divider px-3 py-2.5 text-sm first:border-t-0">
                    <span className="text-fg-muted">
                      {a.direction === 'inbound' ? 'Você enviou' : 'PRUMO respondeu'} · {a.messageType === 'audio' ? 'áudio' : a.messageType === 'image' ? 'foto' : 'texto'}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-caption tabular">{formatDateShort(a.receivedAt.slice(0, 10), today)} {a.receivedAt.slice(11, 16)}</span>
                      <Badge tone={a.status === 'processed' ? 'success' : a.status === 'failed' ? 'danger' : a.status === 'needs_confirmation' ? 'warning' : 'neutral'}>
                        {STATUS_LABEL[a.status] ?? a.status}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </section>
      ) : null}
    </div>
  )
}
