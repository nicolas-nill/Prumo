'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Check, Copy, MessageCircle, User, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { CategoryIcon } from '@/components/ui/category-icon'
import { toneSolid } from '@/components/ui/tone'
import { CATALOG_GROUPS, SELECTABLE_EXPENSE_CATEGORIES } from '@/domain/catalog'
import { applyBasisPoints, formatMoney } from '@/domain/money'
import { createInvitationAction } from '@/features/couples/actions'
import { completeOnboardingAction } from '@/features/onboarding/actions'
import { cn } from '@/lib/utils/cn'

type Step = 'name' | 'usage' | 'income' | 'plan' | 'categories' | 'invite' | 'done'

interface State {
  fullName: string
  spaceType: 'personal' | 'shared'
  spaceName: string
  expectedIncomeCents: number | null
  planMode: 'preset' | 'custom'
  percents: { essentials: number; lifestyle: number; savings: number }
  categoryKeys: string[]
  partnerEmail: string
}

function OptionCard({ selected, onSelect, icon, title, text }: { selected: boolean; onSelect: () => void; icon: ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-4 rounded-[16px] border bg-surface p-5 text-left transition-[border-color,box-shadow] duration-150',
        selected ? 'border-accent shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-border hover:border-border-strong',
      )}
    >
      <span className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-full', selected ? 'bg-accent text-white dark:text-bg' : 'bg-surface-muted text-fg-muted')}>{icon}</span>
      <span className="flex-1">
        <span className="block text-card-title">{title}</span>
        <span className="mt-0.5 block text-secondary">{text}</span>
      </span>
      <span aria-hidden className={cn('mt-1 inline-flex size-5 items-center justify-center rounded-full border', selected ? 'border-accent bg-accent text-white dark:text-bg' : 'border-border-strong')}>
        {selected ? <Check className="size-3" /> : null}
      </span>
    </button>
  )
}

