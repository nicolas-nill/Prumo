import Link from 'next/link'
import { Panel, SectionHeading } from '@/components/ui/misc'
import { toneSolid } from '@/components/ui/tone'
import { formatMoney, formatPercent } from '@/domain/money'
import type { DashboardData } from '@/features/dashboard/queries'
import { cn } from '@/lib/utils/cn'

/**
 * Where the money went: one 100% stacked bar by budget group (few, stable slices) and a
 * ranked list of the largest categories. The legend doubles as the data table.
 */
export function DistributionPanel({ data, categoryHref }: { data: DashboardData; categoryHref: (categoryId: string | null) => string }) {
  const total = data.distribution.reduce((acc, d) => acc + d.totalCents, 0)
  const maxCategory = data.ranking[0]?.totalCents ?? 0

  return (
    <Panel className="h-full px-5 py-5 sm:px-6" aria-labelledby="distribution-title">
      <SectionHeading id="distribution-title" eyebrow="Distribuição" title="Para onde foi o dinheiro" />
      {total === 0 ? (
        <p className="py-6 text-secondary">Nenhuma despesa registrada neste mês.</p>
      ) : (
        <>
          <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label="Distribuição das saídas por grupo">
            {data.distribution.map((d) => (
              <div
                key={d.key}
                title={`${d.label}: ${formatMoney(d.totalCents)} (${formatPercent(d.share)})`}
                className={cn('h-full first:rounded-l-[4px] last:rounded-r-[4px]', toneSolid(d.tone))}
                style={{ width: `${d.share * 100}%` }}
              />
            ))}
          </div>
          <table className="mt-4 w-full text-sm">
            <caption className="sr-only">Saídas por grupo</caption>
            <tbody>
              {data.distribution.map((d) => (
                <tr key={d.key}>
                  <th scope="row" className="py-1.5 text-left font-normal">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className={cn('size-2.5 shrink-0 rounded-[3px]', toneSolid(d.tone))} />
                      {d.label}
                      {d.isSavings ? <span className="text-caption">(aportes)</span> : null}
                    </span>
                  </th>
                  <td className="py-1.5 text-right text-money">{formatMoney(d.totalCents)}</td>
                  <td className="w-14 py-1.5 text-right text-fg-muted tabular">{formatPercent(d.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mt-6 mb-3 text-eyebrow">Maiores categorias</h3>
          <ol className="flex flex-col gap-3">
            {data.ranking.map((c, i) => (
              <li key={c.categoryId ?? 'none'}>
                <Link href={categoryHref(c.categoryId)} className="group block rounded-[8px] focus-visible:outline-2">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="w-4 text-caption tabular">{i + 1}</span>
                      <span className="truncate group-hover:underline">{c.name}</span>
                    </span>
                    <span className="shrink-0 text-money">{formatMoney(c.totalCents)}</span>
                  </div>
                  <div className="mt-1.5 ml-6 h-1.5 rounded-full bg-track">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${maxCategory ? (c.totalCents / maxCategory) * 100 : 0}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </Panel>
  )
}
