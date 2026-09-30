'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { areDevToolsEnabled } from '@/lib/env'
import { AppError, runAction } from '@/lib/errors'
import { FIXTURE_AUDIO_MIME, FIXTURE_IMAGE_MIME, RECEIPT_FIXTURES } from '@/features/ai/fixtures'
import { requireViewer } from '@/server/session'
import { DEMO_USERS } from '@/server/data/demo/dataset'
import { createSimulatorDeps, putSimulatorMedia } from './deps'
import { normalizeWebhook } from './meta/normalize'
import { webhookPayloadSchema } from './meta/payload'
import { handleEvents } from './pipeline'

const inputSchema = z.object({
  from: z.string().regex(/^\+?\d{10,15}$/, 'Número inválido'),
  kind: z.enum(['text', 'audio_fixture', 'image_fixture', 'button', 'file']),
  text: z.string().max(1000).optional(),
  fixtureId: z.string().optional(),
  buttonId: z.string().max(80).optional(),
  contextId: z.string().max(200).optional(),
})

export interface SimulatorResult {
  waMessageId: string
  status: string
  source: string | null
  intent: unknown
  transactionIds: string[]
  replies: { body: string; buttons?: { id: string; title: string }[]; waMessageId: string }[]
  provider: string
}

/**
 * Builds a payload in the exact shape Meta sends and pushes it through the SAME
 * normalize → pipeline path as the real webhook. Only the outbound transport differs
 * (replies are captured and returned instead of sent). Development tool: disabled in
 * production unless PRUMO_DEV_TOOLS=true.
 */
export async function simulateWhatsAppAction(formData: FormData) {
  return runAction('whatsapp.simulate', async (): Promise<SimulatorResult> => {
    if (!areDevToolsEnabled()) throw new AppError('FORBIDDEN', 'O simulador está desativado neste ambiente.')
    const viewer = await requireViewer()
    const input = inputSchema.parse({
      from: formData.get('from'),
      kind: formData.get('kind'),
      text: formData.get('text') ?? undefined,
      fixtureId: formData.get('fixtureId') ?? undefined,
      buttonId: formData.get('buttonId') ?? undefined,
      contextId: formData.get('contextId') || undefined,
    })
    const from = input.from.replace(/^\+/, '')

    // Outside the demo, only the viewer's own numbers (or unknown numbers) can be simulated.
    if (viewer.mode === 'supabase') {
      const own = (await viewer.repo.listWhatsAppIdentities()).map((i) => i.phoneE164.slice(1))
      const knownOthers = Object.values(DEMO_USERS).map((u) => u.phone.slice(1))
      if (knownOthers.includes(from) && !own.includes(from)) throw new AppError('FORBIDDEN', 'Simule apenas os seus números.')
    }

    const waMessageId = `wamid.SIM-${randomUUID()}`
    let message: Record<string, unknown>
    switch (input.kind) {
      case 'text':
        message = { type: 'text', text: { body: input.text ?? '' } }
        break
      case 'button':
        message = { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: input.buttonId ?? '', title: input.text ?? '' } } }
        break
      case 'audio_fixture': {
        const id = putSimulatorMedia(new TextEncoder().encode(input.text ?? ''), FIXTURE_AUDIO_MIME)
        message = { type: 'audio', audio: { id, mime_type: 'audio/ogg; codecs=opus', voice: true } }
        break
      }
      case 'image_fixture': {
        const fixture = RECEIPT_FIXTURES.find((f) => f.id === input.fixtureId)
        if (!fixture) throw new AppError('VALIDATION', 'Comprovante de exemplo inválido.')
        const id = putSimulatorMedia(new TextEncoder().encode(JSON.stringify(fixture.extraction)), FIXTURE_IMAGE_MIME)
        message = { type: 'image', image: { id, mime_type: 'image/jpeg', caption: input.text || undefined } }
        break
      }
      case 'file': {
        const file = formData.get('file')
        if (!(file instanceof File) || file.size === 0) throw new AppError('VALIDATION', 'Escolha um arquivo.')
        if (file.size > 5 * 1024 * 1024) throw new AppError('VALIDATION', 'Arquivo acima de 5 MB.')
        const isAudio = file.type.startsWith('audio/')
        const isImage = file.type.startsWith('image/')
        if (!isAudio && !isImage) throw new AppError('VALIDATION', 'Envie um áudio ou uma imagem.')
        const id = putSimulatorMedia(new Uint8Array(await file.arrayBuffer()), file.type)
        message = isAudio ? { type: 'audio', audio: { id, mime_type: file.type } } : { type: 'image', image: { id, mime_type: file.type } }
        break
      }
    }

    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'SIMULATOR',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: 'simulador', phone_number_id: 'SIMULATOR' },
                contacts: [{ wa_id: from, profile: { name: 'Simulador' } }],
                messages: [
                  {
                    from,
                    id: waMessageId,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    ...(input.contextId ? { context: { id: input.contextId } } : {}),
                    ...message,
                  },
                ],
              },
            },
          ],
        },
      ],
    }

    const deps = createSimulatorDeps()
    const [result] = await handleEvents(normalizeWebhook(webhookPayloadSchema.parse(payload)), deps)
    revalidatePath('/', 'layout')
    return {
      waMessageId,
      status: result?.status ?? 'unknown',
      source: result?.source ?? null,
      intent: result?.intent ?? null,
      transactionIds: result?.transactionIds ?? [],
      replies: deps.transport.sent.map((m) => ({ body: m.body, buttons: m.buttons, waMessageId: m.waMessageId })),
      provider: deps.ai?.name ?? 'rules',
    }
  })
}
