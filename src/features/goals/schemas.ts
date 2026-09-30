import { z } from 'zod'
import { isISODate } from '@/domain/dates'
import { MAX_CENTS } from '@/domain/money'
import { TONES } from '@/domain/types'

export const goalSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Dê um nome à meta.').max(60),
  targetAmountCents: z.number({ error: 'Informe o valor alvo.' }).int().positive('Informe um valor maior que zero.').max(MAX_CENTS),
  targetDate: z.string().nullable().refine((v) => v === null || isISODate(v), 'Data inválida.'),
  scope: z.enum(['personal', 'shared']),
  tone: z.enum(TONES),
  initialAmountCents: z.number().int().min(0).max(MAX_CENTS),
})
export type GoalFormValues = z.infer<typeof goalSchema>

export const contributionSchema = z.object({
  kind: z.enum(['deposit', 'withdraw']),
  amountCents: z.number({ error: 'Informe o valor.' }).int().positive('Informe um valor maior que zero.').max(MAX_CENTS),
  contributedOn: z.string().refine(isISODate, 'Data inválida.'),
  note: z.string().trim().max(140),
})
export type ContributionFormValues = z.infer<typeof contributionSchema>
