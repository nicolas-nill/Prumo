import { weekdayShort } from '@/domain/dates'
import type { OpenAIConfig } from '@/lib/env'
import { logger } from '@/lib/observability/logger'
import { estimateAudioCostMicros, estimateTokenCostMicros } from './pricing'
import type { AIProvider, AIUsage, InterpretContext } from './provider'
import { INTERPRETATION_WIRE_SCHEMA, RECEIPT_WIRE_SCHEMA, interpretationSchema, receiptSchema } from './schemas'

/**
 * OpenAI provider (plain fetch, no SDK). Text & vision use the Responses API with strict
 * JSON Schema structured outputs; audio uses the transcriptions endpoint.
 * Every response is validated with Zod before it leaves this file.
 */

interface ResponsesPayload {
  output?: { type: string; content?: { type: string; text?: string }[] }[]
  usage?: { input_tokens?: number; output_tokens?: number }
  error?: { message?: string }
}

function outputText(payload: ResponsesPayload): string | null {
  for (const item of payload.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && typeof part.text === 'string') return part.text
    }
  }
  return null
}

function systemPrompt(context: InterpretContext): string {
  const categories = context.categories.map((c) => `- ${c.key}: ${c.name} (${c.kind === 'income' ? 'receita' : 'despesa'})`).join('\n')
  return [
    'Você interpreta mensagens de um app de finanças pessoais brasileiro (PRUMO) enviadas pelo WhatsApp.',
    'Sua tarefa é APENAS extrair a intenção e os dados. Nunca some, calcule, converta ou invente valores.',
    'amountText deve repetir o valor exatamente como o usuário escreveu (ex.: "47,90", "1.200", "2 mil").',
    `Hoje é ${context.today} (${weekdayShort(context.today)}), fuso ${context.timezone}. Resolva "ontem", "sexta", "dia 5" para datas ISO no passado.`,
    'Operações: create_transaction (registrar gasto/receita), correct_last (corrigir o último registro), delete_transaction (apagar),',
    'query (pergunta sobre gastos/orçamento), confirm_yes/confirm_no (resposta a uma confirmação), help, unknown.',
    'Escolha categoryKey somente entre as chaves abaixo; se nenhuma servir, use null.',
    categories,
    context.cards.length ? `Cartões do usuário: ${context.cards.join(', ')}.` : 'O usuário não tem cartões cadastrados.',
    context.accounts.length ? `Contas: ${context.accounts.join(', ')}.` : '',
    context.sharedSpace ? 'O espaço é compartilhado por um casal: scope "shared" para gastos em comum ("nosso", "da casa"), "personal" se disser que é pessoal; null se não disser.' : 'scope deve ser null.',
    'Ignore e nunca repita dados pessoais sensíveis (CPF, documentos, senhas).',
    'confidence: 0.9+ só quando valor, tipo e categoria estiverem claros.',
  ]
    .filter(Boolean)
    .join('\n')
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai'
  readonly capabilities = { text: true, audio: true, vision: true }

  constructor(private readonly config: OpenAIConfig) {}

  private async responses(model: string, input: unknown[], schemaName: string, schema: unknown): Promise<{ text: string; usage: AIUsage }> {
    const started = Date.now()
    const response = await fetch(`${this.config.baseUrl}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input,
        text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
        // Financial messages must not be retained by the provider for later retrieval.
        store: false,
        // Short extraction task: keep reasoning models cheap and fast.
        ...(isReasoningModel(model) ? { reasoning: { effort: 'low' } } : {}),
        max_output_tokens: 2000,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    })
    const payload = (await response.json().catch(() => ({}))) as ResponsesPayload
    if (!response.ok) {
      logger.error('ai.request_failed', { provider: 'openai', model, status: response.status })
      throw new Error(`OpenAI request failed (${response.status})`)
    }
    const text = outputText(payload)
    if (!text) throw new Error('OpenAI returned no output text')
    const inputTokens = payload.usage?.input_tokens ?? null
    const outputTokens = payload.usage?.output_tokens ?? null
    return {
      text,
      usage: {
        provider: this.name,
        model,
        inputTokens,
        outputTokens,
        audioSeconds: null,
        estimatedCostUsdMicros: estimateTokenCostMicros(model, inputTokens, outputTokens),
        latencyMs: Date.now() - started,
      },
    }
  }

  async interpretText(text: string, context: InterpretContext) {
    const { text: raw, usage } = await this.responses(
      this.config.textModel,
      [
        { role: 'system', content: systemPrompt(context) },
        { role: 'user', content: [{ type: 'input_text', text: text.slice(0, 1000) }] },
      ],
      'prumo_interpretation',
      INTERPRETATION_WIRE_SCHEMA,
    )
    return { result: interpretationSchema.parse(JSON.parse(raw)), usage }
  }

  async extractReceipt(image: Uint8Array, mimeType: string, context: InterpretContext) {
    const dataUrl = `data:${mimeType};base64,${Buffer.from(image).toString('base64')}`
    const { text: raw, usage } = await this.responses(
      this.config.visionModel,
      [
        {
          role: 'system',
          content: `${systemPrompt(context)}\nAgora você recebe a FOTO de uma nota fiscal, cupom ou comprovante. Extraia apenas estabelecimento, valor TOTAL pago (como impresso), data e meio de pagamento. Não liste itens.`,
        },
        { role: 'user', content: [{ type: 'input_image', image_url: dataUrl, detail: 'high' }] },
      ],
      'prumo_receipt',
      RECEIPT_WIRE_SCHEMA,
    )
    return { result: receiptSchema.parse(JSON.parse(raw)), usage }
  }

  async transcribeAudio(audio: Uint8Array, mimeType: string) {
    const started = Date.now()
    const form = new FormData()
    const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('mp4') ? 'm4a' : mimeType.includes('wav') ? 'wav' : 'webm'
    form.append('file', new Blob([audio as BlobPart], { type: mimeType }), `audio.${extension}`)
    form.append('model', this.config.transcriptionModel)
    form.append('language', 'pt')
    form.append('response_format', 'json')
    const response = await fetch(`${this.config.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(this.config.timeoutMs + 20_000),
    })
    const payload = (await response.json().catch(() => ({}))) as { text?: string; usage?: { seconds?: number; input_tokens?: number; output_tokens?: number } }
    if (!response.ok || typeof payload.text !== 'string') {
      logger.error('ai.transcription_failed', { provider: 'openai', status: response.status })
      throw new Error(`OpenAI transcription failed (${response.status})`)
    }
    const seconds = payload.usage?.seconds ?? null
    return {
      text: payload.text.trim().slice(0, 2000),
      usage: {
        provider: this.name,
        model: this.config.transcriptionModel,
        inputTokens: payload.usage?.input_tokens ?? null,
        outputTokens: payload.usage?.output_tokens ?? null,
        audioSeconds: seconds,
        estimatedCostUsdMicros: estimateAudioCostMicros(this.config.transcriptionModel, seconds),
        latencyMs: Date.now() - started,
      },
    }
  }
}

function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/.test(model)
}