export function OnboardingWizard({ initialName }: { initialName: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [step, setStep] = useState<Step>('name')
  const [error, setError] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [s, setS] = useState<State>({
    fullName: initialName,
    spaceType: 'personal',
    spaceName: '',
    expectedIncomeCents: null,
    planMode: 'preset',
    percents: { essentials: 5000, lifestyle: 4000, savings: 1000 },
    categoryKeys: SELECTABLE_EXPENSE_CATEGORIES.filter((c) => c.defaultOn).map((c) => c.key),
    partnerEmail: '',
  })
  const set = (patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch }))

  const firstName = s.fullName.trim().split(' ')[0] || 'Você'
  const steps: Step[] = ['name', 'usage', 'income', 'plan', 'categories', ...(s.spaceType === 'shared' ? (['invite'] as Step[]) : [])]
  const index = steps.indexOf(step)
  const percentSum = s.percents.essentials + s.percents.lifestyle + s.percents.savings

  const go = (next: Step) => {
    setError(null)
    setStep(next)
  }

  const finish = () =>
    start(async () => {
      setError(null)
      const result = await completeOnboardingAction({
        fullName: s.fullName,
        spaceType: s.spaceType,
        spaceName: s.spaceName.trim() || (s.spaceType === 'shared' ? `${firstName} & parceria` : `Finanças de ${firstName}`),
        expectedIncomeCents: s.expectedIncomeCents ?? 0,
        planMode: s.expectedIncomeCents ? s.planMode : 'skip',
        groupPercents: s.percents,
        categoryKeys: s.categoryKeys,
      })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      if (s.spaceType === 'shared' && s.partnerEmail.trim()) {
        const invite = await createInvitationAction({ email: s.partnerEmail, role: 'admin' })
        if (invite.ok) {
          setInviteUrl(invite.data.url)
          setStep('done')
          return
        }
        toast.error(`Espaço criado, mas o convite falhou: ${invite.error.message} Você pode convidar depois em Espaço.`)
      }
      router.push('/visao-geral')
      router.refresh()
    })

  const next = () => {
    if (step === 'name') {
      if (!s.fullName.trim()) return setError('Como podemos te chamar?')
      return go('usage')
    }
    if (step === 'usage') return go('income')
    if (step === 'income') return go(s.expectedIncomeCents ? 'plan' : 'categories')
    if (step === 'plan') {
      if (s.planMode === 'custom' && percentSum > 10_000) return setError('A soma passa de 100%. Ajuste os percentuais.')
      return go('categories')
    }
    if (step === 'categories') return s.spaceType === 'shared' ? go('invite') : finish()
    if (step === 'invite') return finish()
  }

  if (step === 'done' && inviteUrl) {
    const message = `Criei nosso espaço no PRUMO para organizarmos as finanças juntos. Entre por aqui: ${inviteUrl}`
    return (
      <div>
        <h1 className="text-page-title">Tudo pronto, {firstName}.</h1>
        <p className="mt-2 text-secondary">Envie o convite para {s.partnerEmail}. Ele vale por 7 dias e só funciona com esse e-mail.</p>
        <div className="mt-6 rounded-[12px] border border-border bg-surface-muted p-3">
          <p className="break-all font-mono text-[0.8125rem] select-all">{inviteUrl}</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(inviteUrl).catch(() => null)
              setCopied(true)
            }}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? 'Copiado' : 'Copiar link'}
          </Button>
          <Button variant="secondary" asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer noopener">
              <MessageCircle aria-hidden /> Enviar pelo WhatsApp
            </a>
          </Button>
        </div>
        <Button size="lg" className="mt-10 w-full" onClick={() => (router.push('/visao-geral'), router.refresh())}>
          Ir para o painel
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        {index > 0 ? (
          <button type="button" onClick={() => go(steps[index - 1]!)} className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label="Voltar">
            <ArrowLeft className="size-4" />
          </button>
        ) : null}
        <div className="flex-1">
          <p className="text-caption" aria-live="polite">
            Etapa {index + 1} de {steps.length}
          </p>
          <div className="mt-1.5 flex gap-1" aria-hidden>
            {steps.map((st, i) => (
              <span key={st} className={cn('h-1 flex-1 rounded-full transition-colors duration-300', i <= index ? 'bg-accent' : 'bg-track')} />
            ))}
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          next()
        }}
        noValidate
      >
        {step === 'name' ? (
          <>
            <h1 className="text-page-title">Boas-vindas ao PRUMO</h1>
            <p className="mt-2 text-secondary">Vamos deixar tudo pronto em menos de um minuto.</p>
            <Field label="Como podemos te chamar?" className="mt-8" error={error ?? undefined}>
              <Input value={s.fullName} onChange={(e) => set({ fullName: e.target.value })} autoFocus autoComplete="name" maxLength={120} />
            </Field>
          </>
        ) : null}

        {step === 'usage' ? (
          <>
            <h1 className="text-page-title">Como você vai usar, {firstName}?</h1>
            <p className="mt-2 text-secondary">Dá para mudar depois — inclusive convidar alguém mais tarde.</p>
            <div role="radiogroup" aria-label="Uso" className="mt-8 flex flex-col gap-3">
              <OptionCard selected={s.spaceType === 'personal'} onSelect={() => set({ spaceType: 'personal' })} icon={<User className="size-5" />} title="Só para mim" text="Minhas finanças, meu planejamento." />
              <OptionCard selected={s.spaceType === 'shared'} onSelect={() => set({ spaceType: 'shared' })} icon={<Users className="size-5" />} title="Com outra pessoa" text="Um espaço do casal: gastos compartilhados, com o pessoal continuando pessoal." />
            </div>
            <Field label="Nome do espaço" optional className="mt-6">
              <Input
                value={s.spaceName}
                onChange={(e) => set({ spaceName: e.target.value })}
                placeholder={s.spaceType === 'shared' ? `Ex.: ${firstName} & Ana` : `Finanças de ${firstName}`}
                maxLength={80}
              />
            </Field>
          </>
        ) : null}

        {step === 'income' ? (
          <>
            <h1 className="text-page-title">Quanto entra por mês, mais ou menos?</h1>
            <p className="mt-2 text-secondary">{s.spaceType === 'shared' ? 'Somando a renda de vocês.' : 'Salário e rendas fixas.'} É só uma estimativa para o planejamento — nada é compartilhado.</p>
            <Field label="Receita mensal aproximada" className="mt-8">
              <MoneyInput size="lg" value={s.expectedIncomeCents} onValueChange={(c) => set({ expectedIncomeCents: c })} autoFocus />
            </Field>
            <button type="button" onClick={() => (set({ expectedIncomeCents: null }), go('categories'))} className="mt-4 text-sm font-medium text-fg-muted hover:text-fg">
              Prefiro pular por enquanto
            </button>
          </>
        ) : null}

        {step === 'plan' ? (
          <>
            <h1 className="text-page-title">Como dividir a renda?</h1>
            <p className="mt-2 text-secondary">Uma sugestão para começar. O plano é seu e muda quando quiser.</p>
            <div role="radiogroup" aria-label="Forma de planejamento" className="mt-8 flex flex-col gap-3">
              <OptionCard
                selected={s.planMode === 'preset'}
                onSelect={() => set({ planMode: 'preset', percents: { essentials: 5000, lifestyle: 4000, savings: 1000 } })}
                icon={<Check className="size-5" />}
                title="Usar a sugestão"
                text="50% Necessidades · 40% Viver · 10% Investimentos"
              />
              <OptionCard selected={s.planMode === 'custom'} onSelect={() => set({ planMode: 'custom' })} icon={<span className="text-sm font-semibold">%</span>} title="Definir do meu jeito" text="Escolha os percentuais agora." />
            </div>
            <ul className="mt-6 flex flex-col gap-4 rounded-[16px] border border-border bg-surface p-5">
              {CATALOG_GROUPS.map((g) => {
                const bp = s.percents[g.key]
                return (
                  <li key={g.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span aria-hidden className={cn('size-2.5 rounded-full', toneSolid(g.tone))} />
                      {g.name}
                    </span>
                    <span className="text-money text-sm">{formatMoney(applyBasisPoints(s.expectedIncomeCents ?? 0, bp), { hideCents: true })}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={bp / 100}
                      disabled={s.planMode !== 'custom'}
                      onChange={(e) => set({ percents: { ...s.percents, [g.key]: Number(e.target.value) * 100 } })}
                      aria-label={`Percentual para ${g.name}`}
                      className="col-span-2 accent-[var(--accent)] disabled:opacity-60"
                    />
                    <span className="col-span-2 -mt-1 text-caption tabular">{bp / 100}% da renda</span>
                  </li>
                )
              })}
              <li className={cn('flex justify-between border-t border-divider pt-3 text-sm', percentSum > 10_000 ? 'text-danger' : 'text-fg-muted')}>
                <span>Total</span>
                <span className="tabular">{percentSum / 100}%{percentSum < 10_000 ? ` · ${(10_000 - percentSum) / 100}% livre` : ''}</span>
              </li>
            </ul>
            {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
          </>
        ) : null}

        {step === 'categories' ? (
          <>
            <h1 className="text-page-title">Com o que vocês costumam gastar?</h1>
            <p className="mt-2 text-secondary">Deixamos as categorias mais comuns marcadas. Dá para criar e renomear depois.</p>
            <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Categorias">
              {SELECTABLE_EXPENSE_CATEGORIES.map((c) => {
                const on = s.categoryKeys.includes(c.key)
                const tone = CATALOG_GROUPS.find((g) => g.key === c.group)?.tone ?? 'slate'
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ categoryKeys: on ? s.categoryKeys.filter((k) => k !== c.key) : [...s.categoryKeys, c.key] })}
                    className={cn(
                      'inline-flex h-10 items-center gap-2 rounded-full border pr-4 pl-1.5 text-sm font-medium transition-colors',
                      on ? 'border-accent bg-accent-soft text-fg' : 'border-border bg-surface text-fg-muted hover:text-fg',
                    )}
                  >
                    <CategoryIcon icon={c.icon} tone={tone} size="sm" />
                    {c.name}
                  </button>
                )
              })}
            </div>
            <p className="mt-4 text-caption">Receitas, Investimentos e Outros são criados sempre.</p>
            {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
          </>
        ) : null}

        {step === 'invite' ? (
          <>
            <h1 className="text-page-title">Quem vai dividir com você?</h1>
            <p className="mt-2 text-secondary">Geramos um link de convite para você enviar. A pessoa entra com a própria conta.</p>
            <Field label="E-mail da outra pessoa" optional className="mt-8">
              <Input type="email" value={s.partnerEmail} onChange={(e) => set({ partnerEmail: e.target.value })} inputMode="email" autoComplete="off" />
            </Field>
            {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
          </>
        ) : null}

        <div className="mt-10 flex flex-col gap-2">
          <Button type="submit" size="lg" loading={pending} className="w-full">
            {step === 'categories' && s.spaceType === 'personal' ? 'Concluir' : step === 'invite' ? (s.partnerEmail.trim() ? 'Concluir e gerar convite' : 'Concluir sem convidar') : 'Continuar'}
          </Button>
        </div>
      </form>
    </div>
  )
}
