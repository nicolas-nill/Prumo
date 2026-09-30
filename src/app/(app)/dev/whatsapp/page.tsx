import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { WhatsAppSimulator } from '@/components/whatsapp/simulator'
import { InlineError } from '@/components/ui/misc'
import { RECEIPT_FIXTURES } from '@/features/ai/fixtures'
import { formatBrazilianPhone } from '@/features/whatsapp/phone'
import { areDevToolsEnabled, getDataMode, getOpenAIConfig } from '@/lib/env'
import { DEMO_USERS } from '@/server/data/demo/dataset'
import { getSpaceContext } from '@/server/session'

export const metadata: Metadata = { title: 'Simulador do WhatsApp', robots: { index: false } }

export default async function SimulatorPage() {
  if (!areDevToolsEnabled()) notFound()
  const { viewer } = await getSpaceContext()
  const identities = await viewer.repo.listWhatsAppIdentities()
  const needsSecret = getDataMode() === 'supabase' && !process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY

  const senders =
    viewer.mode === 'demo'
      ? Object.values(DEMO_USERS).map((u) => ({ phone: u.phone.slice(1), label: `${u.fullName.split(' ')[0]} · ${formatBrazilianPhone(u.phone)}` }))
      : identities.map((i) => ({ phone: i.phoneE164.slice(1), label: `${formatBrazilianPhone(i.phoneE164)}${i.status === 'pending' ? ' (pendente)' : ''}` }))

  return (
    <div className="flex flex-col gap-6">
      <header className="pt-2">
        <p className="text-eyebrow mb-2">Ferramenta de desenvolvimento</p>
        <h1 className="text-page-title">Simulador do WhatsApp</h1>
        <p className="mt-2 max-w-3xl text-secondary">
          Teste o fluxo completo sem credenciais da Meta. As mensagens passam pelo mesmo pipeline do webhook e as movimentações aparecem no painel de verdade.
          Indisponível em produção.
        </p>
      </header>
      {needsSecret ? (
        <InlineError title="Configure SUPABASE_SECRET_KEY" message="O pipeline do WhatsApp roda no servidor com a chave secreta do Supabase (nunca exposta ao navegador)." />
      ) : (
        <WhatsAppSimulator senders={senders} receipts={RECEIPT_FIXTURES.map((r) => ({ id: r.id, label: r.label }))} realAi={getOpenAIConfig() !== null} />
      )}
    </div>
  )
}
