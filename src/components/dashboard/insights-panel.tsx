import { CircleCheckBig, Info, TriangleAlert } from 'lucide-react'
import { Panel, SectionHeading } from '@/components/ui/misc'
import type { DashboardData } from '@/features/dashboard/queries'
import { cn } from '@/lib/utils/cn'

const ICONS = { attention: TriangleAlert, positive: CircleCheckBig, neutral: Info }
const COLORS = { attention: 'text-warning', positive: 'text-success', neutral: 'text-fg-muted' }

export function InsightsPanel({ data }: { data: DashboardData }) {
  return (
    <Panel className="px-5 py-5 sm:px-6" aria-labelledby="insights-title">
      <SectionHeading id="insights-title" eyebrow="Seu mês" title="O que chama atenção" />
      {data.insights.length === 0 ? (
        <p className="text-secondary">Nada fora do comum até aqui. Continue registrando para o PRUMO acompanhar o mês com você.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.insights.map((insight) => {
            const Icon = ICONS[insight.tone]
            return (
              <li key={insight.id} className="flex gap-3">
                <Icon className={cn('mt-0.5 size-4 shrink-0', COLORS[insight.tone])} aria-hidden />
                <p className="text-[0.9375rem] leading-snug">{insight.text}</p>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
