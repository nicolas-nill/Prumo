import type { WebhookPayload } from './payload'

/** Internal, transport-agnostic representation of what arrived from WhatsApp. */
export type InboundType = 'text' | 'audio' | 'image' | 'document' | 'interactive' | 'unsupported'

export interface InboundMessage {
  kind: 'message'
  waMessageId: string
  from: string
  phoneNumberId: string | null
  timestamp: string
  type: InboundType
  text: string | null
  mediaId: string | null
  mimeType: string | null
  /** Button/list reply id (our own payload ids, e.g. "confirm:yes"). */
  replyId: string | null
  /** wamid of the message being replied to (WhatsApp "reply" feature). */
  contextId: string | null
  profileName: string | null
}

export interface StatusUpdate {
  kind: 'status'
  waMessageId: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  errorCode: number | null
}

export type InboundEvent = InboundMessage | StatusUpdate

const STATUSES = new Set(['sent', 'delivered', 'read', 'failed'])

function isoFromUnix(ts: string): string {
  const seconds = Number(ts)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString()
}

export function normalizeWebhook(payload: WebhookPayload): InboundEvent[] {
  const events: InboundEvent[] = []
  if (payload.object !== 'whatsapp_business_account') return events

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue
      const value = change.value
      const phoneNumberId = value.metadata?.phone_number_id ?? null
      const names = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]))

      for (const m of value.messages ?? []) {
        const base = {
          kind: 'message' as const,
          waMessageId: m.id,
          from: m.from,
          phoneNumberId,
          timestamp: isoFromUnix(m.timestamp),
          contextId: m.context?.id ?? null,
          profileName: names.get(m.from) ?? null,
        }
        switch (m.type) {
          case 'text':
            events.push({ ...base, type: 'text', text: m.text?.body ?? '', mediaId: null, mimeType: null, replyId: null })
            break
          case 'audio':
            events.push({ ...base, type: 'audio', text: null, mediaId: m.audio?.id ?? null, mimeType: m.audio?.mime_type ?? null, replyId: null })
            break
          case 'image':
            events.push({ ...base, type: 'image', text: m.image?.caption ?? null, mediaId: m.image?.id ?? null, mimeType: m.image?.mime_type ?? null, replyId: null })
            break
          case 'document':
            events.push({ ...base, type: 'document', text: m.document?.caption ?? null, mediaId: m.document?.id ?? null, mimeType: m.document?.mime_type ?? null, replyId: null })
            break
          case 'interactive': {
            const reply = m.interactive?.button_reply ?? m.interactive?.list_reply
            events.push({ ...base, type: 'interactive', text: reply?.title ?? null, mediaId: null, mimeType: null, replyId: reply?.id ?? null })
            break
          }
          case 'button':
            events.push({ ...base, type: 'interactive', text: m.button?.text ?? null, mediaId: null, mimeType: null, replyId: m.button?.payload ?? null })
            break
          default:
            events.push({ ...base, type: 'unsupported', text: null, mediaId: null, mimeType: null, replyId: null })
        }
      }

      for (const s of value.statuses ?? []) {
        if (!STATUSES.has(s.status)) continue
        events.push({
          kind: 'status',
          waMessageId: s.id,
          status: s.status as StatusUpdate['status'],
          timestamp: isoFromUnix(s.timestamp),
          errorCode: s.errors?.[0]?.code ?? null,
        })
      }
    }
  }
  return events
}
