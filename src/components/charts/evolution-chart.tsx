'use client'

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { formatMonthShort, monthName } from '@/domain/dates'
import { formatMoney } from '@/domain/money'

export interface EvolutionPoint {
  month: string
  incomeCents: number
  expenseCents: number
  resultCents: number
}

const SERIES = [
  { key: 'income', label: 'Receitas', color: 'var(--chart-income)' },
  { key: 'expense', label: 'Despesas', color: 'var(--chart-expense)' },
  { key: 'result', label: 'Resultado', color: 'var(--chart-result)' },
] as const

const compactBRL = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

function ChartTooltip({ active, payload, label, currentMonth }: TooltipContentProps<number, string> & { currentMonth: string }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as { month: string; income: number; expense: number; result: number }
  return (
    <div className="min-w-[180px] rounded-[12px] border border-border bg-surface-elevated px-3.5 py-3 text-sm shadow-md">
      <p className="mb-2 font-medium">
        {monthName(String(label), { capitalized: true })} {String(label).slice(0, 4)}
        {row.month === currentMonth ? <span className="ml-1.5 text-caption">(parcial)</span> : null}
      </p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-fg-muted">
            <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="text-money">{formatMoney(Math.round(row[s.key] * 100))}</span>
        </p>
      ))}
    </div>
  )
}

/** Monthly income vs expenses (columns, one shared axis) with the result as a line. */
export function EvolutionChart({ points, currentMonth }: { points: EvolutionPoint[]; currentMonth: string }) {
  const data = points.map((p) => ({ month: p.month, income: p.incomeCents / 100, expense: p.expenseCents / 100, result: p.resultCents / 100 }))

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-caption" aria-label="Legenda">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden className={s.key === 'result' ? 'h-0.5 w-3 rounded-full' : 'size-2.5 rounded-[3px]'} style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="h-[240px] w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => formatMonthShort(m)}
              tickLine={false}
              axisLine={{ stroke: 'var(--border-strong)' }}
              tick={{ fill: 'var(--chart-axis)', fontSize: 12 }}
              dy={6}
            />
            <YAxis
              width={48}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--chart-axis)', fontSize: 12 }}
              tickFormatter={(v: number) => compactBRL.format(v)}
            />
            <Tooltip cursor={{ fill: 'var(--surface-muted)', opacity: 0.7 }} content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} currentMonth={currentMonth} />} />
            <Bar dataKey="income" name="Receitas" fill="var(--chart-income)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="expense" name="Despesas" fill="var(--chart-expense)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Line
              dataKey="result"
              name="Resultado"
              type="monotone"
              stroke="var(--chart-result)"
              strokeWidth={2}
              dot={{ r: 4, fill: 'var(--chart-result)', stroke: 'var(--surface)', strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-caption hover:text-fg">Ver em tabela</summary>
        <table className="mt-2 w-full">
          <caption className="sr-only">Evolução mensal</caption>
          <thead>
            <tr className="text-eyebrow">
              <th scope="col" className="py-1.5 text-left font-semibold">Mês</th>
              <th scope="col" className="py-1.5 text-right font-semibold">Receitas</th>
              <th scope="col" className="py-1.5 text-right font-semibold">Despesas</th>
              <th scope="col" className="py-1.5 text-right font-semibold">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.month} className="border-t border-divider">
                <th scope="row" className="py-1.5 text-left font-normal">
                  {formatMonthShort(p.month)}
                  {p.month === currentMonth ? ' (parcial)' : ''}
                </th>
                <td className="py-1.5 text-right tabular">{formatMoney(p.incomeCents)}</td>
                <td className="py-1.5 text-right tabular">{formatMoney(p.expenseCents)}</td>
                <td className="py-1.5 text-right tabular">{formatMoney(p.resultCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
