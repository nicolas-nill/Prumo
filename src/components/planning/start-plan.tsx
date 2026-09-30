'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Copy, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { MoneyInput } from '@/components/ui/money-input'
import { monthName } from '@/domain/dates'
import { copyPreviousPlanAction, startPlanAction } from '@/features/planning/actions'

export function StartPlan({ month, previousMonth, hasPrevious, suggestedIncomeCents }: { month: string; previousMonth: string; hasPrevious: boolean; suggestedIncomeCents: number }) {
  const [income, setIncome] = useState<number | null>(suggestedIncomeCents || null)
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>) =>
    start(async () => {
      const result = await fn()
      if (!result.ok) toast.error(result.error?.message ?? 'Não foi possível criar o plano.')
    })

  return (
    <div className="rounded-[18px] border border-border bg-surface p-6 sm:p-8">
      <h2 className="text-section-title">Ainda não há plano para {monthName(month)}</h2>
      <p className="mt-1.5 max-w-xl text-secondary">
        O plano divide a receita entre os grupos. Você pode partir do mês anterior, usar a sugestão 50% Necessidades · 40% Viver · 10% Investimentos — ou definir do seu jeito.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:items-end">
        <Field label="Receita prevista para o mês" hint="Salários e rendas fixas esperadas.">
          <MoneyInput value={income} onValueChange={setIncome} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {hasPrevious ? (
            <Button variant="primary" loading={pending} onClick={() => run(() => copyPreviousPlanAction(month))}>
              <Copy aria-hidden /> Copiar de {monthName(previousMonth)}
            </Button>
          ) : null}
          <Button variant={hasPrevious ? 'secondary' : 'primary'} disabled={pending} onClick={() => run(() => startPlanAction(month, income ?? 0, true))}>
            <Sparkles aria-hidden /> Usar sugestão 50/40/10
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => run(() => startPlanAction(month, income ?? 0, false))}>
            Começar do zero
          </Button>
        </div>
      </div>
    </div>
  )
}
