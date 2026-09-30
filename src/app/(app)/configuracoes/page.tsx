import type { Metadata } from 'next'
import { Plus } from 'lucide-react'
import { AppearanceControl, CategoryDialog, CategoryRow, ProfileForm } from '@/components/settings/settings-forms'
import { Button } from '@/components/ui/button'
import { Panel, SectionHeading } from '@/components/ui/misc'
import { PLAN_ENTITLEMENTS, planLabel } from '@/domain/entitlements'
import { getReferenceData, getSpaceContext } from '@/server/session'

export const metadata: Metadata = { title: 'Configurações' }

export default async function SettingsPage() {
  const { profile, space } = await getSpaceContext()
  const { groups, categories } = await getReferenceData(space.id)
  const e = PLAN_ENTITLEMENTS[space.plan]
  const sections = [
    ...groups.map((g) => ({ key: g.id, title: g.name, tone: g.tone, items: categories.filter((c) => c.kind === 'expense' && c.groupId === g.id) })),
    { key: 'none', title: 'Sem grupo', tone: 'slate' as const, items: categories.filter((c) => c.kind === 'expense' && !c.groupId) },
    { key: 'income', title: 'Receitas', tone: 'sage' as const, items: categories.filter((c) => c.kind === 'income') },
  ].filter((s) => s.items.length > 0)

  return (
    <div className="flex flex-col gap-10">
      <header className="pt-2">
        <p className="text-eyebrow mb-2">Configurações</p>
        <h1 className="text-page-title">Preferências</h1>
      </header>

      <section aria-labelledby="profile-title">
        <SectionHeading id="profile-title" title="Perfil" />
        <ProfileForm fullName={profile.fullName ?? ''} timezone={profile.timezone} email={profile.email} />
      </section>

      <section aria-labelledby="appearance-title">
        <SectionHeading id="appearance-title" title="Aparência" description="Claro, escuro ou acompanhando o sistema. A escolha fica salva neste dispositivo." />
        <AppearanceControl />
      </section>

      <section aria-labelledby="categories-title">
        <SectionHeading
          id="categories-title"
          title="Categorias"
          description={`Do espaço “${space.name}”. Arquivar esconde das opções sem apagar o histórico.`}
          actions={
            <CategoryDialog
              groups={groups}
              trigger={
                <Button variant="secondary" size="sm">
                  <Plus aria-hidden /> Categoria
                </Button>
              }
            />
          }
        />
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <Panel key={section.key} className="px-2 py-3">
              <h3 className="px-3 pb-2 text-eyebrow">{section.title}</h3>
              <ul>
                {section.items.map((c) => (
                  <CategoryRow key={c.id} category={c} groups={groups} tone={c.tone ?? section.tone} />
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      </section>

      <section aria-labelledby="plan-title">
        <SectionHeading id="plan-title" title={`Plano ${planLabel(space.plan)}`} description="Acesso antecipado: os limites abaixo são provisórios." />
        <Panel className="max-w-xl px-5 py-4">
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-fg-muted">Pessoas no espaço</dt>
            <dd className="text-right tabular">até {e.maxMembers}</dd>
            <dt className="text-fg-muted">Mensagens interpretadas por IA</dt>
            <dd className="text-right tabular">{e.aiActionsPerMonth.toLocaleString('pt-BR')} por mês</dd>
            <dt className="text-fg-muted">Histórico</dt>
            <dd className="text-right">{e.historyMonths ? `${e.historyMonths} meses` : 'ilimitado'}</dd>
            <dt className="text-fg-muted">Recorrências</dt>
            <dd className="text-right">{e.maxRecurringRules ?? 'ilimitadas'}</dd>
          </dl>
        </Panel>
      </section>

      <section aria-labelledby="privacy-title">
        <SectionHeading id="privacy-title" title="Dados e privacidade" />
        <ul className="max-w-2xl list-disc space-y-2 pl-5 text-secondary">
          <li>O texto das mensagens do WhatsApp fica guardado por até 30 dias, só para correções e suporte. Depois é apagado.</li>
          <li>Fotos de comprovantes e áudios são processados e descartados — não guardamos os arquivos.</li>
          <li>Cartões guardam só apelido e 4 últimos dígitos. Nunca pedimos senha de banco.</li>
          <li>Cada espaço é isolado no banco de dados; ninguém de fora do espaço consegue ler seus registros.</li>
        </ul>
      </section>
    </div>
  )
}
