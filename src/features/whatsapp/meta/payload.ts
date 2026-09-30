import { z } from 'zod'

/**
 * WhatsApp Cloud API webhook payload (the subset PRUMO consumes). Parsing is tolerant:
 * unknown fields are ignored and unknown message types become "unsupported" instead of
 * failing the whole delivery.
 */

const media = z.object({ id: z.string(), mime_type: z.string().optional(), sha256: z.string().optional(), caption: z.string().optional() }).passthrough()

const message = z
  .object({
    from: z.string(),
    id: z.string(),
    timestamp: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
    audio: media.extend({ voice: z.boolean().optional() }).optional(),
    image: media.optional(),
    document: media.extend({ filename: z.string().optional() }).optional(),
    interactive: z
      .object({
        type: z.string(),
        button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
        list_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      })
      .optional(),
    button: z.object({ payload: z.string().optional(), text: z.string().optional() }).optional(),
    context: z.object({ id: z.string().optional(), from: z.string().optional() }).optional(),
  })
  .passthrough()

const status = z
  .object({
    id: z.string(),
    status: z.string(),
    timestamp: z.string(),
    recipient_id: z.string().optional(),
    errors: z.array(z.object({ code: z.number().optional(), title: z.string().optional() })).optional(),
  })
  .passthrough()

export const webhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z
            .object({
              messaging_product: z.string().optional(),
              metadata: z.object({ display_phone_number: z.string().optional(), phone_number_id: z.string() }).optional(),
              contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string().optional() }).optional() })).optional(),
              messages: z.array(message).optional(),
              statuses: z.array(status).optional(),
            })
            .passthrough(),
        }),
      ),
    }),
  ),
})

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>
export type MetaMessage = z.infer<typeof message>
