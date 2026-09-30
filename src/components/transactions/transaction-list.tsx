'use client'

import { useState } from 'react'
import { Image as ImageIcon, Lock, MessageCircle, Mic, Repeat, Users } from 'lucide-react'
import { CategoryIcon } from '@/components/ui/category-icon'
import { formatDateShort, weekdayShort } from '@/domain/dates'
import { formatMoney } from '@/domain/money'
import { canEditTransaction } from '@/domain/permissions'
import type { TransactionSource, TransactionView } from '@/domain/types'
import type { TransactionReference } from '@/features/transactions/reference'
import { cn } from '@/lib/utils/cn'
import { TransactionDialog } from './transaction-dialog'

const SOURCE_META: Partial<Record<TransactionSource, { icon: typeof Mic; label: string }>> = {
  whatsapp_text: { icon: MessageCircle, label: 'Registrado pelo WhatsApp' },
  whatsapp_audio: { icon: Mic, label: 'Registrado por áudio no WhatsApp' },
  whatsapp_image: { icon: ImageIcon, label: 'Registrado por foto no WhatsApp' },
  recurring: { icon: Repeat, label: 'Recorrência' },
}

interface TransactionListProps {
  items: TransactionView[]
  reference: TransactionReference
  /** Compact = dashboard; full = Movimentações page with more columns. */
  variant?: 'compact' | 'full'
  groupByDate?: boolean
}

export function TransactionList({ items, reference, variant = 'full', groupByDate = false }: TransactionListProps) {
  const [editing, setEditing] = useState<TransactionView | null>(null)
  const shared = reference.spaceType === 'shared'

  const groups: { date: string; items: TransactionView[] }[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (groupByDate && last && last.date === item.occurredOn) last.items.push(item)
    else groups.push({ date: item.occurredOn, items: [item] })
  }

  return (
    <>
      <div className={cn(variant === 'full' && 'hidden md:grid', 'grid-cols-[72px_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_120px] gap-4 px-3 pb-2 text-eyebrow', variant === 'compact' ? 'hidden' : '')}>
        <span>Data</span>
        <span>Descrição</span>
        <span>Categoria</span>
        <span>{shared ? 'Pessoa · Pagamento' : 'Pagamento'}</span>
        <span className="text-right">Valor</span>
      </div>
      <ul className="flex flex-col">
        {groups.map((group) => (
          <li key={`${group.date}-${group.items[0]!.id}`}>
            {groupByDate ? (
              <p className="sticky top-14 z-10 bg-bg/95 px-3 pt-4 pb-1.5 text-eyebrow backdrop-blur md:hidden lg:top-16">
                {formatDateShort(group.date, reference.today)} · {weekdayShort(group.date)}
              </p>
            ) : null}
            <ul>
              {group.items.map((tx) => (
                <Row
                  key={tx.id}
                  tx={tx}
                  variant={variant}
                  shared={shared}
                  today={reference.today}
                  viewerId={reference.viewerId}
                  hideDateOnMobile={groupByDate}
                  onOpen={() => setEditing(tx)}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <TransactionDialog reference={reference} transaction={editing} open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} />
    </>
  )
}

function Row({ tx, variant, shared, today, viewerId, hideDateOnMobile, onOpen }: { tx: TransactionView; variant: 'compact' | 'full'; shared: boolean; today: string; viewerId: string; hideDateOnMobile: boolean; onOpen: () => void }) {
  const editable = canEditTransaction(tx, viewerId)
  const source = SOURCE_META[tx.source]
  const income = tx.type === 'income'
  const firstName = tx.member?.fullName.split(' ')[0]
  const payment = tx.card ? `${tx.card.name}${tx.card.lastFour ? ` ${tx.card.lastFour}` : ''}` : tx.account?.name
  const amount = (
    <span className={cn('text-money text-[0.9375rem]', income && 'text-success')}>
      {income ? '+' : ''}
      {formatMoney(tx.amountCents)}
    </span>
  )

  const content = (
    <>
      {/* Mobile / compact layout */}
      <div className={cn('flex items-center gap-3', variant === 'full' && 'md:hidden')}>
        <CategoryIcon icon={tx.category?.icon ?? (income ? 'hand-coins' : null)} tone={tx.category?.tone ?? (income ? 'sage' : 'slate')} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[0.9375rem] font-medium">
            <span className="truncate">{tx.description}</span>
            {tx.installment ? <span className="shrink-0 text-xs font-normal text-fg-muted tabular">{tx.installment.number}/{tx.installment.count}</span> : null}
            {tx.visibility === 'private' ? <Lock className="size-3 shrink-0 text-fg-subtle" aria-label="Visível só para você" /> : null}
          </p>
          <p className="flex items-center gap-1.5 truncate text-caption">
            {source ? <source.icon className="size-3 shrink-0" aria-label={source.label} /> : null}
            <span className="truncate">
              {[hideDateOnMobile ? null : formatDateShort(tx.occurredOn, today), tx.category?.name ?? 'Sem categoria', shared ? firstName : null].filter(Boolean).join(' · ')}
            </span>
          </p>
        </div>
        <div className="text-right">
          {amount}
          {shared && tx.scope === 'shared' && variant === 'full' ? <p className="text-caption">Compartilhado</p> : null}
        </div>
      </div>

      {/* Desktop table layout */}
      {variant === 'full' ? (
        <div className="hidden grid-cols-[72px_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_120px] items-center gap-4 md:grid">
          <span className="text-sm text-fg-muted tabular">{formatDateShort(tx.occurredOn, today)}</span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{tx.description}</span>
              {tx.installment ? <span className="shrink-0 text-xs text-fg-muted tabular">{tx.installment.number}/{tx.installment.count}</span> : null}
              {tx.visibility === 'private' ? <Lock className="size-3 shrink-0 text-fg-subtle" aria-label="Visível só para você" /> : null}
              {source ? <source.icon className="size-3.5 shrink-0 text-fg-subtle" aria-label={source.label} /> : null}
            </span>
            {tx.merchant ? <span className="block truncate text-caption">{tx.merchant}</span> : null}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <CategoryIcon size="sm" icon={tx.category?.icon ?? (income ? 'hand-coins' : null)} tone={tx.category?.tone ?? (income ? 'sage' : 'slate')} />
            <span className="truncate text-sm">{tx.category?.name ?? 'Sem categoria'}</span>
          </span>
          <span className="min-w-0 text-sm text-fg-muted">
            <span className="flex items-center gap-1.5 truncate">
              {shared ? (
                <>
                  {tx.scope === 'shared' ? <Users className="size-3.5 shrink-0" aria-label="Compartilhado" /> : null}
                  <span className="truncate text-fg">{firstName}</span>
                </>
              ) : null}
            </span>
            <span className="block truncate text-caption">{payment ?? '—'}</span>
          </span>
          <span className="text-right">{amount}</span>
        </div>
      ) : null}
    </>
  )

  return (
    <li className="border-t border-divider first:border-t-0">
      {editable ? (
        <button
          type="button"
          onClick={onOpen}
          className="w-full rounded-[12px] px-3 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted"
          aria-label={`Editar ${tx.description}, ${formatMoney(tx.amountCents)}`}
        >
          {content}
        </button>
      ) : (
        <div className="px-3 py-3" title={`Pessoal de ${firstName} — só ${firstName} pode editar`}>
          {content}
        </div>
      )}
    </li>
  )
}
