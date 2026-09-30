import { z } from 'zod'
import { isMonthKey } from '@/domain/dates'
import { MAX_CENTS } from '@/domain/money'

export const planSchema = z.object({
  month: z.string().refine(isMonthKey, 'Mês inválido.'),
  expectedIncomeCents: z.number().int().min(0).max(MAX_CENTS),
  groups: z
    .array(
      z.object({
        groupId: z.string(),
        mode: z.enum(['percent', 'amount']),
        percentBp: z.number().int().min(0).max(10_000).nullable(),
        amountCents: z.number().int().min(0).max(MAX_CENTS).nullable(),
      }),
    )
    .max(20),
  categories: z.array(z.object({ categoryId: z.string(), amountCents: z.number().int().min(0).max(MAX_CENTS) })).max(200),
})

export type PlanFormValues = z.infer<typeof planSchema>
