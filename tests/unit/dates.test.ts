import { describe, expect, it } from 'vitest'
import {
  addMonths,
  addMonthsToDate,
  daysInMonth,
  formatDateShort,
  formatMonthLong,
  monthProgress,
  parseBRDate,
  todayIn,
} from '@/domain/dates'

describe('calendar math', () => {
  it('knows month lengths including leap years', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-09')).toBe(30)
  })
  it('adds months across years', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })
  it('clamps day when adding months', () => {
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsToDate('2026-02-28', 1, 31)).toBe('2026-03-31')
  })
})

describe('todayIn', () => {
  it('resolves the date in São Paulo, not UTC', () => {
    // 02:30 UTC on Oct 1 is still Sep 30 in São Paulo (UTC−3)
    expect(todayIn('America/Sao_Paulo', new Date('2026-10-01T02:30:00Z'))).toBe('2026-09-30')
  })
})

describe('monthProgress', () => {
  it('counts today as elapsed in the current month', () => {
    const p = monthProgress('2026-09', '2026-09-15')
    expect(p.position).toBe('current')
    expect(p.elapsedDays).toBe(15)
    expect(p.remainingDays).toBe(16)
    expect(p.elapsedRatio).toBeCloseTo(0.5)
  })
  it('handles past and future months', () => {
    expect(monthProgress('2026-08', '2026-09-15')).toMatchObject({ position: 'past', elapsedRatio: 1, remainingDays: 0 })
    expect(monthProgress('2026-10', '2026-09-15')).toMatchObject({ position: 'future', elapsedRatio: 0 })
  })
})

describe('Brazilian formatting', () => {
  it('formats months and relative days', () => {
    expect(formatMonthLong('2026-09')).toBe('Setembro de 2026')
    expect(formatDateShort('2026-09-15', '2026-09-15')).toBe('Hoje')
    expect(formatDateShort('2026-09-14', '2026-09-15')).toBe('Ontem')
    expect(formatDateShort('2026-09-03', '2026-09-15')).toBe('3 set')
  })
  it('parses dd/mm and dd/mm/yyyy', () => {
    expect(parseBRDate('05/09', '2026-09-15')).toBe('2026-09-05')
    expect(parseBRDate('31/12/25', '2026-09-15')).toBe('2025-12-31')
    expect(parseBRDate('31/02', '2026-09-15')).toBeNull()
  })
})
