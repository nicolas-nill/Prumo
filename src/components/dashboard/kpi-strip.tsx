import { formatMonthLong, monthName } from '@/domain/dates'
import { formatMoney, formatPercent } from '@/domain/money'
import type { Comparison } from '@/domain/finance'
import type { DashboardData } from '@/features/dashboard/queries'
import { cn } from '@/lib/utils/cn'

function comparisonText(c: Comparison, kind: 'income' | 'expense' | 'result', data: DashboardData): string | null {
  if (!data.comparison.hasPrevious || c.deltaCents === 0) return null
  const ref = data.comparison.sameperiod ? `mesmo período de ${monthName(data.previousMonth)}` : monthName(data.previousMonth)
  const amount = formatMoney(Math.abs(c.deltaCents), { hideCents: Math.abs(c.deltaCents) >= 100_000 })
  if (kind === 'expense') return `${amount} ${c.deltaCents > 0 ? 'a mais' : 'a menos'} que no ${ref}`
  if (kind === 'income') return `${amount} ${c.deltaCents > 0 ? 'a mais' : 'a menos'} que no ${ref}`
  return `${c.deltaCents > 0 ? '+' : '−'}${amount} vs. ${ref}`
}

export function KpiStrip({ data }: { data: DashboardData }) {
  const { summary, comparison } = data
  const items = [
    { label: 'Receitas', value: summary.incomeCents, note: comparisonText(comparison.income, 'income', data) },
    { label: 'Despesas', value: summary.expenseCents, note: comparisonText(comparison.expense, 'expense', data) },
    {
      label: 'Resultado',
      value: summary.resultCents,
      note: summary.savingsCents > 0 ? `inclui ${formatMoney(summary.savingsCents, { hideCents: true })} investidos` : comparisonText(comparison.result, 'result', data),
      featured: true,
    },
    {
      label: 'Índice de poupança',
      value: null,
      display: formatPercent(summary.savingsRate, 1),
      note: summary.savingsRate === null ? 'Sem receitas no mês' : 'Resultado ÷ receitas',
    },
  ]

  return (
    <section aria-label={`Resumo de ${formatMonthLong(data.month)}`} className="grid grid-cols-2 overflow-hidden rounded-[18px] border border-border bg-surface lg:grid-cols-4">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={cn(
            'flex flex-col gap-2 px-4 py-4 sm:px-6 sm:py-5',
            i % 2 === 1 && 'border-l border-divider',
            i >= 2 && 'border-t border-divider lg:border-t-0',
            i === 2 && 'lg:border-l',
          )}
        >
          <span className="text-eyebrow">{item.label}</span>
          <span
            className={cn(
              'text-figure text-[1.375rem] leading-none sm:text-[1.75rem]',
              item.featured && (item.value ?? 0) >= 0 && 'text-success',
              item.featured && (item.value ?? 0) < 0 && 'text-danger',
            )}
          >
            {item.display ?? formatMoney(item.value ?? 0, { hideCents: Math.abs(item.value ?? 0) >= 1_000_000 })}
          </span>
          {item.note ? <span className="text-caption leading-snug">{item.note}</span> : <span className="text-caption">&nbsp;</span>}
        </div>
      ))}
    </section>
  )
}
