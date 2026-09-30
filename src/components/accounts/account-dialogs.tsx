'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState, useTransition, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { SwitchField } from '@/components/ui/switch'
import { toneSolid } from '@/components/ui/tone'
import { TONES, type Account, type Card } from '@/domain/types'
import { saveAccountAction, saveCardAction } from '@/features/accounts/actions'
import { ACCOUNT_TYPE_LABEL, accountSchema, cardSchema, type AccountFormValues, type CardFormValues } from '@/features/accounts/schemas'
import { cn } from '@/lib/utils/cn'

type Members = { id: string; name: string }[]

export function AccountDialog({ account, members, trigger }: { account?: Account; members: Members; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      id: account?.id,
      name: account?.name ?? '',
      type: account?.type ?? 'checking',
      openingBalanceCents: account?.openingBalanceCents ?? 0,
      ownerId: account?.ownerId ?? null,
      isActive: account?.isActive ?? true,
    },
  })
  const { control, register, handleSubmit, formState, reset } = form
  const submit = handleSubmit((values) =>
    start(async () => {
      const result = await saveAccountAction(values)
      if (!result.ok) return void toast.error(result.error.message)
      toast.success(account ? 'Conta atualizada.' : 'Conta criada.')
      setOpen(false)
      if (!account) reset()
    }),
  )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader title={account ? 'Editar conta' : 'Nova conta'} description="Sem conexão bancária: serve para organizar de onde sai e onde entra o dinheiro." />
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogBody className="grid gap-4">
            <Field label="Nome" error={formState.errors.name?.message}>
              <Input {...register('name')} placeholder="Ex.: Conta conjunta" />
            </Field>
            <Field label="Tipo">
              <Select {...register('type')}>
                {Object.entries(ACCOUNT_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Saldo inicial" optional hint="Ponto de partida para acompanhar o saldo.">
              <Controller control={control} name="openingBalanceCents" render={({ field }) => <MoneyInput value={field.value} onValueChange={(c) => field.onChange(c ?? 0)} />} />
            </Field>
            {members.length > 1 ? (
              <Field label="Titular">
                <Controller
                  control={control}
                  name="ownerId"
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)}>
                      <option value="">Compartilhada</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </Field>
            ) : null}
            {account ? (
              <Controller control={control} name="isActive" render={({ field }) => <SwitchField checked={field.value} onCheckedChange={field.onChange} label="Ativa" description="Contas inativas somem das opções, mas o histórico continua." />} />
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="submit" loading={pending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CardDialog({ card, members, trigger, viewerId }: { card?: Card; members: Members; trigger: ReactNode; viewerId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const form = useForm<CardFormValues>({
    resolver: zodResolver(cardSchema),
    defaultValues: {
      id: card?.id,
      name: card?.name ?? '',
      lastFour: card?.lastFour ?? '',
      closingDay: card?.closingDay ?? 25,
      dueDay: card?.dueDay ?? 5,
      limitCents: card?.limitCents ?? null,
      holderId: card?.holderId ?? viewerId,
      tone: card?.tone ?? 'slate',
      isActive: card?.isActive ?? true,
    },
  })
  const { control, register, handleSubmit, formState, reset } = form
  const errors = formState.errors
  const submit = handleSubmit((values) =>
    start(async () => {
      const result = await saveCardAction(values)
      if (!result.ok) return void toast.error(result.error.message)
      toast.success(card ? 'Cartão atualizado.' : 'Cartão cadastrado.')
      setOpen(false)
      if (!card) reset()
    }),
  )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader title={card ? 'Editar cartão' : 'Novo cartão'} description="Guardamos só o apelido e os 4 últimos dígitos — nunca o número completo." />
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogBody className="grid grid-cols-2 gap-4">
            <Field label="Nome" error={errors.name?.message} className="col-span-2">
              <Input {...register('name')} placeholder="Ex.: Nubank" />
            </Field>
            <Field label="Final" optional error={errors.lastFour?.message}>
              <Input {...register('lastFour')} inputMode="numeric" maxLength={4} placeholder="1234" autoComplete="off" />
            </Field>
            <Field label="Limite" optional>
              <Controller control={control} name="limitCents" render={({ field }) => <MoneyInput value={field.value} onValueChange={field.onChange} />} />
            </Field>
            <Field label="Dia do fechamento" error={errors.closingDay?.message}>
              <Input type="number" min={1} max={31} {...register('closingDay', { valueAsNumber: true })} />
            </Field>
            <Field label="Dia do vencimento" error={errors.dueDay?.message}>
              <Input type="number" min={1} max={31} {...register('dueDay', { valueAsNumber: true })} />
            </Field>
            {members.length > 1 ? (
              <Field label="Titular" className="col-span-2">
                <Controller
                  control={control}
                  name="holderId"
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)}>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </Field>
            ) : null}
            <Controller
              control={control}
              name="tone"
              render={({ field }) => (
                <fieldset className="col-span-2">
                  <legend className="text-label mb-2">Cor</legend>
                  <div className="flex gap-2">
                    {TONES.map((tone) => (
                      <label key={tone} className="cursor-pointer">
                        <input type="radio" value={tone} checked={field.value === tone} onChange={() => field.onChange(tone)} className="peer sr-only" />
                        <span className={cn('block size-7 rounded-full ring-offset-2 ring-offset-surface-elevated peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:outline-2 peer-focus-visible:outline-focus', toneSolid(tone))} />
                        <span className="sr-only">{tone}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            />
            {card ? (
              <Controller control={control} name="isActive" render={({ field }) => <SwitchField className="col-span-2" checked={field.value} onCheckedChange={field.onChange} label="Ativo" />} />
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="submit" loading={pending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
