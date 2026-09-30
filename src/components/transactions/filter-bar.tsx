'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type ReactNode, useEffect, useRef, useState, useTransition } from 'react'
import { ListFilter, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import type { TransactionReference } from '@/features/transactions/reference'
import { cn } from '@/lib/utils/cn'

const FILTER_KEYS = ['tipo', 'categoria', 'pessoa', 'escopo', 'conta', 'cartao', 'origem', 'ordem', 'de', 'ate'] as const

/** Filters live in the URL (shareable, back-button friendly); the server does the filtering. */
export function FilterBar({ reference, activeCount }: { reference: TransactionReference; activeCount: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState(params.get('busca') ?? '')
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const apply = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    next.delete('pagina')
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const onSearch = (value: string) => {
    setSearch(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => apply({ busca: value.trim() || null }), 300)
  }

  const shared = reference.spaceType === 'shared'
  const fields: Record<string, ReactNode> = {
    tipo: (
      <Field label="Tipo">
        <Select value={params.get('tipo') ?? ''} onChange={(e) => apply({ tipo: e.target.value || null, categoria: null })}>
          <option value="">Receitas e despesas</option>
          <option value="expense">Despesas</option>
          <option value="income">Receitas</option>
        </Select>
      </Field>
    ),
    categoria: (
      <Field label="Categoria">
        <Select value={params.get('categoria') ?? ''} onChange={(e) => apply({ categoria: e.target.value || null })}>
          <option value="">Todas</option>
          <option value="none">Sem categoria</option>
          {reference.categories
            .filter((c) => !params.get('tipo') || c.kind === params.get('tipo'))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isActive ? '' : ' (arquivada)'}
              </option>
            ))}
        </Select>
      </Field>
    ),
    ...(shared
      ? {
          pessoa: (
            <Field label="Pessoa">
              <Select value={params.get('pessoa') ?? ''} onChange={(e) => apply({ pessoa: e.target.value || null })}>
                <option value="">Todos</option>
                {reference.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === reference.viewerId ? `${m.name} (você)` : m.name}
                  </option>
                ))}
              </Select>
            </Field>
          ),
          escopo: (
            <Field label="Escopo">
              <Select value={params.get('escopo') ?? ''} onChange={(e) => apply({ escopo: e.target.value || null })}>
                <option value="">Pessoais e compartilhadas</option>
                <option value="shared">Compartilhadas</option>
                <option value="personal">Pessoais</option>
              </Select>
            </Field>
          ),
        }
      : {}),
    conta: (
      <Field label="Conta">
        <Select value={params.get('conta') ?? ''} onChange={(e) => apply({ conta: e.target.value || null, cartao: null })}>
          <option value="">Todas</option>
          {reference.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
    ),
    cartao: (
      <Field label="Cartão">
        <Select value={params.get('cartao') ?? ''} onChange={(e) => apply({ cartao: e.target.value || null, conta: null })}>
          <option value="">Todos</option>
          {reference.cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
    ),
    origem: (
      <Field label="Origem">
        <Select value={params.get('origem') ?? ''} onChange={(e) => apply({ origem: e.target.value || null })}>
          <option value="">Todas</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="dashboard">Painel</option>
          <option value="recurring">Recorrência</option>
        </Select>
      </Field>
    ),
    ordem: (
      <Field label="Ordenar por">
        <Select value={params.get('ordem') ?? ''} onChange={(e) => apply({ ordem: e.target.value || null })}>
          <option value="">Mais recentes</option>
          <option value="date_asc">Mais antigas</option>
          <option value="amount_desc">Maior valor</option>
          <option value="amount_asc">Menor valor</option>
        </Select>
      </Field>
    ),
  }
  // Wide screens show the everyday filters inline; everything lives in the dialog.
  const inline = ['tipo', 'categoria', shared ? 'pessoa' : 'conta', 'ordem']
  const hiddenActive = FILTER_KEYS.filter((k) => !inline.includes(k) && params.get(k)).length

  const clearAll = () => {
    setSearch('')
    apply(Object.fromEntries([...FILTER_KEYS, 'busca'].map((k) => [k, null])))
  }

  return (
    <div className={cn('flex flex-col gap-3 transition-opacity', pending && 'opacity-70')}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por descrição ou estabelecimento"
            aria-label="Buscar movimentações"
            className="pl-9"
          />
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)} aria-label={`Filtros${activeCount ? ` (${activeCount} ativos)` : ''}`}>
          <ListFilter aria-hidden />
          <span className="hidden sm:inline">Filtros</span>
          {activeCount ? <FilterCount count={activeCount} className="xl:hidden" /> : null}
          {hiddenActive ? <FilterCount count={hiddenActive} className="max-xl:hidden" /> : null}
        </Button>
        {activeCount ? (
          <Button variant="ghost" onClick={clearAll} className="hidden sm:inline-flex">
            <X aria-hidden /> Limpar
          </Button>
        ) : null}
      </div>
      <div className="hidden grid-cols-4 gap-3 xl:grid [&_label]:text-caption">
        {inline.map((key) => (
          <div key={key}>{fields[key]}</div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader title="Filtros" />
          <DialogBody className="grid gap-4">
            {Object.entries(fields).map(([key, node]) => (
              <div key={key}>{node}</div>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={clearAll}>
              Limpar filtros
            </Button>
            <Button onClick={() => setOpen(false)}>Ver resultados</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilterCount({ count, className }: { count: number; className?: string }) {
  return <span className={cn('inline-flex size-5 items-center justify-center rounded-full bg-primary text-[0.6875rem] text-primary-fg', className)}>{count}</span>
}
