import { CalendarClock, CreditCard, Repeat } from 'lucide-react'
import { Panel, SectionHeading } from '@/components/ui/misc'
import { formatDateShort } from '@/domain/dates'
import { formatMoney } from '@/domain/money'
import { UPCOMING_DAYS, type DashboardData } from '@/features/dashboard/queries'
import { cn } from '@/lib/utils/cn'

const MAX_ITEMS = 6

/** Recurring bills, income and card invoices due soon — so "available" has context. */
export function UpcomingPanel({ data }: { data: DashboardData }) {
  const items = data.upcoming ?? []
  const expenses = items.filter((i) => i.kind !== 'income').reduce((a, i) => a + i.amountCents, 0)
  return (
    <Panel className="flex-1 px-5 py-5 sm:px-6" aria-labelledby="upcoming-title">
      <SectionHeading
        id="upcoming-title"
        eyebrow={`Próximos ${UPCOMING_DAYS} dias`}
        title="O que vem por aí"
        actions={items.length ? <p className="text-right text-caption">Saídas previstas<br /><span className="text-money text-sm text-fg">{formatMoney(expenses, { hideCents: true })}</span></p> : null}
      />
      {items.length === 0 ? (
        <div className="flex items-start gap-3 text-secondary">
          <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Nenhuma recorrência ou fatura vence nos próximos dias.</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.slice(0, MAX_ITEMS).map((item) => {
            const Icon = item.kind === 'invoice' ? CreditCard : Repeat
            return (
              <li key={item.id} className="flex items-center gap-3 border-t border-divider py-2.5 first:border-t-0 first:pt-0">
                <span className="w-12 shrink-0 text-caption tabular">{formatDateShort(item.date, data.today)}</span>
                <Icon className="size-3.5 shrink-0 text-fg-subtle" aria-label={item.kind === 'invoice' ? 'Fatura' : 'Recorrência'} />
                <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                <span className={cn('text-money text-sm', item.kind === 'income' && 'text-success')}>
                  {item.kind === 'income' ? '+' : ''}
                  {formatMoney(item.amountCents)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {items.length > MAX_ITEMS ? <p className="mt-2 text-caption">e mais {items.length - MAX_ITEMS}</p> : null}
    </Panel>
  )
}
