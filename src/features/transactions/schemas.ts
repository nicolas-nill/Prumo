import { z } from 'zod'
import { isISODate } from '@/domain/dates'
import { MAX_CENTS } from '@/domain/money'

/** Shared by the form (client validation) and the server actions (authoritative validation). */
export const transactionFormSchema = z
  .object({
    type: z.enum(['income', 'expense']),
    amountCents: z
      .number({ error: 'Informe o valor.' })
      .int()
      .positive('Informe um valor maior que zero.')
      .max(MAX_CENTS, 'Valor alto demais.'),
    occurredOn: z.string().refine(isISODate, 'Informe uma data válida.'),
    description: z.string().trim().min(1, 'Descreva a movimentação.').max(140, 'Use até 140 caracteres.'),
    merchant: z.string().trim().max(80, 'Use até 80 caracteres.'),
    notes: z.string().trim().max(500, 'Use até 500 caracteres.'),
    categoryId: z.string().nullable(),
    paymentKind: z.enum(['account', 'card', 'none']),
    accountId: z.string().nullable(),
    cardId: z.string().nullable(),
    memberId: z.string().min(1, 'Escolha o responsável.'),
    scope: z.enum(['personal', 'shared']),
    visibility: z.enum(['space', 'private']),
    installments: z.number().int().min(1).max(48),
  })
  .superRefine((v, ctx) => {
    if (v.paymentKind === 'card' && v.type !== 'expense') {
      ctx.addIssue({ code: 'custom', path: ['paymentKind'], message: 'Cartão de crédito só vale para despesas.' })
    }
    if (v.paymentKind === 'card' && !v.cardId) ctx.addIssue({ code: 'custom', path: ['cardId'], message: 'Escolha o cartão.' })
    if (v.installments > 1 && v.paymentKind !== 'card') {
      ctx.addIssue({ code: 'custom', path: ['installments'], message: 'Parcelamento só em compras no cartão.' })
    }
    if (v.installments > 1 && v.amountCents < v.installments) {
      ctx.addIssue({ code: 'custom', path: ['installments'], message: 'Valor baixo demais para esse parcelamento.' })
    }
  })

export type TransactionFormValues = z.infer<typeof transactionFormSchema>

export const idSchema = z.uuid()
