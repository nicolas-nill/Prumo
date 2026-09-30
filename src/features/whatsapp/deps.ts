import 'server-only'
import { randomUUID } from 'node:crypto'
import { ConfigMissingError, getDataMode, getOpenAIConfig, getWhatsAppConfig, missingWhatsAppVariables } from '@/lib/env'
import { FIXTURE_AUDIO_MIME, FIXTURE_IMAGE_MIME, FixtureAIProvider } from '@/features/ai/fixtures'
import { OpenAIProvider } from '@/features/ai/openai'
import type { AIProvider } from '@/features/ai/provider'
import { getDemoDb } from '@/server/data/demo/store'
import { getAdminClient } from '@/server/supabase/clients'
import { CaptureTransport, MetaCloudClient, type MediaSource } from './meta/client'
import type { PipelineDeps } from './pipeline'
import type { WhatsAppStore } from './store'
import { DemoWhatsAppStore } from './stores/demo'
import { SupabaseWhatsAppStore } from './stores/supabase'

export function createWhatsAppStore(): WhatsAppStore {
  const mode = getDataMode()
  if (mode === 'demo') return new DemoWhatsAppStore(getDemoDb())
  if (mode === 'supabase') return new SupabaseWhatsAppStore(getAdminClient())
  throw new ConfigMissingError('Supabase', ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'])
}

export function createAIProvider(): AIProvider | null {
  const config = getOpenAIConfig()
  return config ? new OpenAIProvider(config) : null
}

/** Production wiring: Meta transport + media, OpenAI when configured. */
export function createWebhookDeps(): PipelineDeps {
  const config = getWhatsAppConfig()
  if (!config) throw new ConfigMissingError('WhatsApp', missingWhatsAppVariables())
  const meta = new MetaCloudClient(config)
  return { store: createWhatsAppStore(), transport: meta, media: meta, ai: createAIProvider() }
}

// ─── Simulator wiring (development only) ─────────────────────────────────────

interface SimMedia {
  bytes: Uint8Array
  mimeType: string
  expiresAt: number
}

const simStore = globalThis as unknown as { __prumoSimMedia?: Map<string, SimMedia> }
const simMedia = () => (simStore.__prumoSimMedia ??= new Map())

/** Holds simulator uploads in memory for 5 minutes (never written to disk or database). */
export function putSimulatorMedia(bytes: Uint8Array, mimeType: string): string {
  const id = `sim-media-${randomUUID()}`
  const now = Date.now()
  for (const [key, value] of simMedia()) if (value.expiresAt < now) simMedia().delete(key)
  simMedia().set(id, { bytes, mimeType, expiresAt: now + 5 * 60_000 })
  return id
}

class SimulatorMediaSource implements MediaSource {
  async download(mediaId: string) {
    const media = simMedia().get(mediaId)
    if (!media) throw new Error('simulated media expired')
    simMedia().delete(mediaId)
    return { bytes: media.bytes, mimeType: media.mimeType }
  }
}

/** Real provider for real files; deterministic fixtures for the simulator's sample audio/receipts. */
class SimulatorAIProvider implements AIProvider {
  readonly name: string
  readonly capabilities = { text: true, audio: true, vision: true }
  private readonly fixture = new FixtureAIProvider()

  constructor(private readonly real: AIProvider | null) {
    this.name = real?.name ?? 'fixture'
  }

  interpretText: AIProvider['interpretText'] = (text, context) => (this.real ?? this.fixture).interpretText(text, context)
  transcribeAudio: AIProvider['transcribeAudio'] = (audio, mime) =>
    mime === FIXTURE_AUDIO_MIME || !this.real ? this.fixture.transcribeAudio(audio, mime) : this.real.transcribeAudio(audio, mime)
  extractReceipt: AIProvider['extractReceipt'] = (image, mime, context) =>
    mime === FIXTURE_IMAGE_MIME || !this.real ? this.fixture.extractReceipt(image, mime, context) : this.real.extractReceipt(image, mime, context)
}

export function createSimulatorDeps(): PipelineDeps & { transport: CaptureTransport } {
  return { store: createWhatsAppStore(), transport: new CaptureTransport(), media: new SimulatorMediaSource(), ai: new SimulatorAIProvider(createAIProvider()) }
}
