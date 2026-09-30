import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { MonthSwitcher } from '@/components/layout/period-controls'
import { SectionTabs } from '@/components/layout/section-tabs'
import { AutoOpenTransactionDialog } from '@/components/transactions/auto-open-dialog'
import { FilterBar } from '@/components/transactions/filter-bar'
import { TransactionList } from '@/components/transactions/transaction-list'
import { EmptyState, Panel } from '@/components/ui/misc'
import { formatDateBR, formatMonthLong, monthOf } from '@/domain/dates'
import { resolveMonth, hrefWith } from '@/features/dashboard/params'
import { parseTransactionFilters } from '@/features/transactions/filters'
import { toViews } from '@/features/transactions/reference'
import { getSpaceContext, getTransactionReference } from '@/server/session'

export const metadata: Metadata = { title: 'Movimentações' }

export default async function TransactionsPage({ searchParams }: PageProps<'/movimentacoes'>) {
  const params = await searchParams
  const { viewer, space, today } = await getSpaceContext()
  const month = resolveMonth(params, today)
  const { query, active, customRange } = parseTransactionFilters(params, month)
  const [page, reference] = await Promise.all([viewer.repo.listTransactions(space.id, query), getTransactionReference()])
  const items = toViews(page.items, reference)
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize))
  const first = (page.page - 1) * page.pageSize + 1
  const last = Math.min(page.page * page.pageSize, page.total)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 pt-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-eyebrow mb-2">Movimentações</p>
          <h1 className="text-page-title">{customRange ? `${formatDateBR(query.from!)} a ${formatDateBR(query.to!)}` : formatMonthLong(month)}</h1>
        </div>
        {customRange ? (
          <Link href={hrefWith('/movimentacoes', params, { de: null, ate: null })} className="text-sm font-medium text-accent hover:underline">
            Voltar para o mês
          </Link>
        ) : (
          <MonthSwitcher pathname="/movimentacoes" params={params} month={month} currentMonth={monthOf(today)} />
        )}
      </header>

      <SectionTabs
        label="Tipo de lançamento"
        tabs={[
          { href: '/movimentacoes', label: 'Lançamentos' },
          { href: '/movimentacoes/recorrentes', label: 'Recorrentes' },
        ]}
      />

      <FilterBar reference={reference} activeCount={active} />

      <Panel className="px-2 py-2 sm:px-3 sm:py-4">
        {items.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title={active ? 'Nenhuma movimentação com esses filtros' : 'Nenhuma movimentação neste período'}
            description={active ? 'Tente remover algum filtro ou buscar por outro termo.' : 'Registre pelo WhatsApp ou pelo botão “Nova movimentação”.'}
            action={
              active ? (
                <Link href={hrefWith('/movimentacoes', {}, { mes: typeof params.mes === 'string' ? params.mes : null })} className="text-sm font-medium text-accent hover:underline">
                  Limpar filtros
                </Link>
              ) : (
                <Link href="/movimentacoes?nova=1" className="text-sm font-medium text-accent hover:underline">
                  Registrar movimentação
                </Link>
              )
            }
          />
        ) : (
          <>
            <p className="px-3 pb-3 text-caption" aria-live="polite">
              {page.total === 1 ? '1 movimentação' : `${page.total} movimentações`}
              {pages > 1 ? ` · mostrando ${first}–${last}` : ''}
            </p>
            <TransactionList items={items} reference={reference} variant="full" groupByDate={!query.sort || query.sort.startsWith('date')} />
          </>
        )}
      </Panel>

      {pages > 1 ? (
        <nav aria-label="Paginação" className="flex items-center justify-between">
          <PageLink disabled={page.page <= 1} href={hrefWith('/movimentacoes', params, { pagina: String(page.page - 1) })}>
            <ChevronLeft className="size-4" aria-hidden /> Anteriores
          </PageLink>
          <span className="text-sm text-fg-muted tabular">
            Página {page.page} de {pages}
          </span>
          <PageLink disabled={page.page >= pages} href={hrefWith('/movimentacoes', params, { pagina: String(page.page + 1) })}>
            Próximas <ChevronRight className="size-4" aria-hidden />
          </PageLink>
        </nav>
      ) : null}

      {params.nova === '1' ? <AutoOpenTransactionDialog reference={reference} /> : null}
    </div>
  )
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="inline-flex h-10 items-center gap-1.5 px-3 text-sm text-fg-subtle">{children}</span>
  return (
    <Link href={href} className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-muted">
      {children}
    </Link>
  )
}
