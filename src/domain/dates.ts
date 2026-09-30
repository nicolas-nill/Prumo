import type { ISODate, MonthKey } from './types'

/**
 * Calendar math on plain dates. All arithmetic uses UTC Date objects as a neutral carrier
 * so the server's timezone never shifts a day. "Today" is always resolved in the space
 * timezone (default America/Sao_Paulo).
 */

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_KEY = /^(\d{4})-(\d{2})$/

export function isISODate(value: string): boolean {
  const m = ISO_DATE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

export function isMonthKey(value: string): boolean {
  const m = MONTH_KEY.exec(value)
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12
}

function toUTC(date: ISODate): Date {
  const m = ISO_DATE.exec(date)
  if (!m) throw new RangeError(`invalid ISO date: ${date}`)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10)
}

export function todayIn(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function monthOf(date: ISODate): MonthKey {
  return date.slice(0, 7)
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function monthStart(month: MonthKey): ISODate {
  return `${month}-01`
}

export function monthEnd(month: MonthKey): ISODate {
  return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return fromUTC(d).slice(0, 7)
}

export function addDays(date: ISODate, delta: number): ISODate {
  const d = toUTC(date)
  d.setUTCDate(d.getUTCDate() + delta)
  return fromUTC(d)
}

/** Adds months keeping the day, clamped to the target month's last day (31 Jan + 1m = 28/29 Feb). */
export function addMonthsToDate(date: ISODate, delta: number, preferredDay?: number): ISODate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const target = addMonths(`${y}-${String(m).padStart(2, '0')}`, delta)
  const day = Math.min(preferredDay ?? d, daysInMonth(target))
  return `${target}-${String(day).padStart(2, '0')}`
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function diffInDays(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000)
}

export function monthsBetween(from: MonthKey, to: MonthKey): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number]
  const [ty, tm] = to.split('-').map(Number) as [number, number]
  return (ty - fy) * 12 + (tm - fm)
}

export type MonthPosition = 'past' | 'current' | 'future'

export interface MonthProgress {
  month: MonthKey
  position: MonthPosition
  totalDays: number
  /** Days elapsed including today (current month), all days (past), zero (future). */
  elapsedDays: number
  remainingDays: number
  /** 0..1 */
  elapsedRatio: number
}

export function monthProgress(month: MonthKey, today: ISODate): MonthProgress {
  const totalDays = daysInMonth(month)
  const current = monthOf(today)
  if (month < current) {
    return { month, position: 'past', totalDays, elapsedDays: totalDays, remainingDays: 0, elapsedRatio: 1 }
  }
  if (month > current) {
    return { month, position: 'future', totalDays, elapsedDays: 0, remainingDays: totalDays, elapsedRatio: 0 }
  }
  const day = Number(today.slice(8, 10))
  return {
    month,
    position: 'current',
    totalDays,
    elapsedDays: day,
    remainingDays: totalDays - day + 1,
    elapsedRatio: day / totalDays,
  }
}

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function monthName(month: MonthKey, options: { short?: boolean; capitalized?: boolean } = {}): string {
  const idx = Number(month.slice(5, 7)) - 1
  const name = (options.short ? MONTH_SHORT : MONTH_NAMES)[idx] ?? ''
  return options.capitalized ? capitalize(name) : name
}

/** "Setembro de 2026" */
export function formatMonthLong(month: MonthKey): string {
  return `${monthName(month, { capitalized: true })} de ${month.slice(0, 4)}`
}

/** "set/26" */
export function formatMonthShort(month: MonthKey): string {
  return `${monthName(month, { short: true })}/${month.slice(2, 4)}`
}

/** "14/09/2026" */
export function formatDateBR(date: ISODate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
}

/** "14 set" — compact list format; "Hoje"/"Ontem" relative to `today`. */
export function formatDateShort(date: ISODate, today?: ISODate): string {
  if (today) {
    if (date === today) return 'Hoje'
    if (date === addDays(today, -1)) return 'Ontem'
  }
  const sameYear = !today || date.slice(0, 4) === today.slice(0, 4)
  const base = `${Number(date.slice(8, 10))} ${MONTH_SHORT[Number(date.slice(5, 7)) - 1]}`
  return sameYear ? base : `${base} ${date.slice(0, 4)}`
}

export function weekdayShort(date: ISODate): string {
  return WEEKDAYS_SHORT[toUTC(date).getUTCDay()] ?? ''
}

/** "dd/mm/aaaa" or "dd/mm" → ISO. Used by natural-language parsing and form inputs. */
export function parseBRDate(input: string, reference: ISODate): ISODate | null {
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(input.trim())
  if (!m) return null
  let year = m[3] ? Number(m[3]) : Number(reference.slice(0, 4))
  if (year < 100) year += 2000
  const iso = `${year}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`
  return isISODate(iso) ? iso : null
}
