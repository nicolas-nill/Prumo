import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Validates Meta's `X-Hub-Signature-256: sha256=<hex>` header: HMAC-SHA256 of the RAW
 * request body with the App Secret. Constant-time comparison.
 */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false
  const received = header.slice('sha256='.length)
  if (!/^[0-9a-f]{64}$/i.test(received)) return false
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(received.toLowerCase(), 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function signMetaPayload(rawBody: string, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`
}
