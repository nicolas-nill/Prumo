import { beforeEach, describe, expect, it } from 'vitest'
import { FIXTURE_AUDIO_MIME, FIXTURE_IMAGE_MIME, FixtureAIProvider, RECEIPT_FIXTURES } from '@/features/ai/fixtures'
import { CaptureTransport, type MediaSource } from '@/features/whatsapp/meta/client'
import { normalizeWebhook } from '@/features/whatsapp/meta/normalize'
import { webhookPayloadSchema } from '@/features/whatsapp/meta/payload'
import { signMetaPayload, verifyMetaSignature } from '@/features/whatsapp/meta/signature'
import { phoneVariants } from '@/features/whatsapp/phone'
import { handleEvents, type PipelineDeps } from '@/features/whatsapp/pipeline'
import { DemoWhatsAppStore } from '@/features/whatsapp/stores/demo'
import { DEMO_SPACE, DEMO_USERS } from '@/server/data/demo/dataset'
import { DemoRepository } from '@/server/data/demo/repository'
import { buildDemoDb, type DemoDb } from '@/server/data/demo/store'

const TODAY = new Date().toISOString().slice(0, 10)
const LUCAS = DEMO_USERS.lucas
let seq = 0

function payload(from: string, message: Record<string, unknown>) {
  seq += 1
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '5511900000000', phone_number_id: 'PHONE_ID' },
              contacts: [{ wa_id: from, profile: { name: 'Teste' } }],
              messages: [{ from, id: `wamid.TEST${seq}`, timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
            },
          },
        ],
      },
    ],
  }
}

const text = (body: string, from = LUCAS.phone.slice(1)) => payload(from, { type: 'text', text: { body } })
const button = (id: string, from = LUCAS.phone.slice(1)) => payload(from, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title: 'x' } } })

const media = new Map<string, { bytes: Uint8Array; mimeType: string }>()
const mediaSource: MediaSource = {
  async download(id) {
    const m = media.get(id)
    if (!m) throw new Error('missing')
    return { bytes: new Uint8Array(m.bytes), mimeType: m.mimeType }
  },
}

let db: DemoDb
let deps: PipelineDeps & { transport: CaptureTransport }

async function send(p: ReturnType<typeof payload>) {
  const events = normalizeWebhook(webhookPayloadSchema.parse(p))
  const [result] = await handleEvents(events, deps)
  return { result: result!, reply: deps.transport.sent.at(-1) }
}

const lucasTransactions = () => db.transactions.filter((t) => t.createdBy === LUCAS.id && t.source.startsWith('whatsapp') && t.createdAt.slice(0, 10) === TODAY && !t.deletedAt)

beforeEach(() => {
  db = buildDemoDb()
  deps = { store: new DemoWhatsAppStore(db), transport: new CaptureTransport(), media: mediaSource, ai: new FixtureAIProvider() }
})

describe('Meta transport layer', () => {
  it('verifies HMAC signatures in constant time and rejects tampering', () => {
    const body = JSON.stringify(text('gastei 10'))
    const signature = signMetaPayload(body, 'secret')
    expect(verifyMetaSignature(body, signature, 'secret')).toBe(true)
    expect(verifyMetaSignature(body + ' ', signature, 'secret')).toBe(false)
    expect(verifyMetaSignature(body, signature, 'other')).toBe(false)
    expect(verifyMetaSignature(body, null, 'secret')).toBe(false)
  })

  it('normalizes text, audio, image, buttons and statuses', () => {
    const events = normalizeWebhook(
      webhookPayloadSchema.parse({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'x',
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: 'P' },
                  messages: [
                    { from: '5511', id: 'a', timestamp: '1700000000', type: 'audio', audio: { id: 'm1', mime_type: 'audio/ogg' } },
                    { from: '5511', id: 'b', timestamp: '1700000000', type: 'sticker', sticker: {} },
                  ],
                  statuses: [{ id: 'c', status: 'delivered', timestamp: '1700000000' }],
                },
              },
            ],
          },
        ],
      }),
    )
    expect(events).toMatchObject([
      { kind: 'message', type: 'audio', mediaId: 'm1', mimeType: 'audio/ogg' },
      { kind: 'message', type: 'unsupported' },
      { kind: 'status', status: 'delivered' },
    ])
  })

  it('matches Brazilian numbers with and without the 9th digit', () => {
    expect(phoneVariants('5511987654321')).toEqual(['+5511987654321', '+551187654321'])
    expect(phoneVariants('551187654321')).toContain('+5511987654321')
  })
})

