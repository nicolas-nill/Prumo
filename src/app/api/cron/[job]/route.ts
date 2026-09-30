import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { getCronSecret } from '@/lib/env'
import { logger } from '@/lib/observability/logger'
import { runRecurringJob, runRetentionJob } from '@/features/recurring/cron'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JOBS = { recorrencias: runRecurringJob, retencao: runRetentionJob } as const

/** Scheduled jobs (Vercel Cron or any scheduler): Authorization: Bearer ${CRON_SECRET}. */
export async function GET(request: NextRequest, { params }: RouteContext<'/api/cron/[job]'>) {
  const { job } = await params
  const secret = getCronSecret()
  if (!secret) return Response.json({ error: 'cron_not_configured' }, { status: 503 })
  const header = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  if (header.length !== expected.length || !timingSafeEqual(Buffer.from(header), Buffer.from(expected))) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const run = JOBS[job as keyof typeof JOBS]
  if (!run) return Response.json({ error: 'unknown_job' }, { status: 404 })
  try {
    const result = await run()
    return Response.json({ ok: true, job, result })
  } catch (error) {
    logger.error('cron.failed', { job, error })
    return Response.json({ ok: false, job }, { status: 500 })
  }
}
