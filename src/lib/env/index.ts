import { z } from 'zod'

/**
 * Configuration is validated per feature, lazily. A missing OpenAI key must not take
 * down the dashboard; a missing WhatsApp token must only disable WhatsApp. Callers ask
 * for the slice they need and receive either a typed config or a ConfigMissingError
 * naming the exact variables to set.
 */

export class ConfigMissingError extends Error {
  readonly feature: string
  readonly variables: string[]

  constructor(feature: string, variables: string[]) {
    super(`${feature} não está configurado. Defina: ${variables.join(', ')}`)
    this.name = 'ConfigMissingError'
    this.feature = feature
    this.variables = variables
  }
}

const nonEmpty = z.string().trim().min(1)

function read(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() !== '' ? value.trim() : undefined
}

export const isProduction = process.env.NODE_ENV === 'production'

// NEXT_PUBLIC_* must be referenced literally so Next.js can inline them in client bundles.
export function getSupabasePublicConfig(): { url: string; publishableKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !publishableKey) return null
  const parsed = z.object({ url: z.url(), publishableKey: nonEmpty }).safeParse({ url, publishableKey })
  return parsed.success ? parsed.data : null
}

export function requireSupabasePublicConfig() {
  const config = getSupabasePublicConfig()
  if (!config) {
    throw new ConfigMissingError('Supabase', [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    ])
  }
  return config
}

/** Server-only secret key. Bypasses RLS: only used by trusted server pipelines (webhooks, cron). */
export function requireSupabaseSecretConfig(): { url: string; secretKey: string } {
  const pub = requireSupabasePublicConfig()
  const secretKey = read('SUPABASE_SECRET_KEY') ?? read('SUPABASE_SERVICE_ROLE_KEY')
  if (!secretKey) throw new ConfigMissingError('Supabase (servidor)', ['SUPABASE_SECRET_KEY'])
  return { url: pub.url, secretKey }
}

export type DataMode = 'supabase' | 'demo' | 'unconfigured'

/**
 * - PRUMO_DEMO_MODE=on  → in-memory demo data (explicit; shows a banner everywhere)
 * - PRUMO_DEMO_MODE=off → Supabase required
 * - unset               → Supabase when configured; demo in development; "unconfigured" in production
 */
export function getDataMode(): DataMode {
  const flag = read('PRUMO_DEMO_MODE')
  if (flag === 'on') return 'demo'
  const hasSupabase = getSupabasePublicConfig() !== null
  if (flag === 'off') return hasSupabase ? 'supabase' : 'unconfigured'
  if (hasSupabase) return 'supabase'
  return isProduction ? 'unconfigured' : 'demo'
}

export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? read('VERCEL_PROJECT_PRODUCTION_URL')
  if (!url) return 'http://localhost:3000'
  return url.startsWith('http') ? url.replace(/\/$/, '') : `https://${url.replace(/\/$/, '')}`
}

/** Developer tools (WhatsApp simulator) — never available in production unless explicitly enabled. */
export function areDevToolsEnabled(): boolean {
  return !isProduction || read('PRUMO_DEV_TOOLS') === 'true'
}

export interface OpenAIConfig {
  apiKey: string
  baseUrl: string
  textModel: string
  visionModel: string
  transcriptionModel: string
  timeoutMs: number
}

export function getOpenAIConfig(): OpenAIConfig | null {
  const apiKey = read('OPENAI_API_KEY')
  if (!apiKey) return null
  return {
    apiKey,
    baseUrl: (read('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    textModel: read('OPENAI_TEXT_MODEL') ?? 'gpt-5-mini',
    visionModel: read('OPENAI_VISION_MODEL') ?? 'gpt-5-mini',
    transcriptionModel: read('OPENAI_TRANSCRIPTION_MODEL') ?? 'gpt-4o-mini-transcribe',
    timeoutMs: Number(read('OPENAI_TIMEOUT_MS') ?? 20000),
  }
}

export interface WhatsAppConfig {
  verifyToken: string
  appSecret: string
  accessToken: string
  phoneNumberId: string
  graphApiVersion: string
  graphBaseUrl: string
}

const WHATSAPP_VARS = [
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
] as const

export function getWhatsAppConfig(): WhatsAppConfig | null {
  const missing = WHATSAPP_VARS.filter((name) => !read(name))
  if (missing.length > 0) return null
  return {
    verifyToken: read('WHATSAPP_VERIFY_TOKEN')!,
    appSecret: read('WHATSAPP_APP_SECRET')!,
    accessToken: read('WHATSAPP_ACCESS_TOKEN')!,
    phoneNumberId: read('WHATSAPP_PHONE_NUMBER_ID')!,
    graphApiVersion: read('WHATSAPP_GRAPH_API_VERSION') ?? 'v23.0',
    graphBaseUrl: (read('WHATSAPP_GRAPH_BASE_URL') ?? 'https://graph.facebook.com').replace(/\/$/, ''),
  }
}

export function missingWhatsAppVariables(): string[] {
  return WHATSAPP_VARS.filter((name) => !read(name))
}

/** Public display number used in the UI ("envie para ..."). Optional. */
export function getWhatsAppDisplayNumber(): string | null {
  return process.env.NEXT_PUBLIC_WHATSAPP_DISPLAY_NUMBER ?? null
}

export function getCronSecret(): string | null {
  return read('CRON_SECRET') ?? null
}
