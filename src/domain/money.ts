/**
 * Money is represented as integer cents everywhere (DB: bigint, TS: safe integer).
 * Parsing never multiplies floats: "47,90" is split on the decimal separator and
 * assembled as integers, so 0.1 + 0.2 problems cannot happen.
 */

export const MAX_CENTS = 99_999_999_999 // R$ 999.999.999,99 — sanity ceiling for a personal product

export function isValidCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= MAX_CENTS
}

/**
 * Parses user-typed Brazilian money into cents.
 * Accepts: "47,90", "47.90", "R$ 1.234,56", "1.200" (pt-BR thousands), "1200", "35", "0,5".
 * Returns null when the input is not an unambiguous amount.
 */
export function parseMoneyToCents(input: string): number | null {
  if (typeof input !== 'string') return null
  let s = input.trim().replace(/^R\$\s*/i, '').replace(/\s| /g, '')
  let negative = false
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let integerPart: string
  let fractionPart = ''

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? ',' : '.'
    const thousandsSep = decimalSep === ',' ? '.' : ','
    const idx = s.lastIndexOf(decimalSep)
    integerPart = s.slice(0, idx)
    fractionPart = s.slice(idx + 1)
    if (!new RegExp(`^\\d{1,3}(\\${thousandsSep}\\d{3})*$`).test(integerPart)) return null
    integerPart = integerPart.split(thousandsSep).join('')
  } else if (lastComma >= 0) {
    // pt-BR: comma is the decimal separator. "1,234,5" is invalid.
    if (s.indexOf(',') !== lastComma) return null
    integerPart = s.slice(0, lastComma)
    fractionPart = s.slice(lastComma + 1)
  } else if (lastDot >= 0) {
    // "1.200" / "12.345.678" → thousands; "47.9" / "47.90" → decimal
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      integerPart = s.split('.').join('')
    } else if (s.indexOf('.') === lastDot) {
      integerPart = s.slice(0, lastDot)
      fractionPart = s.slice(lastDot + 1)
    } else {
      return null
    }
  } else {
    integerPart = s
  }

  if (integerPart === '') integerPart = '0'
  if (!/^\d+$/.test(integerPart) || !/^\d{0,2}$/.test(fractionPart)) return null

  const cents = Number(integerPart) * 100 + Number(fractionPart.padEnd(2, '0') || '0')
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null
  return negative ? -cents : cents
}

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlNoCents = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const decimalFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export interface FormatMoneyOptions {
  /** Prefix "+" for positive values (e.g. income in lists). */
  signed?: boolean
  /** Drop cents for large, glanceable figures. */
  hideCents?: boolean
  compact?: boolean
}

/** Formats cents as BRL. Uses a regular space so values wrap and copy predictably. */
export function formatMoney(cents: number, options: FormatMoneyOptions = {}): string {
  const value = cents / 100
  const formatter = options.compact ? brlCompact : options.hideCents ? brlNoCents : brlFormatter
  const formatted = formatter.format(Math.abs(value)).replace(/ /g, ' ')
  if (cents < 0) return `−${formatted}`
  if (options.signed && cents > 0) return `+${formatted}`
  return formatted
}

/** "1234,56" — for prefilling editable inputs. */
export function centsToInputValue(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return decimalFormatter.format(cents / 100)
}

export function sumCents(values: Iterable<number>): number {
  let total = 0
  for (const v of values) total += v
  return total
}

/** Applies basis points (1% = 100bp) with half-up rounding to the cent. */
export function applyBasisPoints(cents: number, bp: number): number {
  return Math.round((cents * bp) / 10_000)
}

/** Ratio as basis points, rounded. Returns null when the base is zero. */
export function toBasisPoints(part: number, whole: number): number | null {
  if (whole === 0) return null
  return Math.round((part / whole) * 10_000)
}

const percentFormatter = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })
const percentFormatter1 = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })

export function formatPercent(ratio: number | null | undefined, fractionDigits: 0 | 1 = 0): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—'
  const formatted = (fractionDigits === 1 ? percentFormatter1 : percentFormatter).format(ratio)
  return formatted.replace(/ /g, '')
}

/**
 * Splits a total into `count` installments that sum exactly to the total.
 * The remainder cents go to the first installment (how Brazilian card issuers usually round).
 */
export function splitInstallments(totalCents: number, count: number): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) throw new RangeError('total must be positive cents')
  if (!Number.isInteger(count) || count < 1 || count > 72) throw new RangeError('count must be 1..72')
  const base = Math.floor(totalCents / count)
  const remainder = totalCents - base * count
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base))
}
