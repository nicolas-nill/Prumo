'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { Image as ImageIcon, Mic, Paperclip, SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Badge, Panel } from '@/components/ui/misc'
import { simulateWhatsAppAction, type SimulatorResult } from '@/features/whatsapp/simulator-actions'
import { cn } from '@/lib/utils/cn'

interface Sender {
  phone: string
  label: string
}

interface ChatItem {
  id: string
  from: 'user' | 'bot'
  body: string
  meta?: string
  buttons?: { id: string; title: string }[]
  waMessageId?: string
}

const EXAMPLES = ['Gastei 47,90 no almoço', 'Paguei 320 no mercado hoje', 'gastei 50 ontem', 'Na verdade foram 42', 'comprei uma TV de 4.800 em 12x no cartão Nubank', 'Quanto ainda posso gastar?', 'apaga o último']

export function WhatsAppSimulator({ senders, receipts, realAi }: { senders: Sender[]; receipts: { id: string; label: string }[]; realAi: boolean }) {
  const [from, setFrom] = useState(senders[0]?.phone ?? '')
  const [customFrom, setCustomFrom] = useState('')
  const [text, setText] = useState('')
  const [chat, setChat] = useState<ChatItem[]>([])
  const [last, setLast] = useState<SimulatorResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [mode, setMode] = useState<'text' | 'audio' | 'image'>('text')
  const [receipt, setReceipt] = useState(receipts[0]?.id ?? '')
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const counter = useRef(0)
  const nid = () => `m-${(counter.current += 1)}`
  const sender = from === 'custom' ? customFrom.replace(/\D/g, '') : from

  const push = (items: ChatItem[]) => {
    setChat((c) => [...c, ...items])
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }))
  }

  const send = (fields: Record<string, string | Blob>, userBubble: ChatItem) => {
    if (!sender) return setError('Escolha quem está enviando.')
    setError(null)
    push([userBubble])
    const form = new FormData()
    form.set('from', sender)
    for (const [k, v] of Object.entries(fields)) form.set(k, v)
    start(async () => {
      const result = await simulateWhatsAppAction(form)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setLast(result.data)
      push(
        result.data.replies.length
          ? result.data.replies.map((r) => ({ id: r.waMessageId, from: 'bot' as const, body: r.body, buttons: r.buttons, waMessageId: r.waMessageId }))
          : [{ id: nid(), from: 'bot', body: '(sem resposta — mensagem duplicada ou ignorada)', meta: result.data.status }],
      )
    })
  }

  const submit = () => {
    if (mode === 'text') {
      if (!text.trim()) return
      send({ kind: 'text', text }, { id: nid(), from: 'user', body: text })
    } else if (mode === 'audio') {
      if (!text.trim()) return
      send({ kind: 'audio_fixture', text }, { id: nid(), from: 'user', body: `Áudio: “${text}”`, meta: 'áudio simulado (transcrição de exemplo)' })
    } else {
      send({ kind: 'image_fixture', fixtureId: receipt, text }, { id: nid(), from: 'user', body: `Foto: ${receipts.find((r) => r.id === receipt)?.label}`, meta: 'comprovante de exemplo' })
    }
    setText('')
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
      <Panel className="flex h-[640px] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-divider px-4 py-3">
          <span className="text-label">Enviar como</span>
          <div className="w-56">
            <Select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Remetente">
              {senders.map((s) => (
                <option key={s.phone} value={s.phone}>
                  {s.label}
                </option>
              ))}
              <option value="custom">Outro número…</option>
            </Select>
          </div>
          {from === 'custom' ? <Input className="w-44" placeholder="5511999998888" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Número" inputMode="numeric" /> : null}
        </div>

        <div ref={scrollRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto bg-chat-canvas px-4 py-5" aria-live="polite">
          {chat.length === 0 ? (
            <div className="m-auto max-w-sm text-center text-sm text-fg-muted">
              <p className="font-medium text-fg">Mande uma mensagem como se fosse pelo WhatsApp.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-fg hover:border-border-strong">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {chat.map((item) => (
            <div key={item.id} className={cn('max-w-[82%] rounded-[16px] px-3.5 py-2.5 text-[0.9375rem] shadow-xs', item.from === 'user' ? 'self-end rounded-br-[6px] bg-chat-out text-chat-out-fg' : 'self-start rounded-bl-[6px] bg-chat-in text-chat-in-fg')}>
              <p className="whitespace-pre-line">{item.body}</p>
              {item.meta ? <p className="mt-1 text-[0.6875rem] text-chat-meta">{item.meta}</p> : null}
              {item.buttons?.length ? (
                <div className="mt-2.5 flex flex-col gap-1 border-t border-divider pt-2">
                  {item.buttons.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      disabled={pending}
                      onClick={() => send({ kind: 'button', buttonId: b.id, text: b.title }, { id: nid(), from: 'user', body: b.title, meta: 'resposta de botão' })}
                      className="rounded-[10px] py-1.5 text-sm font-medium text-accent hover:bg-surface-muted"
                    >
                      {b.title}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {pending ? <p className="self-start text-caption">processando…</p> : null}
        </div>

        <form
          className="flex flex-col gap-2 border-t border-divider px-3 py-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="flex gap-1">
            {(
              [
                ['text', 'Texto', SendHorizontal],
                ['audio', 'Áudio', Mic],
                ['image', 'Foto', ImageIcon],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-fg-muted', mode === value && 'bg-surface-muted text-fg')}
              >
                <Icon className="size-3.5" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {mode === 'image' ? (
              <Select value={receipt} onChange={(e) => setReceipt(e.target.value)} aria-label="Comprovante de exemplo">
                {receipts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === 'audio' ? 'O que foi dito no áudio…' : 'Mensagem'} aria-label="Mensagem" autoFocus />
            )}
            <Button type="submit" loading={pending} aria-label="Enviar">
              <SendHorizontal aria-hidden />
            </Button>
            {realAi ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="audio/*,image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) send({ kind: 'file', file }, { id: nid(), from: 'user', body: `${file.type.startsWith('audio') ? 'Áudio' : 'Foto'}: ${file.name}`, meta: 'arquivo real → OpenAI' })
                    e.target.value = ''
                  }}
                />
                <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} aria-label="Enviar arquivo real">
                  <Paperclip aria-hidden />
                </Button>
              </>
            ) : null}
          </div>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        </form>
      </Panel>

      <Panel className="h-fit px-5 py-5">
        <p className="text-eyebrow">Pipeline</p>
        <h2 className="mt-1 text-section-title">Última mensagem</h2>
        {last ? (
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">Status</dt>
              <dd>
                <Badge tone={last.status === 'processed' ? 'success' : last.status === 'failed' ? 'danger' : last.status === 'needs_confirmation' ? 'warning' : 'neutral'}>{last.status}</Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">Interpretação</dt>
              <dd>{last.source === 'ai' ? `IA (${last.provider})` : last.source === 'rules' ? 'regras (sem custo)' : '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">Transações</dt>
              <dd className="tabular">{last.transactionIds.length}</dd>
            </div>
            <div>
              <dt className="mb-1 text-fg-muted">Intenção estruturada</dt>
              <dd>
                <pre className="max-h-64 overflow-auto rounded-[10px] bg-surface-muted p-3 font-mono text-[0.75rem] leading-relaxed">{JSON.stringify(last.intent, null, 2) ?? 'null'}</pre>
              </dd>
            </div>
            <div className="text-caption">wamid: {last.waMessageId}</div>
            {last.transactionIds.length ? (
              <Link href="/movimentacoes?origem=whatsapp" className="text-sm font-medium text-accent hover:underline">
                Ver em Movimentações
              </Link>
            ) : null}
          </dl>
        ) : (
          <p className="mt-3 text-secondary">Envie uma mensagem para ver status, intenção e transação criada.</p>
        )}
        <div className="mt-6 border-t border-divider pt-4 text-caption leading-relaxed">
          Mesmo fluxo do webhook real: payload no formato da Meta → normalização → deduplicação → identidade → interpretação → registro → resposta. Só o envio é capturado aqui em vez de ir para a Meta.
          {realAi ? ' IA real (OpenAI) configurada.' : ' Sem chave OpenAI: texto usa o interpretador por regras; áudio e foto usam exemplos determinísticos.'}
        </div>
      </Panel>
    </div>
  )
}
