import type { WhatsAppConfig } from '@/lib/env'
import { logger, maskPhone } from '@/lib/observability/logger'

/** Outbound transport. The pipeline never talks to Meta directly — only through this. */
export interface WhatsAppTransport {
  readonly kind: 'meta' | 'capture'
  sendText(to: string, body: string, options?: { replyTo?: string }): Promise<{ waMessageId: string | null }>
  /** Up to 3 quick-reply buttons (WhatsApp limit). Titles ≤ 20 chars. */
  sendButtons(to: string, body: string, buttons: { id: string; title: string }[], options?: { replyTo?: string }): Promise<{ waMessageId: string | null }>
  markAsRead(waMessageId: string): Promise<void>
}

export interface MediaSource {
  /** Downloads media bytes. Never persisted by PRUMO — processed in memory and discarded. */
  download(mediaId: string): Promise<{ bytes: Uint8Array; mimeType: string }>
}

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024
// Media URLs returned by the Graph API live on Meta CDNs; anything else is refused (SSRF guard).
const MEDIA_HOSTS = [/\.fbsbx\.com$/, /\.whatsapp\.net$/, /\.facebook\.com$/, /\.fbcdn\.net$/]

export class MetaCloudClient implements WhatsAppTransport, MediaSource {
  readonly kind = 'meta' as const

  constructor(private readonly config: WhatsAppConfig) {}

  private get base() {
    return `${this.config.graphBaseUrl}/${this.config.graphApiVersion}`
  }

  private async post(body: Record<string, unknown>): Promise<{ waMessageId: string | null }> {
    const response = await fetch(`${this.base}/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { error?: { code?: number; error_subcode?: number } } | null
      logger.error('whatsapp.send_failed', { status: response.status, code: detail?.error?.code, subcode: detail?.error?.error_subcode })
      throw new Error(`WhatsApp send failed (${response.status})`)
    }
    const json = (await response.json()) as { messages?: { id: string }[] }
    return { waMessageId: json.messages?.[0]?.id ?? null }
  }

  async sendText(to: string, body: string, options?: { replyTo?: string }) {
    logger.info('whatsapp.send_text', { to: maskPhone(to) })
    return this.post({
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body, preview_url: false },
      ...(options?.replyTo ? { context: { message_id: options.replyTo } } : {}),
    })
  }

  async sendButtons(to: string, body: string, buttons: { id: string; title: string }[], options?: { replyTo?: string }) {
    logger.info('whatsapp.send_buttons', { to: maskPhone(to), buttons: buttons.length })
    return this.post({
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })) },
      },
      ...(options?.replyTo ? { context: { message_id: options.replyTo } } : {}),
    })
  }

  async markAsRead(waMessageId: string) {
    await this.post({ status: 'read', message_id: waMessageId }).catch(() => undefined)
  }

  async download(mediaId: string) {
    const meta = await fetch(`${this.base}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!meta.ok) throw new Error(`media lookup failed (${meta.status})`)
    const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number }
    if (!info.url) throw new Error('media url missing')
    const host = new URL(info.url).hostname
    if (!MEDIA_HOSTS.some((re) => re.test(host))) throw new Error('unexpected media host')
    if (info.file_size && info.file_size > MAX_MEDIA_BYTES) throw new Error('media too large')

    const file = await fetch(info.url, { headers: { Authorization: `Bearer ${this.config.accessToken}` }, signal: AbortSignal.timeout(20_000) })
    if (!file.ok) throw new Error(`media download failed (${file.status})`)
    const buffer = new Uint8Array(await file.arrayBuffer())
    if (buffer.byteLength > MAX_MEDIA_BYTES) throw new Error('media too large')
    return { bytes: buffer, mimeType: info.mime_type ?? file.headers.get('content-type') ?? 'application/octet-stream' }
  }
}

export interface CapturedMessage {
  to: string
  body: string
  buttons?: { id: string; title: string }[]
  waMessageId: string
}

/** Transport used by the local simulator and tests: records replies instead of sending. */
export class CaptureTransport implements WhatsAppTransport {
  readonly kind = 'capture' as const
  readonly sent: CapturedMessage[] = []
  private counter = 0

  private id() {
    this.counter += 1
    return `wamid.SIM-OUT-${Date.now()}-${this.counter}`
  }

  async sendText(to: string, body: string) {
    const waMessageId = this.id()
    this.sent.push({ to, body, waMessageId })
    return { waMessageId }
  }

  async sendButtons(to: string, body: string, buttons: { id: string; title: string }[]) {
    const waMessageId = this.id()
    this.sent.push({ to, body, buttons, waMessageId })
    return { waMessageId }
  }

  async markAsRead() {}
}
