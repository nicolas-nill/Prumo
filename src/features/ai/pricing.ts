/**
 * Cost ESTIMATES in USD per 1M tokens (or per audio minute) used to measure cost per user
 * and design plans. Prices change: review against the vendor's pricing page (see docs/AI.md).
 * Unknown models return null rather than a wrong number.
 */
const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-5': { input: 1.25, output: 10.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
}

const AUDIO_PER_MINUTE: Record<string, number> = {
  'gpt-4o-mini-transcribe': 0.003,
  'gpt-4o-transcribe': 0.006,
  'whisper-1': 0.006,
}

export function estimateTokenCostMicros(model: string, inputTokens: number | null, outputTokens: number | null): number | null {
  const price = TOKEN_PRICES[model] ?? TOKEN_PRICES[model.replace(/-\d{4}-\d{2}-\d{2}$/, '')]
  if (!price || inputTokens === null || outputTokens === null) return null
  return Math.round(inputTokens * price.input + outputTokens * price.output)
}

export function estimateAudioCostMicros(model: string, seconds: number | null): number | null {
  const perMinute = AUDIO_PER_MINUTE[model]
  if (perMinute === undefined || seconds === null) return null
  return Math.round((seconds / 60) * perMinute * 1_000_000)
}
