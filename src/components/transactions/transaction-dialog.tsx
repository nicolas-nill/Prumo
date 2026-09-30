'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ChevronDown, Copy, Lock, Trash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, Select, Textarea } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Segmented } from '@/components/ui/segmented'
import { SwitchField } from '@/components/ui/switch'
import { addDays } from '@/domain/dates'
import { formatMoney, splitInstallments } from '@/domain/money'
import type { TransactionView } from '@/domain/types'
import { createTransactionAction, deleteTransactionAction, updateTransactionAction } from '@/features/transactions/actions'
import type { TransactionReference } from '@/features/transactions/reference'
import { transactionFormSchema, type TransactionFormValues } from '@/features/transactions/schemas'
import { cn } from '@/lib/utils/cn'

interface TransactionDialogProps {
  reference: TransactionReference
  trigger?: ReactNode
  /** Editing an existing transaction. */
  transaction?: TransactionView | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaults?: Partial<TransactionFormValues>
}

function initialValues(ref: TransactionReference, tx?: TransactionView | null, defaults?: Partial<TransactionFormValues>): TransactionFormValues {
  if (tx) {
    return {
      type: tx.type === 'income' ? 'income' : 'expense',
      amountCents: tx.installment ? tx.amountCents : tx.amountCents,
      occurredOn: tx.occurredOn,
      description: tx.description,
      merchant: tx.merchant ?? '',
      notes: tx.notes ?? '',
      categoryId: tx.categoryId,
      paymentKind: tx.cardId ? 'card' : tx.accountId ? 'account' : 'none',
      accountId: tx.accountId,
      cardId: tx.cardId,
      memberId: tx.memberId,
      scope: tx.scope,
      visibility: tx.visibility,
      installments: 1,
    }
  }
  return {
    type: 'expense',
    amountCents: 0,
    occurredOn: ref.today,
    description: '',
    merchant: '',
    notes: '',
    categoryId: null,
    paymentKind: ref.accounts.some((a) => a.isActive) ? 'account' : 'none',
    accountId: ref.accounts.find((a) => a.isActive && (a.ownerId === null || a.ownerId === ref.viewerId))?.id ?? null,
    cardId: null,
    memberId: ref.viewerId,
    scope: ref.spaceType === 'shared' ? 'shared' : 'personal',
    visibility: 'space',
    installments: 1,
    ...defaults,
  }
}

export function TransactionDialog({ reference: ref, trigger, transaction, open: controlledOpen, onOpenChange, defaults }: TransactionDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (value: boolean) => {
    onOpenChange?.(value)
    if (controlledOpen === undefined) setUncontrolledOpen(value)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      {open ? <TransactionFormBody reference={ref} transaction={transaction} defaults={defaults} onDone={() => setOpen(false)} /> : null}
    </Dialog>
  )
}

