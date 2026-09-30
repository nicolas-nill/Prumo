import { addDays, addMonthsToDate, compareDates, daysInMonth, monthOf } from '../dates'
import { splitInstallments } from '../money'
import type { ISODate, RecurrenceFrequency } from '../types'

// ─── Installments ─────────────────────────────────────────────────────────────

export interface InstallmentPlanItem {
  number: number
  count: number
  amountCents: number
  occurredOn: ISODate
}

/**
 * "R$ 1.200 em 12x" → 12 rows. Amounts sum exactly to the total (remainder on the first).
 * Installment n is dated n−1 months after the purchase, keeping the purchase day
 * (clamped to month end), which places it in the right card invoice.
 */
export function buildInstallmentPlan(totalCents: number, count: number, purchaseDate: ISODate): InstallmentPlanItem[] {
  const amounts = splitInstallments(totalCents, count)
  const day = Number(purchaseDate.slice(8, 10))
  return amounts.map((amountCents, i) => ({
    number: i + 1,
    count,
    amountCents,
    occurredOn: addMonthsToDate(purchaseDate, i, day),
  }))
}

// ─── Credit card invoices ─────────────────────────────────────────────────────

export interface Invoice {
  /** Month the invoice closes in (YYYY-MM). */
  referenceMonth: string
  periodStart: ISODate
  periodEnd: ISODate
  closingDate: ISODate
  dueDate: ISODate
}

function dayIn(month: string, day: number): ISODate {
  return `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`
}

function addMonthKey(month: string, delta: number): string {
  return addMonthsToDate(`${month}-01`, delta).slice(0, 7)
}

/**
 * Convention (documented in DECISIONS.md): a purchase made *before* the closing day
 * belongs to the invoice closing that month; purchases on/after the closing day go to the
 * next one ("melhor dia de compra"). The due date falls in the closing month when
 * dueDay > closingDay, otherwise in the following month.
 */
export function invoiceFor(purchaseDate: ISODate, closingDay: number, dueDay: number): Invoice {
  const purchaseMonth = monthOf(purchaseDate)
  const closingThisMonth = dayIn(purchaseMonth, closingDay)
  const referenceMonth = compareDates(purchaseDate, closingThisMonth) < 0 ? purchaseMonth : addMonthKey(purchaseMonth, 1)
  const closingDate = dayIn(referenceMonth, closingDay)
  const previousClosing = dayIn(addMonthKey(referenceMonth, -1), closingDay)
  const dueMonth = dueDay > closingDay ? referenceMonth : addMonthKey(referenceMonth, 1)
  return {
    referenceMonth,
    periodStart: previousClosing,
    periodEnd: addDays(closingDate, -1),
    closingDate,
    dueDate: dayIn(dueMonth, dueDay),
  }
}

export interface CardInvoiceState {
  open: Invoice
  /** Last closed invoice while it is still before its due date. */
  closedUnpaid: Invoice | null
}

export function cardInvoiceState(today: ISODate, closingDay: number, dueDay: number): CardInvoiceState {
  const open = invoiceFor(today, closingDay, dueDay)
  const previous = invoiceFor(addDays(open.periodStart, -1), closingDay, dueDay)
  return { open, closedUnpaid: compareDates(previous.dueDate, today) >= 0 ? previous : null }
}

// ─── Recurrence ───────────────────────────────────────────────────────────────

export interface RecurrencePattern {
  frequency: RecurrenceFrequency
  interval: number
  startOn: ISODate
  endOn: ISODate | null
}

export function stepOccurrence(date: ISODate, pattern: RecurrencePattern): ISODate {
  const anchorDay = Number(pattern.startOn.slice(8, 10))
  const interval = Math.max(1, pattern.interval)
  switch (pattern.frequency) {
    case 'weekly':
      return addDays(date, 7 * interval)
    case 'monthly':
      return addMonthsToDate(date, interval, anchorDay)
    case 'yearly':
      return addMonthsToDate(date, 12 * interval, anchorDay)
  }
}

/** Occurrences from `from` (inclusive, must be an occurrence) up to `until` (inclusive). */
export function occurrencesUntil(pattern: RecurrencePattern, from: ISODate, until: ISODate, max = 400): ISODate[] {
  const out: ISODate[] = []
  let current = from
  while (compareDates(current, until) <= 0 && out.length < max) {
    if (pattern.endOn && compareDates(current, pattern.endOn) > 0) break
    out.push(current)
    current = stepOccurrence(current, pattern)
  }
  return out
}

export function frequencyLabel(frequency: RecurrenceFrequency, interval = 1): string {
  if (interval <= 1) return frequency === 'weekly' ? 'Semanal' : frequency === 'monthly' ? 'Mensal' : 'Anual'
  const unit = frequency === 'weekly' ? 'semanas' : frequency === 'monthly' ? 'meses' : 'anos'
  return `A cada ${interval} ${unit}`
}
