import type { Metadata } from 'next'
import Link from 'next/link'
import { CreditCard, Landmark, Plus } from 'lucide-react'
import { AccountDialog, CardDialog } from '@/components/accounts/account-dialogs'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge, EmptyState, Panel, SectionHeading } from '@/components/ui/misc'
import { toneSoft } from '@/components/ui/tone'
import { formatDateBR, formatDateShort, monthEnd, monthOf, monthStart } from '@/domain/dates'
import { formatMoney, formatPercent } from '@/domain/money'
import { cardInvoiceState } from '@/domain/finance'
import { ACCOUNT_TYPE_LABEL } from '@/features/accounts/schemas'
import { getReferenceData, getSpaceContext } from '@/server/session'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Contas e cartões' }

export default async function AccountsPage() {
  const { viewer, space, today } = await getSpaceContext()
  const { accounts, cards } = await getReferenceData(space.id)
  const members = space.members.map((m) => ({ id: m.userId, name: m.fullName }))
  const memberName = (id: string | null) => (id ? (members.find((m) => m.id === id)?.name ?? 'Membro') : 'Compartilhada')
  const month = monthOf(today)

  // One small aggregate per card period (cards are few) — never the full history.
  const cardStats = await Promise.all(
    cards.map(async (card) => {
      const state = cardInvoiceState(today, card.closingDay, card.dueDay)
      const [open, closed, monthTotal] = await Promise.all([
        viewer.repo.cardTotals(space.id, state.open.periodStart, state.open.periodEnd),
        state.closedUnpaid ? viewer.repo.cardTotals(space.id, state.closedUnpaid.periodStart, state.closedUnpaid.periodEnd) : Promise.resolve([]),
        viewer.repo.cardTotals(space.id, monthStart(month), monthEnd(month)),
      ])
      const pick = (rows: { cardId: string; totalCents: number }[]) => rows.find((r) => r.cardId === card.id)?.totalCents ?? 0
      return { card, state, openCents: pick(open), closedCents: pick(closed), monthCents: pick(monthTotal) }
    }),
  )

  return (
    <div className="flex flex-col gap-8">
      <header className="pt-2">
        <p className="text-eyebrow mb-2">Contas e cartões</p>
        <h1 className="text-page-title">De onde sai e onde entra</h1>
        <p className="mt-2 max-w-2xl text-secondary">Organize contas e cartões para saber o que vai para cada fatura. Nenhum dado bancário sensível é armazenado.</p>
      </header>

      <section aria-labelledby="cards-title">
        <SectionHeading
          id="cards-title"
          title="Cartões de crédito"
          actions={
            <CardDialog members={members} viewerId={viewer.userId} trigger={<Button variant="secondary" size="sm"><Plus aria-hidden /> Cartão</Button>} />
          }
        />
        {cards.length === 0 ? (
          <Panel>
            <EmptyState icon={CreditCard} title="Nenhum cartão cadastrado" description="Cadastre o fechamento e o vencimento para o PRUMO montar a fatura e as parcelas." />
          </Panel>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {cardStats.map(({ card, state, openCents, closedCents, monthCents }) => (
              <article key={card.id} className={cn('rounded-[18px] border border-border bg-surface p-5', !card.isActive && 'opacity-60')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={cn('inline-flex size-10 items-center justify-center rounded-[12px]', toneSoft(card.tone))}>
                      <CreditCard className="size-5" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-card-title">
                        {card.name} {card.lastFour ? <span className="font-normal text-fg-muted tabular">•••• {card.lastFour}</span> : null}
                      </h3>
                      <p className="text-caption">
                        Fecha dia {card.closingDay} · vence dia {card.dueDay}
                        {members.length > 1 ? ` · ${memberName(card.holderId).split(' ')[0]}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!card.isActive ? <Badge>Inativo</Badge> : null}
                    <CardDialog card={card} members={members} viewerId={viewer.userId} trigger={<Button variant="ghost" size="sm">Editar</Button>} />
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-caption">Fatura aberta</dt>
                    <dd className="text-figure text-xl">{formatMoney(openCents)}</dd>
                    <dd className="text-caption">
                      fecha {formatDateShort(state.open.closingDate, today)} · vence {formatDateBR(state.open.dueDate)}
                    </dd>
                  </div>
                  {state.closedUnpaid ? (
                    <div>
                      <dt className="text-caption">Fatura fechada</dt>
                      <dd className="text-figure text-xl">{formatMoney(closedCents)}</dd>
                      <dd className="text-caption">vence {formatDateShort(state.closedUnpaid.dueDate, today)}</dd>
                    </div>
                  ) : (
                    <div>
                      <dt className="text-caption">Gasto no mês</dt>
                      <dd className="text-figure text-xl">{formatMoney(monthCents)}</dd>
                      <dd className="text-caption">compras datadas neste mês</dd>
                    </div>
                  )}
                </dl>
                {card.limitCents ? (
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-caption">
                      <span>Limite {formatMoney(card.limitCents, { hideCents: true })}</span>
                      <span className="tabular">{formatPercent((openCents + closedCents) / card.limitCents)} em faturas</span>
                    </div>
                    <Progress value={(openCents + closedCents) / card.limitCents} tone={card.tone} size="sm" label={`Uso do limite do ${card.name}`} />
                  </div>
                ) : null}
                <Link href={`/movimentacoes?cartao=${card.id}`} className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
                  Ver compras
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="accounts-title">
        <SectionHeading
          id="accounts-title"
          title="Contas"
          actions={<AccountDialog members={members} trigger={<Button variant="secondary" size="sm"><Plus aria-hidden /> Conta</Button>} />}
        />
        {accounts.length === 0 ? (
          <Panel>
            <EmptyState icon={Landmark} title="Nenhuma conta cadastrada" description="Conta corrente, poupança, carteira digital ou dinheiro vivo." />
          </Panel>
        ) : (
          <Panel className="px-2 py-2">
            <ul>
              {accounts.map((a) => (
                <li key={a.id} className={cn('flex items-center gap-3 border-t border-divider px-3 py-3 first:border-t-0', !a.isActive && 'opacity-60')}>
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-surface-muted text-fg-muted">
                    <Landmark className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {a.name} {!a.isActive ? <Badge className="ml-1">Inativa</Badge> : null}
                    </p>
                    <p className="text-caption">
                      {ACCOUNT_TYPE_LABEL[a.type]}
                      {members.length > 1 ? ` · ${memberName(a.ownerId)}` : ''}
                      {a.openingBalanceCents ? ` · saldo inicial ${formatMoney(a.openingBalanceCents)}` : ''}
                    </p>
                  </div>
                  <Link href={`/movimentacoes?conta=${a.id}`} className="hidden text-sm font-medium text-accent hover:underline sm:inline">
                    Movimentações
                  </Link>
                  <AccountDialog account={a} members={members} trigger={<Button variant="ghost" size="sm">Editar</Button>} />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </section>
    </div>
  )
}