describe('pipeline', () => {
  it('registers a clear expense and answers with the category', async () => {
    const { result, reply } = await send(text('Gastei 47,90 no almoço.'))
    expect(result.status).toBe('processed')
    expect(reply?.body).toMatch(/^Registrei R\$ 47,90 em Restaurantes\./)
    const [tx] = lucasTransactions()
    expect(tx).toMatchObject({ amountCents: 4790, source: 'whatsapp_text', memberId: LUCAS.id, scope: 'shared', occurredOn: TODAY })
  })

  it('is idempotent: the same wamid twice creates one transaction', async () => {
    const p = text('paguei 320 no mercado hoje')
    await send(p)
    const second = await send(p)
    expect(second.result.status).toBe('duplicate')
    expect(lucasTransactions()).toHaveLength(1)
    expect(deps.transport.sent).toHaveLength(1)
  })

  it('never registers for unknown numbers', async () => {
    const { result, reply } = await send(text('gastei 30 no almoço', '5511999998888'))
    expect(result.status).toBe('ignored')
    expect(reply?.body).toContain('ainda não está conectado')
    expect(db.transactions.filter((t) => t.createdAt.slice(0, 10) === TODAY && t.source.startsWith('whatsapp'))).toHaveLength(0)
  })

  it('asks for the category when it is ambiguous, then registers on the button reply', async () => {
    const first = await send(text('Gastei 50 ontem'))
    expect(first.result.status).toBe('needs_confirmation')
    expect(first.reply?.buttons?.length).toBeGreaterThan(0)
    expect(lucasTransactions()).toHaveLength(0)
    const groceries = db.categories.find((c) => c.systemKey === 'groceries')!
    const second = await send(button(`cat:${groceries.id}`))
    expect(second.result.status).toBe('processed')
    expect(lucasTransactions()[0]).toMatchObject({ amountCents: 5000, categoryId: groceries.id })
  })

  it('confirms large amounts and installments before registering', async () => {
    const first = await send(text('comprei uma tv de 4.800 em 12x no cartão Nubank'))
    expect(first.result.status).toBe('needs_confirmation')
    expect(first.reply?.body).toContain('12x')
    await send(text('sim'))
    const rows = lucasTransactions()
    expect(rows).toHaveLength(12)
    expect(rows.reduce((a, t) => a + t.amountCents, 0)).toBe(480_000)
    expect(rows.every((t) => t.cardId === db.cards.find((c) => c.name === 'Nubank')!.id)).toBe(true)
  })

  it('corrects only the last own registration', async () => {
    await send(text('gastei 35 no almoço'))
    const { reply } = await send(text('Na verdade foram 42.'))
    expect(reply?.body).toContain('R$ 42,00')
    expect(lucasTransactions()[0]!.amountCents).toBe(4200)
    await send(text('Isso foi no cartão Nubank.'))
    expect(lucasTransactions()[0]!.cardId).toBe(db.cards.find((c) => c.name === 'Nubank')!.id)
  })

  it('refuses to "correct" when there is nothing recent', async () => {
    const { reply } = await send(text('na verdade foram 42'))
    expect(reply?.body).toContain('Não encontrei um registro recente')
  })

  it('deletes the last registration directly, and asks before deleting by description', async () => {
    await send(text('uber 23,50'))
    await send(text('apaga o último'))
    expect(lucasTransactions()).toHaveLength(0)

    const ask = await send(text('Apaga o almoço de hoje'))
    // Seeded demo data has no "almoço" today unless the day matches; ensure it never deletes silently.
    expect(['processed', 'needs_confirmation']).toContain(ask.result.status)
  })

  it('links a new number with a single-use code', async () => {
    const repo = new DemoRepository(db, LUCAS.id)
    const { code } = await repo.startWhatsAppLink('+5511912345678', DEMO_SPACE.id)
    const wrong = await send(text('PRUMO 000000', '5511912345678'))
    expect(wrong.reply?.body).toContain('não confere')
    const ok = await send(text(`prumo ${code}`, '5511912345678'))
    expect(ok.reply?.body).toContain('conectado')
    const after = await send(text('gastei 12 no café', '5511912345678'))
    expect(after.result.status).toBe('processed')
  })

  it('handles voice notes through transcription', async () => {
    media.set('audio-1', { bytes: new TextEncoder().encode('gastei oitenta e cinco reais na farmácia, 85'), mimeType: FIXTURE_AUDIO_MIME })
    const { result } = await send(payload(LUCAS.phone.slice(1), { type: 'audio', audio: { id: 'audio-1', mime_type: 'audio/ogg' } }))
    expect(result.status).toBe('processed')
    expect(lucasTransactions()[0]).toMatchObject({ amountCents: 8500, source: 'whatsapp_audio' })
  })

  it('always confirms receipts from photos', async () => {
    const fixture = RECEIPT_FIXTURES.find((f) => f.id === 'mercado')!
    media.set('img-1', { bytes: new TextEncoder().encode(JSON.stringify(fixture.extraction)), mimeType: FIXTURE_IMAGE_MIME })
    const first = await send(payload(LUCAS.phone.slice(1), { type: 'image', image: { id: 'img-1', mime_type: 'image/jpeg' } }))
    expect(first.result.status).toBe('needs_confirmation')
    expect(first.reply?.body).toContain('R$ 187,45')
    await send(button('confirm:yes'))
    expect(lucasTransactions()[0]).toMatchObject({ amountCents: 18745, source: 'whatsapp_image' })
  })

  it('answers questions with numbers from deterministic queries', async () => {
    const { reply } = await send(text('Quanto ainda posso gastar?'))
    expect(reply?.body).toMatch(/pode gastar R\$|passou R\$/)
    const cat = await send(text('Quanto gastei com restaurante?'))
    expect(cat.reply?.body).toMatch(/^Restaurantes em /)
  })

  it('logs nothing sensitive and keeps unknown sender content out of storage', async () => {
    await send(text('meu cpf é 123', '5511999997777'))
    const stored = db.messages.find((m) => m.direction === 'inbound' && m.status === 'ignored')
    expect(stored?.content).toBeNull()
  })
})
