/**
 * Phone helpers. Meta sends `wa_id` as digits without "+". Brazilian mobiles registered
 * before the 9th-digit migration may arrive without the leading 9 (55 11 8xxx-xxxx), so
 * lookups try both variants.
 */

export function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return `+${digits}`
}

/** Brazilian input without country code ("(11) 98765-4321") → +5511987654321. */
export function normalizeBrazilianPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return `+${digits}`
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  if (input.trim().startsWith('+')) return toE164(input)
  return null
}

export function phoneVariants(waIdOrE164: string): string[] {
  const e164 = toE164(waIdOrE164)
  if (!e164) return []
  const digits = e164.slice(1)
  const variants = new Set([e164])
  if (digits.startsWith('55')) {
    const ddd = digits.slice(2, 4)
    const local = digits.slice(4)
    if (local.length === 9 && local.startsWith('9')) variants.add(`+55${ddd}${local.slice(1)}`)
    if (local.length === 8) variants.add(`+55${ddd}9${local}`)
  }
  return [...variants]
}

/** "+5511987654321" → "(11) 98765-4321" for display. */
export function formatBrazilianPhone(e164: string): string {
  const d = e164.replace(/\D/g, '')
  if (d.startsWith('55') && d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.startsWith('55') && d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
  return e164
}
