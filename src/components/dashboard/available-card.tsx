import { formatMoney } from '@/domain/money'
import type { DashboardData } from '@/features/dashboard/queries'

export function AvailableCard({ data }: { data: DashboardData }) {
  const { available, progress } = data
  const negative = available.availableCents < 0

  let caption: string
  if (available.basis === 'none') caption = 'Registre receitas ou monte um plano para calcular.'
  else if (progress.position === 'past') caption = negative ? 'O mês fechou acima do planejado.' : 'Sobrou do planejado no mês.'
  else if (progress.position === 'future') caption = 'Planejado para o mês.'
  else caption = available.basis === 'plan' ? 'Do que foi planejado para gastos, ainda resta' : 'Das receitas do mês, ainda resta'

  return (
    <section aria-label="Quanto ainda posso gastar" className="flex h-full min-h-[220px] flex-col rounded-[18px] bg-surface-inverse px-6 py-5 text-fg-inverse">
      <p className="text-eyebrow !text-fg-inverse-muted">{progress.position === 'past' ? 'Fechamento' : 'Disponível para gastar'}</p>
      <p className="mt-4 text-sm text-fg-inverse-muted">{caption}</p>
      <p className={`mt-1.5 text-figure text-[2.5rem] leading-none sm:text-[2.75rem] ${negative ? 'text-[var(--danger)]' : ''}`}>
        {negative ? '−' : ''}
        {formatMoney(Math.abs(available.availableCents), { hideCents: Math.abs(available.availableCents) >= 1_000_000 })}
      </p>
      <div className="mt-auto flex items-end justify-between border-t border-fg-inverse-muted/25 pt-4">
        <div>
          <p className="text-xs text-fg-inverse-muted">Por dia, até o fim do mês</p>
          <p className="text-figure text-lg">{available.perDayCents !== null ? formatMoney(available.perDayCents) : '—'}</p>
        </div>
        {progress.position === 'current' ? (
          <div className="text-right">
            <p className="text-xs text-fg-inverse-muted">Dias restantes</p>
            <p className="text-figure text-2xl leading-none">{available.remainingDays}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
