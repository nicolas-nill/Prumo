import { z } from 'zod'

/**
 * Structured outputs. Two layers:
 *  - WIRE schemas (plain JSON Schema, OpenAI strict mode) describe what the model must emit;
 *  - Zod schemas validate and bound whatever comes back. Nothing unvalidated goes further.
 *
 * The model never produces computed numbers: amounts come back as the literal text the user
 * wrote or the receipt printed ("79,90") and are parsed into cents by deterministic code.
 */

export const OPERATIONS = [
  'create_transaction',
  'correct_last',
  'delete_transaction',
  'query',
  'confirm_yes',
  'confirm_no',
  'help',
  'unknown',
] as const
export type Operation = (typeof OPERATIONS)[number]

export const QUESTIONS = ['month_summary', 'spent_in_category', 'remaining_budget', 'top_category'] as const
export type Question = (typeof QUESTIONS)[number]

export const interpretationSchema = z.object({
  operation: z.enum(OPERATIONS),
  transactionType: z.enum(['income', 'expense']).nullable(),
  amountText: z.string().trim().max(40).nullable(),
  date: z.string().trim().max(10).nullable(),
  description: z.string().trim().max(140).nullable(),
  merchant: z.string().trim().max(80).nullable(),
  categoryKey: z.string().trim().max(60).nullable(),
  paymentHint: z.string().trim().max(60).nullable(),
  installments: z.number().int().min(1).max(48).nullable(),
  scope: z.enum(['personal', 'shared']).nullable(),
  targetHint: z.string().trim().max(120).nullable(),
  question: z.enum(QUESTIONS).nullable(),
  confidence: z.number().min(0).max(1),
})
export type Interpretation = z.infer<typeof interpretationSchema>

export const EMPTY_INTERPRETATION: Interpretation = {
  operation: 'unknown',
  transactionType: null,
  amountText: null,
  date: null,
  description: null,
  merchant: null,
  categoryKey: null,
  paymentHint: null,
  installments: null,
  scope: null,
  targetHint: null,
  question: null,
  confidence: 0,
}

export const receiptSchema = z.object({
  isReceipt: z.boolean(),
  merchant: z.string().trim().max(80).nullable(),
  totalText: z.string().trim().max(40).nullable(),
  date: z.string().trim().max(10).nullable(),
  categoryKey: z.string().trim().max(60).nullable(),
  paymentHint: z.string().trim().max(60).nullable(),
  installments: z.number().int().min(1).max(48).nullable(),
  confidence: z.number().min(0).max(1),
})
export type ReceiptExtraction = z.infer<typeof receiptSchema>

const nullable = (type: string) => ({ type: [type, 'null'] })

export const INTERPRETATION_WIRE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'operation',
    'transactionType',
    'amountText',
    'date',
    'description',
    'merchant',
    'categoryKey',
    'paymentHint',
    'installments',
    'scope',
    'targetHint',
    'question',
    'confidence',
  ],
  properties: {
    operation: { type: 'string', enum: [...OPERATIONS] },
    transactionType: { type: ['string', 'null'], enum: ['income', 'expense', null] },
    amountText: { ...nullable('string'), description: 'Valor exatamente como escrito pelo usuário, ex.: "79,90", "1.200", "2 mil". Nunca calcule.' },
    date: { ...nullable('string'), description: 'Data ISO YYYY-MM-DD resolvida a partir de "hoje" informado; null se não mencionada.' },
    description: { ...nullable('string'), description: 'Descrição curta e natural, ex.: "Almoço", "Mercado", "Uber".' },
    merchant: { ...nullable('string'), description: 'Estabelecimento com nome próprio, se houver.' },
    categoryKey: { ...nullable('string'), description: 'Uma das chaves de categoria fornecidas.' },
    paymentHint: { ...nullable('string'), description: 'Meio de pagamento citado: nome do cartão/conta, "pix", "débito", "dinheiro".' },
    installments: { ...nullable('integer'), description: 'Número de parcelas se citado ("em 12x").' },
    scope: { type: ['string', 'null'], enum: ['personal', 'shared', null] },
    targetHint: { ...nullable('string'), description: 'Para correções/exclusões: o que identifica o lançamento-alvo.' },
    question: { type: ['string', 'null'], enum: [...QUESTIONS, null] },
    confidence: { type: 'number', description: '0 a 1: quão seguro você está da interpretação.' },
  },
} as const

export const RECEIPT_WIRE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isReceipt', 'merchant', 'totalText', 'date', 'categoryKey', 'paymentHint', 'installments', 'confidence'],
  properties: {
    isReceipt: { type: 'boolean', description: 'true se a imagem for nota fiscal, cupom ou comprovante de pagamento.' },
    merchant: { ...nullable('string'), description: 'Nome do estabelecimento/recebedor.' },
    totalText: { ...nullable('string'), description: 'Valor TOTAL pago, exatamente como impresso (ex.: "187,45").' },
    date: { ...nullable('string'), description: 'Data da compra em ISO YYYY-MM-DD, se legível.' },
    categoryKey: { ...nullable('string'), description: 'Uma das chaves de categoria fornecidas.' },
    paymentHint: { ...nullable('string'), description: 'crédito, débito, pix, dinheiro — se impresso.' },
    installments: { ...nullable('integer') },
    confidence: { type: 'number' },
  },
} as const
