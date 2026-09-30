import type { Interpretation, ReceiptExtraction } from './schemas'

export type AIOperation = 'interpret_text' | 'transcribe_audio' | 'extract_receipt' | 'answer_question'

export interface AIUsage {
  provider: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
  audioSeconds: number | null
  estimatedCostUsdMicros: number | null
  latencyMs: number
}

export interface CategoryOption {
  /** Catalog system key when available, else the category name. */
  key: string
  name: string
  kind: 'income' | 'expense'
}

export interface InterpretContext {
  today: string
  timezone: string
  categories: CategoryOption[]
  cards: string[]
  accounts: string[]
  sharedSpace: boolean
}

/**
 * Every AI call goes through a provider. Pages and pipelines never call vendor APIs directly,
 * so providers can be swapped (OpenAI, another vendor, deterministic fixtures in tests).
 */
export interface AIProvider {
  readonly name: string
  readonly capabilities: { text: boolean; audio: boolean; vision: boolean }
  interpretText(text: string, context: InterpretContext): Promise<{ result: Interpretation; usage: AIUsage }>
  transcribeAudio(audio: Uint8Array, mimeType: string): Promise<{ text: string; usage: AIUsage }>
  extractReceipt(image: Uint8Array, mimeType: string, context: InterpretContext): Promise<{ result: ReceiptExtraction; usage: AIUsage }>
}

export class AIUnavailableError extends Error {
  constructor(readonly capability: 'text' | 'audio' | 'vision') {
    super(`AI capability not configured: ${capability}`)
    this.name = 'AIUnavailableError'
  }
}
