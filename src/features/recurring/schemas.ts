import { z } from 'zod'
import { compareDates, isISODate } from '@/domain/dates'
import { MAX_CENTS } from '@/domain/money'

export const recurringFormSchema = z
  .object({
    id: z.string().optional(),
    type: z.enum(['income', 'expense']),
    description: z.string().trim().min(1, 'Dê um nome à recorrência.').max(120),
    amountCents: z.number({ error: 'Informe o valor.' }).int().positive('Informe um valor maior que zero.').max(MAX_CENTS),
    categoryId: z.string().nullable(),
    paymentKind: z.enum(['account', 'card', 'none']),
    accountId: z.string().nullable(),
    cardId: z.string().nullable(),
    memberId: z.string().min(1),
    scope: z.enum(['personal', 'shared']),
    frequency: z.enum(['weekly', 'monthly', 'yearly']),
    interval: z.number().int().min(1).max(12),
    nextOccurrenceOn: z.string().refine(isISODate, 'Informe uma data válida.'),
    endOn: z.string().nullable(),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.endOn && (!isISODate(v.endOn) || compareDates(v.endOn, v.nextOccurrenceOn) < 0)) {
      ctx.addIssue({ code: 'custom', path: ['endOn'], message: 'O fim precisa ser depois da próxima ocorrência.' })
    }
    if (v.paymentKind === 'card' && v.type !== 'expense') ctx.addIssue({ code: 'custom', path: ['paymentKind'], message: 'Cartão só vale para despesas.' })
  })

export type RecurringFormValues = z.infer<typeof recurringFormSchema>
