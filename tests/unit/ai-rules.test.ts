import { describe, expect, it } from 'vitest'
import { CATALOG_CATEGORIES } from '@/domain/catalog'
import { parseMoneyToCents } from '@/domain/money'
import type { InterpretContext } from '@/features/ai/provider'
import { interpretWithRules } from '@/features/ai/rules'
import { interpretationSchema } from '@/features/ai/schemas'

const context: InterpretContext = {
  today: '2026-09-30', // quarta-feira
  timezone: 'America/Sao_Paulo',
  categories: CATALOG_CATEGORIES.filter((c) => c.defaultOn).map((c) => ({ key: c.key, name: c.name, kind: c.kind })),
  cards: ['Nubank', 'Itaú Visa'],
  accounts: ['Conta conjunta Itaú'],
  sharedSpace: true,
}

const run = (text: string) => {
  const result = interpretWithRules(text, context)
  expect(interpretationSchema.safeParse(result).success).toBe(true)
  return result
}

describe('rule-based interpreter — creating transactions', () => {
  it('"Gastei 47,90 no almoço."', () => {
    const r = run('Gastei 47,90 no almoço.')
    expect(r).toMatchObject({ operation: 'create_transaction', transactionType: 'expense', amountText: '47,90', categoryKey: 'restaurants', description: 'Almoço' })
    expect(parseMoneyToCents(r.amountText!)).toBe(4790)
    expect(r.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('"Paguei 320 no mercado hoje."', () => {
    const r = run('Paguei 320 no mercado hoje.')
    expect(r).toMatchObject({ transactionType: 'expense', amountText: '320', categoryKey: 'groceries', date: '2026-09-30', description: 'Mercado' })
  })

  it('"gastei 79,90 no Outback ontem" keeps the merchant', () => {
    const r = run('gastei 79,90 no Outback ontem')
    expect(r).toMatchObject({ amountText: '79,90', merchant: 'Outback', description: 'Outback', categoryKey: 'restaurants', date: '2026-09-29' })
  })

  it('"Gastei 35 no almoço" — "Gastei 50 ontem" has no category → lower confidence', () => {
    expect(run('Gastei 35 no almoço').categoryKey).toBe('restaurants')
    const vague = run('Gastei 50 ontem')
    expect(vague).toMatchObject({ amountText: '50', categoryKey: null, date: '2026-09-29' })
    expect(vague.confidence).toBeLessThan(0.75)
  })

  it('understands income', () => {
    expect(run('recebi 5.000 de salário')).toMatchObject({ transactionType: 'income', amountText: '5.000', categoryKey: 'salary' })
    expect(run('caiu o freela de 1.200')).toMatchObject({ transactionType: 'income', amountText: '1.200' })
  })

  it('understands installments and cards', () => {
    const r = run('comprei um notebook de 1.200 em 12x no cartão Nubank')
    expect(r).toMatchObject({ amountText: '1.200', installments: 12, paymentHint: 'Nubank' })
  })

  it('handles short forms, thousands and weekdays', () => {
    expect(run('uber 23,50')).toMatchObject({ amountText: '23,50', categoryKey: 'transport', description: 'Uber' })
    expect(run('gastei 2 mil na viagem')).toMatchObject({ amountText: '2000', categoryKey: 'travel' })
    expect(run('farmácia 87,35 na sexta')).toMatchObject({ categoryKey: 'health', date: '2026-09-25' })
    expect(run('mercado 150 dia 28')).toMatchObject({ date: '2026-09-28' })
    expect(run('luz 214,37 dia 5/9')).toMatchObject({ amountText: '214,37', categoryKey: 'utilities' })
  })

  it('detects shared/personal scope', () => {
    expect(run('gastei 120 no mercado, gasto nosso').scope).toBe('shared')
    expect(run('gastei 60 no barbeiro, é pessoal').scope).toBe('personal')
  })
})

describe('rule-based interpreter — conversation intents', () => {
  it('corrections of the last entry', () => {
    expect(run('Na verdade foram 42.')).toMatchObject({ operation: 'correct_last', amountText: '42' })
    expect(run('Muda o último gasto para mercado.')).toMatchObject({ operation: 'correct_last', categoryKey: 'groceries' })
    expect(run('Isso foi no cartão Nubank.')).toMatchObject({ operation: 'correct_last', paymentHint: 'Nubank' })
    expect(run('Foi gasto nosso.')).toMatchObject({ operation: 'correct_last', scope: 'shared' })
  })

  it('deletions with a target', () => {
    expect(run('Apaga o Uber de ontem.')).toMatchObject({ operation: 'delete_transaction', date: '2026-09-29' })
    expect(run('apaga o último')).toMatchObject({ operation: 'delete_transaction', targetHint: 'último' })
  })

  it('questions are answered by queries, not by the model', () => {
    expect(run('Quanto gastei com restaurante?')).toMatchObject({ operation: 'query', question: 'spent_in_category', categoryKey: 'restaurants' })
    expect(run('Quanto ainda posso gastar?')).toMatchObject({ operation: 'query', question: 'remaining_budget' })
    expect(run('Qual categoria mais aumentou?')).toMatchObject({ operation: 'query', question: 'top_category' })
  })

  it('confirmation, help and unknown', () => {
    expect(run('sim').operation).toBe('confirm_yes')
    expect(run('Não').operation).toBe('confirm_no')
    expect(run('oi').operation).toBe('help')
    expect(run('bom dia pessoal, tudo bem com vocês?').operation).toBe('unknown')
  })
})
