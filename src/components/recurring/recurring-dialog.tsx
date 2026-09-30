'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState, useTransition, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Trash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Segmented } from '@/components/ui/segmented'
import { SwitchField } from '@/components/ui/switch'
import type { RecurringRule } from '@/domain/types'
import { deleteRecurringAction, saveRecurringAction } from '@/features/recurring/actions'
import { recurringFormSchema, type RecurringFormValues } from '@/features/recurring/schemas'
import type { TransactionReference } from '@/features/transactions/reference'

export function RecurringDialog({ reference: ref, rule, trigger }: { reference: TransactionReference; rule?: RecurringRule; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {open ? <Body reference={ref} rule={rule} onDone={() => setOpen(false)} /> : null}
    </Dialog>
  )
}

function Body({ reference: ref, rule, onDone }: { reference: TransactionReference; rule?: RecurringRule; onDone: () => void }) {
  const [pending, start] = useTransition()
  const form = useForm<RecurringFormValues>({
    resolver: zodResolver(recurringFormSchema),
    defaultValues: {
      id: rule?.id,
      type: rule?.type ?? 'expense',
      description: rule?.description ?? '',
      amountCents: rule?.amountCents ?? 0,
      categoryId: rule?.categoryId ?? null,
      paymentKind: rule?.cardId ? 'card' : rule?.accountId ? 'account' : ref.accounts.length ? 'account' : 'none',
      accountId: rule?.accountId ?? ref.accounts.find((a) => a.isActive)?.id ?? null,
      cardId: rule?.cardId ?? null,
      memberId: rule?.memberId ?? ref.viewerId,
      scope: rule?.scope ?? (ref.spaceType === 'shared' ? 'shared' : 'personal'),
      frequency: rule?.frequency ?? 'monthly',
      interval: rule?.interval ?? 1,
      nextOccurrenceOn: rule?.nextOccurrenceOn ?? ref.today,
      endOn: rule?.endOn ?? null,
      isActive: rule?.isActive ?? true,
    },
  })
  const { control, register, handleSubmit, setValue, setError, formState } = form
  const [type, paymentKind] = useWatch({ control, name: ['type', 'paymentKind'] })
  const errors = formState.errors

  const submit = handleSubmit((values) =>
    start(async () => {
      const result = await saveRecurringAction(values)
      if (!result.ok) {
        for (const [k, m] of Object.entries(result.error.fieldErrors ?? {})) setError(k as keyof RecurringFormValues, { message: m })
        toast.error(result.error.message)
        return
      }
      toast.success(rule ? 'Recorrência atualizada.' : 'Recorrência criada.')
      onDone()
    }),
  )

  return (
    <DialogContent>
      <DialogHeader title={rule ? 'Editar recorrência' : 'Nova recorrência'} description="Aluguel, salário, academia, assinaturas… O PRUMO lança sozinho em cada vencimento." />
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
        <DialogBody className="grid gap-4">
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Segmented
                label="Tipo"
                fullWidth
                value={field.value}
                onChange={(v) => {
                  field.onChange(v)
                  setValue('categoryId', null)
                  if (v === 'income' && paymentKind === 'card') setValue('paymentKind', 'account')
                }}
                options={[
                  { value: 'expense', label: 'Despesa' },
                  { value: 'income', label: 'Receita' },
                ]}
              />
            )}
          />
          <Field label="Descrição" error={errors.description?.message}>
            <Input {...register('description')} placeholder="Ex.: Aluguel" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor" error={errors.amountCents?.message}>
              <Controller control={control} name="amountCents" render={({ field }) => <MoneyInput value={field.value || null} onValueChange={(c) => field.onChange(c ?? 0)} />} />
            </Field>
            <Field label="Categoria" error={errors.categoryId?.message}>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)}>
                    <option value="">Sem categoria</option>
                    {ref.categories
                      .filter((c) => c.kind === type && c.isActive)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </Select>
                )}
              />
            </Field>
            <Field label="Frequência">
              <Controller
                control={control}
                name="frequency"
                render={({ field }) => (
                  <Select value={field.value} onChange={(e) => field.onChange(e.target.value)}>
                    <option value="monthly">Mensal</option>
                    <option value="weekly">Semanal</option>
                    <option value="yearly">Anual</option>
                  </Select>
                )}
              />
            </Field>
            <Field label="Próximo lançamento" error={errors.nextOccurrenceOn?.message}>
              <Input type="date" {...register('nextOccurrenceOn')} />
            </Field>
            <Field label={type === 'income' ? 'Recebido em' : 'Pago com'} error={errors.paymentKind?.message}>
              <Controller
                control={control}
                name="paymentKind"
                render={({ field }) => (
                  <Select value={field.value} onChange={(e) => field.onChange(e.target.value)}>
                    <option value="account">Conta</option>
                    {type === 'expense' ? <option value="card">Cartão</option> : null}
                    <option value="none">Não informar</option>
                  </Select>
                )}
              />
            </Field>
            {paymentKind === 'account' ? (
              <Field label="Conta">
                <Controller
                  control={control}
                  name="accountId"
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)}>
                      {ref.accounts.filter((a) => a.isActive).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </Field>
            ) : paymentKind === 'card' ? (
              <Field label="Cartão">
                <Controller
                  control={control}
                  name="cardId"
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)}>
                      <option value="">Escolha</option>
                      {ref.cards.filter((c) => c.isActive).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </Field>
            ) : (
              <span className="hidden sm:block" />
            )}
            {ref.spaceType === 'shared' ? (
              <>
                <Field label="De quem é">
                  <Controller
                    control={control}
                    name="scope"
                    render={({ field }) => (
                      <Select value={field.value} onChange={(e) => field.onChange(e.target.value)}>
                        <option value="shared">Compartilhada</option>
                        <option value="personal">Pessoal</option>
                      </Select>
                    )}
                  />
                </Field>
                <Field label="Responsável">
                  <Select {...register('memberId')}>
                    {ref.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            ) : null}
            <Field label="Termina em" optional error={errors.endOn?.message}>
              <Controller control={control} name="endOn" render={({ field }) => <Input type="date" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)} />} />
            </Field>
          </div>
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <SwitchField checked={field.value} onCheckedChange={field.onChange} label="Ativa" description="Pausar mantém o histórico e para os próximos lançamentos." />
            )}
          />
        </DialogBody>
        <DialogFooter className="sm:justify-between">
          {rule ? (
            <Button
              variant="ghost"
              className="text-danger hover:text-danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await deleteRecurringAction(rule.id)
                  if (result.ok) {
                    toast.success('Recorrência removida. Lançamentos anteriores continuam no histórico.')
                    onDone()
                  } else toast.error(result.error.message)
                })
              }
            >
              <Trash aria-hidden /> Remover
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" loading={pending}>
            Salvar
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
