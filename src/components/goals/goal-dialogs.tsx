'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState, useTransition, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Segmented } from '@/components/ui/segmented'
import { toneSolid } from '@/components/ui/tone'
import { TONES, type Goal } from '@/domain/types'
import { addContributionAction, saveGoalAction } from '@/features/goals/actions'
import { contributionSchema, goalSchema, type ContributionFormValues, type GoalFormValues } from '@/features/goals/schemas'
import { cn } from '@/lib/utils/cn'

const TONE_LABEL: Record<(typeof TONES)[number], string> = { blue: 'Azul', rose: 'Terracota', lilac: 'Violeta', sage: 'Verde', sand: 'Âmbar', slate: 'Grafite' }

export function GoalDialog({ goal, trigger, shared }: { goal?: Goal; trigger: ReactNode; shared: boolean }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const form = useForm<GoalFormValues>({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      id: goal?.id,
      name: goal?.name ?? '',
      targetAmountCents: goal?.targetAmountCents ?? 0,
      targetDate: goal?.targetDate ?? null,
      scope: goal?.scope ?? 'shared',
      tone: goal?.tone ?? 'sage',
      initialAmountCents: 0,
    },
  })
  const { control, register, handleSubmit, formState, setError, reset } = form

  const submit = handleSubmit((values) =>
    start(async () => {
      const result = await saveGoalAction(values)
      if (!result.ok) {
        for (const [k, m] of Object.entries(result.error.fieldErrors ?? {})) setError(k as keyof GoalFormValues, { message: m })
        return void toast.error(result.error.message)
      }
      toast.success(goal ? 'Meta atualizada.' : 'Meta criada.')
      setOpen(false)
      if (!goal) reset()
    }),
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader title={goal ? 'Editar meta' : 'Nova meta'} description={goal ? undefined : 'Reserva de emergência, viagem, notebook, entrada do apartamento…'} />
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogBody className="grid gap-4">
            <Field label="Nome" error={formState.errors.name?.message}>
              <Input {...register('name')} placeholder="Ex.: Viagem para Lisboa" />
            </Field>
            <Field label="Valor alvo" error={formState.errors.targetAmountCents?.message}>
              <Controller control={control} name="targetAmountCents" render={({ field }) => <MoneyInput value={field.value || null} onValueChange={(c) => field.onChange(c ?? 0)} />} />
            </Field>
            {goal ? null : (
              <Field label="Já guardado" optional hint="Quanto você já tem para essa meta.">
                <Controller control={control} name="initialAmountCents" render={({ field }) => <MoneyInput value={field.value || null} onValueChange={(c) => field.onChange(c ?? 0)} />} />
              </Field>
            )}
            <Field label="Prazo" optional error={formState.errors.targetDate?.message}>
              <Controller control={control} name="targetDate" render={({ field }) => <Input type="date" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)} />} />
            </Field>
            {shared ? (
              <Controller
                control={control}
                name="scope"
                render={({ field }) => (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-label">Meta de quem</span>
                    <Segmented label="Meta de quem" size="sm" value={field.value} onChange={field.onChange} options={[{ value: 'shared', label: 'Nossa' }, { value: 'personal', label: 'Minha' }]} />
                  </div>
                )}
              />
            ) : null}
            <Controller
              control={control}
              name="tone"
              render={({ field }) => (
                <fieldset>
                  <legend className="text-label mb-2">Cor</legend>
                  <div className="flex gap-2">
                    {TONES.map((tone) => (
                      <label key={tone} className="cursor-pointer" title={TONE_LABEL[tone]}>
                        <input type="radio" name="tone" value={tone} checked={field.value === tone} onChange={() => field.onChange(tone)} className="peer sr-only" />
                        <span className={cn('block size-7 rounded-full ring-offset-2 ring-offset-surface-elevated peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:outline-2 peer-focus-visible:outline-focus', toneSolid(tone))} />
                        <span className="sr-only">{TONE_LABEL[tone]}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="submit" loading={pending}>
              {goal ? 'Salvar' : 'Criar meta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ContributionDialog({ goal, today, trigger }: { goal: Goal; today: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const form = useForm<ContributionFormValues>({
    resolver: zodResolver(contributionSchema),
    defaultValues: { kind: 'deposit', amountCents: 0, contributedOn: today, note: '' },
  })
  const { control, register, handleSubmit, formState, setError, reset } = form

  const submit = handleSubmit((values) =>
    start(async () => {
      const result = await addContributionAction(goal.id, values)
      if (!result.ok) {
        for (const [k, m] of Object.entries(result.error.fieldErrors ?? {})) setError(k as keyof ContributionFormValues, { message: m })
        return void toast.error(result.error.message)
      }
      toast.success(values.kind === 'deposit' ? 'Aporte registrado.' : 'Retirada registrada.')
      setOpen(false)
      reset()
    }),
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader title={goal.name} description="Registre quanto entrou (ou saiu) desta meta." />
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogBody className="grid gap-4">
            <Controller
              control={control}
              name="kind"
              render={({ field }) => (
                <Segmented label="Tipo" fullWidth value={field.value} onChange={field.onChange} options={[{ value: 'deposit', label: 'Aporte' }, { value: 'withdraw', label: 'Retirada' }]} />
              )}
            />
            <Field label="Valor" error={formState.errors.amountCents?.message}>
              <Controller control={control} name="amountCents" render={({ field }) => <MoneyInput size="lg" autoFocus value={field.value || null} onValueChange={(c) => field.onChange(c ?? 0)} />} />
            </Field>
            <Field label="Data" error={formState.errors.contributedOn?.message}>
              <Input type="date" {...register('contributedOn')} />
            </Field>
            <Field label="Observação" optional>
              <Input {...register('note')} maxLength={140} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" loading={pending}>
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