function TransactionFormBody({ reference: ref, transaction, defaults, onDone }: { reference: TransactionReference; transaction?: TransactionView | null; defaults?: Partial<TransactionFormValues>; onDone: () => void }) {
  const editing = Boolean(transaction)
  const [duplicating, setDuplicating] = useState(false)
  const [pending, startTransition] = useTransition()
  const [showMore, setShowMore] = useState(Boolean(transaction?.notes || transaction?.merchant))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: initialValues(ref, transaction, defaults),
    mode: 'onSubmit',
  })
  const { register, control, handleSubmit, setValue, setError, formState } = form
  const [type, paymentKind, scope, memberId, amountCents, installments, occurredOn] = useWatch({
    control,
    name: ['type', 'paymentKind', 'scope', 'memberId', 'amountCents', 'installments', 'occurredOn'],
  })
  const errors = formState.errors

  const categoriesByGroup = useMemo(() => {
    const active = ref.categories.filter((c) => c.kind === type && (c.isActive || c.id === transaction?.categoryId))
    const groups = ref.groups.map((g) => ({ label: g.name, items: active.filter((c) => c.groupId === g.id) })).filter((g) => g.items.length > 0)
    const ungrouped = active.filter((c) => !c.groupId || !ref.groups.some((g) => g.id === c.groupId))
    return { groups, ungrouped }
  }, [ref, type, transaction?.categoryId])

  const shared = ref.spaceType === 'shared'
  const isMe = memberId === ref.viewerId
  const activeAccounts = ref.accounts.filter((a) => a.isActive || a.id === transaction?.accountId)
  const activeCards = ref.cards.filter((c) => c.isActive || c.id === transaction?.cardId)
  const perInstallment = installments > 1 && amountCents > 0 ? splitInstallments(amountCents, installments)[1] ?? 0 : 0
  const isEdit = editing && !duplicating

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit ? await updateTransactionAction(transaction!.id, values) : await createTransactionAction(values)
      if (!result.ok) {
        if (result.error.fieldErrors) {
          for (const [field, message] of Object.entries(result.error.fieldErrors)) {
            setError(field as keyof TransactionFormValues, { message })
          }
        }
        toast.error(result.error.message)
        return
      }
      const count = result.data && 'count' in result.data ? result.data.count : 1
      toast.success(isEdit ? 'Movimentação atualizada.' : count > 1 ? `Compra registrada em ${count} parcelas.` : 'Movimentação registrada.')
      onDone()
    })
  })

  const onDelete = (whole: boolean) => {
    if (!transaction) return
    startTransition(async () => {
      const result = await deleteTransactionAction(transaction.id, whole)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      toast.success(result.data.count > 1 ? `${result.data.count} parcelas excluídas.` : 'Movimentação excluída.')
      onDone()
    })
  }

  const title = isEdit ? 'Editar movimentação' : duplicating ? 'Duplicar movimentação' : 'Nova movimentação'

  return (
    <DialogContent size="md" aria-describedby={undefined}>
      <DialogHeader title={title} description={isEdit && transaction?.installment ? `Parcela ${transaction.installment.number} de ${transaction.installment.count} — alterações valem só para esta parcela.` : undefined} />
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
        <DialogBody className="flex flex-col gap-5">
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
                  if (v === 'income') setValue('installments', 1)
                }}
                options={[
                  { value: 'expense', label: 'Despesa' },
                  { value: 'income', label: 'Receita' },
                ]}
              />
            )}
          />

          <Field label="Valor" error={errors.amountCents?.message}>
            <Controller
              control={control}
              name="amountCents"
              render={({ field }) => (
                <MoneyInput size="lg" value={field.value || null} onValueChange={(c) => field.onChange(c ?? 0)} autoFocus={!isEdit} aria-label="Valor" />
              )}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Descrição" error={errors.description?.message} className="sm:col-span-2">
              <Input {...register('description')} placeholder={type === 'income' ? 'Ex.: Salário' : 'Ex.: Almoço, mercado, Uber…'} autoComplete="off" maxLength={140} />
            </Field>

            <Field label="Categoria" error={errors.categoryId?.message}>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)}>
                    <option value="">Sem categoria</option>
                    {categoriesByGroup.groups.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.items.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {categoriesByGroup.ungrouped.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              />
            </Field>

            <Field label="Data" error={errors.occurredOn?.message}>
              <Input type="date" {...register('occurredOn')} max="2100-12-31" />
            </Field>
          </div>
          <div className="-mt-3 flex gap-1.5">
            {[
              { label: 'Hoje', value: ref.today },
              { label: 'Ontem', value: addDays(ref.today, -1) },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => setValue('occurredOn', chip.value, { shouldDirty: true })}
                className={cn(
                  'h-7 rounded-full border px-3 text-xs font-medium transition-colors',
                  occurredOn === chip.value ? 'border-accent bg-accent-soft text-accent' : 'border-border text-fg-muted hover:text-fg',
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Payment */}
          <div className="flex flex-col gap-3">
            <Controller
              control={control}
              name="paymentKind"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <span className="text-label">{type === 'income' ? 'Recebido em' : 'Pago com'}</span>
                  <Segmented
                    label={type === 'income' ? 'Recebido em' : 'Pago com'}
                    size="sm"
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v)
                      if (v !== 'card') setValue('installments', 1)
                      if (v === 'card' && !form.getValues('cardId')) setValue('cardId', activeCards[0]?.id ?? null)
                      if (v === 'account' && !form.getValues('accountId')) setValue('accountId', activeAccounts[0]?.id ?? null)
                    }}
                    options={[
                      { value: 'account', label: 'Conta', disabled: activeAccounts.length === 0 },
                      ...(type === 'expense' ? [{ value: 'card' as const, label: 'Cartão', disabled: activeCards.length === 0 }] : []),
                      { value: 'none', label: 'Não informar' },
                    ]}
                  />
                </div>
              )}
            />
            {paymentKind === 'account' ? (
              <Field label="Conta" error={errors.accountId?.message}>
                <Controller
                  control={control}
                  name="accountId"
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)}>
                      {activeAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </Field>
            ) : null}
            {paymentKind === 'card' && type === 'expense' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Cartão" error={errors.cardId?.message}>
                  <Controller
                    control={control}
                    name="cardId"
                    render={({ field }) => (
                      <Select value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)}>
                        {activeCards.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.lastFour ? ` •••• ${c.lastFour}` : ''}
                          </option>
                        ))}
                      </Select>
                    )}
                  />
                </Field>
                {isEdit ? null : (
                  <Field
                    label="Parcelas"
                    error={errors.installments?.message}
                    hint={installments > 1 && perInstallment ? `${installments}x de ${formatMoney(perInstallment)}` : 'À vista'}
                  >
                    <Controller
                      control={control}
                      name="installments"
                      render={({ field }) => (
                        <Select value={String(field.value)} onChange={(e) => field.onChange(Number(e.target.value))}>
                          {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                              {n === 1 ? 'À vista' : `${n}x`}
                            </option>
                          ))}
                        </Select>
                      )}
                    />
                  </Field>
                )}
              </div>
            ) : null}
          </div>

          {/* Couple mode */}
          {shared ? (
            <div className="flex flex-col gap-3 rounded-[14px] bg-surface-muted p-4">
              <Controller
                control={control}
                name="scope"
                render={({ field }) => (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-label">De quem é</span>
                    <Segmented
                      label="De quem é"
                      size="sm"
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v)
                        if (v === 'shared') setValue('visibility', 'space')
                      }}
                      options={[
                        { value: 'shared', label: type === 'income' ? 'Renda do espaço' : 'Gasto compartilhado' },
                        { value: 'personal', label: 'Pessoal' },
                      ]}
                    />
                  </div>
                )}
              />
              <Field label={scope === 'personal' ? 'De quem' : type === 'income' ? 'Quem recebeu' : 'Quem pagou'} error={errors.memberId?.message}>
                <Select {...register('memberId', { onChange: () => setValue('visibility', 'space') })}>
                  {ref.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id === ref.viewerId ? `${m.name} (você)` : m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {scope === 'personal' && isMe ? (
                <Controller
                  control={control}
                  name="visibility"
                  render={({ field }) => (
                    <SwitchField
                      checked={field.value === 'private'}
                      onCheckedChange={(checked) => field.onChange(checked ? 'private' : 'space')}
                      label={
                        <span className="inline-flex items-center gap-1.5">
                          <Lock className="size-3.5 text-fg-muted" aria-hidden /> Visível só para mim
                        </span>
                      }
                      description="Fica fora dos totais e da lista da outra pessoa."
                    />
                  )}
                />
              ) : null}
            </div>
          ) : null}

          <div>
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg"
            >
              <ChevronDown className={cn('size-4 transition-transform', showMore && 'rotate-180')} aria-hidden />
              Mais detalhes
            </button>
            {showMore ? (
              <div className="mt-4 grid gap-4">
                <Field label="Estabelecimento" optional error={errors.merchant?.message}>
                  <Input {...register('merchant')} placeholder="Ex.: Pão de Açúcar" maxLength={80} />
                </Field>
                <Field label="Observações" optional error={errors.notes?.message}>
                  <Textarea {...register('notes')} maxLength={500} />
                </Field>
              </div>
            ) : null}
          </div>

          {confirmDelete && transaction ? (
            <div role="alert" className="rounded-[14px] border border-danger/30 bg-danger-soft p-4 text-sm">
              <p className="font-medium text-danger">Excluir esta movimentação?</p>
              <p className="mt-1 text-fg-muted">Ela deixa de contar nos totais. O registro fica no histórico de auditoria.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="danger" size="sm" loading={pending} onClick={() => onDelete(false)}>
                  {transaction.installment ? 'Só esta parcela' : 'Excluir'}
                </Button>
                {transaction.installment ? (
                  <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => onDelete(true)}>
                    Todas as {transaction.installment.count} parcelas
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter className="sm:justify-between">
          {isEdit ? (
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="md" onClick={() => setConfirmDelete(true)} className="text-danger hover:text-danger">
                <Trash aria-hidden /> Excluir
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDuplicating(true)
                  setValue('occurredOn', ref.today)
                }}
              >
                <Copy aria-hidden /> Duplicar
              </Button>
            </div>
          ) : (
            <span />
          )}
          <Button type="submit" loading={pending} className="sm:min-w-[140px]">
            {isEdit ? 'Salvar' : 'Registrar'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
