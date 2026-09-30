import { describe, expect, it } from 'vitest'
import {
  applyBasisPoints,
  formatMoney,
  formatPercent,
  parseMoneyToCents,
  splitInstallments,
} from '@/domain/money'

describe('parseMoneyToCents', () => {
  it.each([
    ['47,90', 4790],
    ['47.90', 4790],
    ['47,9', 4790],
    ['35', 3500],
    ['0,5', 50],
    ['R$ 1.234,56', 123456],
    ['1.200', 120000],
    ['12.345.678', 1234567800],
    ['1,234.56', 123456],
    ['320', 32000],
    ['  79,90 ', 7990],
    ['-12,00', -1200],
  ])('parses %s → %i', (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected)
  })

  it.each(['', 'abc', '1,2,3', '12,345', '1.23.4', '47,901', 'R$'])('rejects %s', (input) => {
    expect(parseMoneyToCents(input)).toBeNull()
  })

  it('never produces float drift', () => {
    expect(parseMoneyToCents('0,10')! + parseMoneyToCents('0,20')!).toBe(30)
  })
})

describe('formatMoney', () => {
  it('formats BRL with comma decimals', () => {
    expect(formatMoney(4790)).toBe('R$ 47,90')
    expect(formatMoney(123456)).toBe('R$ 1.234,56')
  })
  it('handles sign and hidden cents', () => {
    expect(formatMoney(-2500)).toBe('−R$ 25,00')
    expect(formatMoney(2500, { signed: true })).toBe('+R$ 25,00')
    expect(formatMoney(1650000, { hideCents: true })).toBe('R$ 16.500')
  })
})

describe('percent helpers', () => {
  it('applies basis points with half-up rounding', () => {
    expect(applyBasisPoints(1_650_000, 5000)).toBe(825_000)
    expect(applyBasisPoints(333, 3333)).toBe(111)
  })
  it('formats pt-BR percentages', () => {
    expect(formatPercent(0.439, 1)).toBe('43,9%')
    expect(formatPercent(null)).toBe('—')
  })
})

describe('splitInstallments', () => {
  it('splits exactly, remainder on first installment', () => {
    const parts = splitInstallments(100_000, 3)
    expect(parts).toEqual([33_334, 33_333, 33_333])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100_000)
  })
  it('handles R$ 1.200 em 12x', () => {
    expect(splitInstallments(120_000, 12)).toEqual(Array(12).fill(10_000))
  })
  it('rejects invalid input', () => {
    expect(() => splitInstallments(0, 2)).toThrow()
    expect(() => splitInstallments(1000, 0)).toThrow()
  })
})
