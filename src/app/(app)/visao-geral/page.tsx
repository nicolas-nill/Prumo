import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageCircle, Plus } from 'lucide-react'
import { EvolutionChart } from '@/components/charts/evolution-chart'
import { AvailableCard } from '@/components/dashboard/available-card'
import { DistributionPanel } from '@/components/dashboard/distribution-panel'
import { GoalsSummary } from '@/components/dashboard/goals-summary'
import { UpcomingPanel } from '@/components/dashboard/upcoming-panel'
import { InsightsPanel } from '@/components/dashboard/insights-panel'
import { KpiStrip } from '@/components/dashboard/kpi-strip'
import { PacePanel } from '@/components/dashboard/pace-panel'
import { PlanSection } from '@/components/dashboard/plan-section'
import { MonthSwitcher, PerspectiveSwitcher } from '@/components/layout/period-controls'
import { EmptyState, Panel, SectionHeading } from '@/components/ui/misc'
import { TransactionList } from '@/components/transactions/transaction-list'
import { formatMonthLong, monthOf } from '@/domain/dates'
import { hrefWith, resolveMonth, resolvePerspective } from '@/features/dashboard/params'
import { loadDashboard } from '@/features/dashboard/queries'
import { getSpaceContext, getTransactionReference } from '@/server/session'

export const metadata: Metadata = { title: 'Visão geral' }

export default async function DashboardPage({ searchParams }: PageProps<'/visao-geral'>) {
  const params = await searchParams
  const { viewer, space, today } = await getSpaceContext()
  const month = resolveMonth(params, today)
  const view = resolvePerspective(params, space, viewer.userId)
  const [data, reference] = await Promise.all([loadDashboard(month, view.perspective), getTransactionReference()])
  const movementsHref = (extra: Record<string, string | null> = {}) =>
    hrefWith('/movimentacoes', {}, { mes: month === monthOf(today) ? null : month, ...(view.selected !== 'todos' ? { pessoa: view.selected === 'eu' ? viewer.userId : view.selected } : {}), ...extra })

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <header className="flex flex-col gap-4 pt-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-eyebrow mb-2">Visão geral{view.filtered ? ` · ${view.options.find((o) => o.key === view.selected)?.label}` : ''}</p>
          <h1 className="text-page-title">{formatMonthLong(month)}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PerspectiveSwitcher pathname="/visao-geral" params={params} options={view.options} selected={view.selected} />
          <MonthSwitcher pathname="/visao-geral" params={params} month={month} currentMonth={monthOf(today)} />
        </div>
      </header>

      {!data.hasAnyData ? (
        <Panel>
          <EmptyState
            icon={MessageCircle}
            title="Seu primeiro registro leva segundos"
            description="Mande “gastei 35 no almoço” para o PRUMO no WhatsApp ou registre aqui. O painel se monta sozinho a partir disso."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/whatsapp" className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-fg">
                  <MessageCircle className="size-4" aria-hidden /> Conectar WhatsApp
                </Link>
                <Link href="/movimentacoes?nova=1" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-surface px-4 text-sm font-medium">
                  <Plus className="size-4" aria-hidden /> Registrar manualmente
                </Link>
              </div>
            }
          />
        </Panel>
      ) : (
        <>
          <KpiStrip data={data} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(300px,0.9fr)] lg:gap-4">
            <div className="order-2 lg:order-1">
              <PlanSection data={data} planHref={hrefWith('/planejamento', {}, { mes: month === monthOf(today) ? null : month })} />
            </div>
            <div className="order-1 lg:order-2 lg:pt-[52px]">
              <AvailableCard data={data} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(300px,0.9fr)]">
            <PacePanel data={data} />
            <div className="flex flex-col gap-4">
              <InsightsPanel data={data} />
              {data.upcoming ? <UpcomingPanel data={data} /> : null}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <DistributionPanel data={data} categoryHref={(id) => movementsHref({ categoria: id ?? 'none', tipo: 'expense' })} />
            <Panel className="px-5 py-5 sm:px-6" aria-labelledby="evolution-title">
              <SectionHeading id="evolution-title" eyebrow="Evolução" title="Receitas e despesas nos últimos meses" />
              <EvolutionChart points={data.evolution} currentMonth={monthOf(today)} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(300px,0.9fr)]">
            <Panel className="px-2 py-5 sm:px-3" aria-labelledby="recent-title">
              <SectionHeading
                id="recent-title"
                className="px-3"
                eyebrow="Movimentações recentes"
                title={`${data.recentTotal} no mês`}
                actions={
                  <Link href={movementsHref()} className="text-sm font-medium text-accent hover:underline">
                    Ver todas
                  </Link>
                }
              />
              {data.recent.length === 0 ? (
                <p className="px-3 py-6 text-secondary">Nada registrado neste mês.</p>
              ) : (
                <TransactionList items={data.recent} reference={reference} variant="compact" />
              )}
            </Panel>
            <GoalsSummary data={data} />
          </div>
        </>
      )}
    </div>
  )
}
