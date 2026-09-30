import { z } from 'zod'
import { MAX_CENTS } from '@/domain/money'
import { TONES } from '@/domain/types'

export const accountSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Dê um nome à conta.').max(60),
  type: z.enum(['checking', 'savings', 'wallet', 'cash', 'other']),
  openingBalanceCents: z.number().int().min(-MAX_CENTS).max(MAX_CENTS),
  ownerId: z.string().nullable(),
  isActive: z.boolean(),
})
export type AccountFormValues = z.infer<typeof accountSchema>

export const cardSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Dê um nome ao cartão.').max(60),
  // Only the last four digits — never the full card number, CVV or credentials.
  lastFour: z.string().regex(/^(\d{4})?$/, 'Use apenas os 4 últimos dígitos.'),
  closingDay: z.number().int().min(1, 'Dia entre 1 e 31.').max(31, 'Dia entre 1 e 31.'),
  dueDay: z.number().int().min(1, 'Dia entre 1 e 31.').max(31, 'Dia entre 1 e 31.'),
  limitCents: z.number().int().positive().max(MAX_CENTS).nullable(),
  holderId: z.string().nullable(),
  tone: z.enum(TONES),
  isActive: z.boolean(),
})
export type CardFormValues = z.infer<typeof cardSchema>

export const ACCOUNT_TYPE_LABEL: Record<AccountFormValues['type'], string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  wallet: 'Carteira digital',
  cash: 'Dinheiro',
  other: 'Outra',
}
