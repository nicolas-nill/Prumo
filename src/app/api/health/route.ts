import { getDataMode, getOpenAIConfig, getWhatsAppConfig } from '@/lib/env'

export const dynamic = 'force-dynamic'

/** Deployment check: which integrations are configured (never their values). */
export async function GET() {
  return Response.json({
    status: 'ok',
    dataMode: getDataMode(),
    integrations: {
      supabaseServer: Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
      openai: getOpenAIConfig() !== null,
      whatsapp: getWhatsAppConfig() !== null,
      cron: Boolean(process.env.CRON_SECRET),
    },
  })
}
