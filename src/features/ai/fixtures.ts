import { AIUnavailableError, type AIProvider, type AIUsage, type InterpretContext } from './provider'
import { interpretWithRules } from './rules'
import { receiptSchema } from './schemas'

/**
 * Deterministic provider for the local simulator and tests — used ONLY when no real AI key
 * is configured, and clearly labelled as such in the simulator UI.
 *  - text: the rule-based interpreter;
 *  - audio: the "audio" bytes are a UTF-8 transcript fixture (simulated voice note);
 *  - image: the "image" bytes are a JSON receipt fixture (simulated photo).
 * Real audio/images are refused: the fixture provider cannot see or hear.
 */

const usage = (model: string): AIUsage => ({
  provider: 'fixture',
  model,
  inputTokens: null,
  outputTokens: null,
  audioSeconds: null,
  estimatedCostUsdMicros: 0,
  latencyMs: 0,
})

export const FIXTURE_AUDIO_MIME = 'application/x-prumo-transcript'
export const FIXTURE_IMAGE_MIME = 'application/x-prumo-receipt'

export class FixtureAIProvider implements AIProvider {
  readonly name = 'fixture'
  readonly capabilities = { text: true, audio: true, vision: true }

  async interpretText(text: string, context: InterpretContext) {
    return { result: interpretWithRules(text, context), usage: usage('rules') }
  }

  async transcribeAudio(audio: Uint8Array, mimeType: string) {
    if (mimeType !== FIXTURE_AUDIO_MIME) throw new AIUnavailableError('audio')
    return { text: new TextDecoder().decode(audio), usage: usage('fixture-transcriber') }
  }

  async extractReceipt(image: Uint8Array, mimeType: string, _context?: InterpretContext) {
    if (mimeType !== FIXTURE_IMAGE_MIME) throw new AIUnavailableError('vision')
    return { result: receiptSchema.parse(JSON.parse(new TextDecoder().decode(image))), usage: usage('fixture-vision') }
  }
}

/** Receipt fixtures offered by the simulator ("simular foto de comprovante"). */
export const RECEIPT_FIXTURES = [
  {
    id: 'mercado',
    label: 'Cupom de supermercado',
    extraction: { isReceipt: true, merchant: 'Supermercado Pão de Açúcar', totalText: '187,45', date: null, categoryKey: 'groceries', paymentHint: 'crédito', installments: null, confidence: 0.92 },
  },
  {
    id: 'farmacia',
    label: 'Comprovante de farmácia',
    extraction: { isReceipt: true, merchant: 'Drogasil', totalText: '63,90', date: null, categoryKey: 'health', paymentHint: 'débito', installments: null, confidence: 0.9 },
  },
  {
    id: 'pix',
    label: 'Comprovante de Pix (ilegível)',
    extraction: { isReceipt: true, merchant: null, totalText: '250,00', date: null, categoryKey: null, paymentHint: 'pix', installments: null, confidence: 0.55 },
  },
  {
    id: 'foto',
    label: 'Foto que não é comprovante',
    extraction: { isReceipt: false, merchant: null, totalText: null, date: null, categoryKey: null, paymentHint: null, installments: null, confidence: 0.95 },
  },
] as const
