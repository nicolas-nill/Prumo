import { timingSafeEqual } from 'node:crypto'
import { after, type NextRequest } from 'next/server'
import { getWhatsAppConfig } from '@/lib/env'
import { logger } from '@/lib/observability/logger'
import { createWebhookDeps } from '@/features/whatsapp/deps'
import { normalizeWebhook } from '@/features/whatsapp/meta/normalize'
import { webhookPayloadSchema } from '@/features/whatsapp/meta/payload'
import { verifyMetaSignature } from '@/features/whatsapp/meta/signature'
import { handleEvents } from '@/features/whatsapp/pipeline'

/**
 * WhatsApp Cloud API webhook — register in Meta as:
 *   Callback URL:  ${NEXT_PUBLIC_APP_URL}/api/whatsapp/webhook
 *   Verify token:  ${WHATSAPP_VERIFY_TOKEN}
 *   Fields:        messages
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 1_000_000

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Verification handshake (Meta → GET with hub.challenge). */
export async function GET(request: NextRequest) {
  const config = getWhatsAppConfig()
  if (!config) return Response.json({ error: 'whatsapp_not_configured' }, { status: 503 })
  const params = request.nextUrl.searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')
  if (mode === 'subscribe' && token && challenge && safeEqual(token, config.verifyToken)) {
    logger.info('whatsapp.webhook_verified')
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  logger.warn('whatsapp.webhook_verification_rejected')
  return new Response('Forbidden', { status: 403 })
}

/** Events. Validates the signature, acknowledges fast, processes after the response. */
export async function POST(request: NextRequest) {
  const config = getWhatsAppConfig()
  if (!config) {
    logger.warn('whatsapp.webhook_unconfigured')
    return Response.json({ error: 'whatsapp_not_configured' }, { status: 503 })
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return new Response('Payload too large', { status: 413 })
  if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), config.appSecret)) {
    logger.warn('whatsapp.invalid_signature')
    return new Response('Invalid signature', { status: 401 })
  }

  let events
  try {
    events = normalizeWebhook(webhookPayloadSchema.parse(JSON.parse(raw)))
  } catch {
    // Signed but unexpected shape: acknowledge so Meta does not retry garbage forever.
    logger.warn('whatsapp.unparseable_payload')
    return new Response('OK', { status: 200 })
  }

  // Only messages addressed to our business number.
  const relevant = events.filter((e) => e.kind === 'status' || e.phoneNumberId === null || e.phoneNumberId === config.phoneNumberId)
  logger.info('whatsapp.webhook_received', { events: relevant.length })

  // Meta expects a quick 200; duplicates from retries are dropped by the wamid dedupe.
  after(async () => {
    try {
      await handleEvents(relevant, createWebhookDeps())
    } catch (error) {
      logger.error('whatsapp.webhook_processing_failed', { error })
    }
  })
  return new Response('EVENT_RECEIVED', { status: 200 })
}
