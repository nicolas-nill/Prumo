'use server'

import { revalidatePath } from 'next/cache'
import type { TransactionInput } from '@/server/data/contracts'
import { AppError, runAction, type ActionResult } from '@/lib/errors'
import { logger } from '@/lib/observability/logger'
import { getReferenceData, getSpaceContext } from '@/server/session'
import { idSchema, transactionFormSchema, type TransactionFormValues } from './schemas'

async function toInput(values: TransactionFormValues): Promise<TransactionInput> {
  const { space } = await getSpaceContext()
  const ref = await getReferenceData(space.id)

  const category = values.categoryId ? ref.categories.find((c) => c.id === values.categoryId) : null
  if (values.categoryId && !category) throw new AppError('VALIDATION', undefined, { fieldErrors: { categoryId: 'Categoria inválida.' } })
  if (category && category.kind !== values.type) {
    throw new AppError('VALIDATION', undefined, { fieldErrors: { categoryId: 'Essa categoria não combina com o tipo escolhido.' } })
  }
  if (!space.members.some((m) => m.userId === values.memberId)) {
    throw new AppError('VALIDATION', undefined, { fieldErrors: { memberId: 'Essa pessoa não faz parte do espaço.' } })
  }
  const accountId = values.paymentKind === 'account' ? values.accountId : null
  const cardId = values.paymentKind === 'card' && values.type === 'expense' ? values.cardId : null
  if (accountId && !ref.accounts.some((a) => a.id === accountId)) throw new AppError('VALIDATION', undefined, { fieldErrors: { accountId: 'Conta inválida.' } })
  if (cardId && !ref.cards.some((c) => c.id === cardId)) throw new AppError('VALIDATION', undefined, { fieldErrors: { cardId: 'Cartão inválido.' } })

  return {
    type: values.type,
    amountCents: values.amountCents,
    occurredOn: values.occurredOn,
    description: values.description,
    merchant: values.merchant || null,
    notes: values.notes || null,
    categoryId: values.categoryId,
    accountId,
    cardId,
    memberId: values.memberId,
    scope: space.type === 'personal' ? 'personal' : values.scope,
    visibility: values.scope === 'personal' ? values.visibility : 'space',
  }
}

export async function createTransactionAction(raw: unknown): Promise<ActionResult<{ count: number }>> {
  return runAction('transactions.create', async () => {
    const { viewer, space } = await getSpaceContext()
    const values = transactionFormSchema.parse(raw)
    const input = await toInput(values)
    const created = await viewer.repo.createTransaction(space.id, {
      ...input,
      installments: input.cardId && values.installments > 1 ? values.installments : undefined,
      source: 'dashboard',
    })
    logger.info('transaction.created', { spaceId: space.id, source: 'dashboard', rows: created.length })
    revalidatePath('/', 'layout')
    return { count: created.length }
  })
}

export async function updateTransactionAction(id: string, raw: unknown): Promise<ActionResult<null>> {
  return runAction('transactions.update', async () => {
    const { viewer, space } = await getSpaceContext()
    const values = transactionFormSchema.parse(raw)
    await viewer.repo.updateTransaction(space.id, idSchema.parse(id), await toInput(values))
    revalidatePath('/', 'layout')
    return null
  })
}

export async function deleteTransactionAction(id: string, wholeInstallmentGroup = false): Promise<ActionResult<{ count: number }>> {
  return runAction('transactions.delete', async () => {
    const { viewer, space } = await getSpaceContext()
    const count = await viewer.repo.deleteTransaction(space.id, idSchema.parse(id), { wholeInstallmentGroup })
    revalidatePath('/', 'layout')
    return { count }
  })
}
