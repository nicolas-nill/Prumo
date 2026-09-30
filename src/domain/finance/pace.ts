import type { MonthPosition } from '../dates'

/**
 * "Ritmo do mês" — deterministic rule, documented in docs/ARCHITECTURE.md.
 *
 *   consumido  = gasto ÷ planejado
 *   decorrido  = dia atual ÷ dias do mês   (hoje conta como decorrido)
 *   margem     = consumido − decorrido     (em pontos percentuais)
 *
 *   consumido > 100%          → acima do ritmo (orçamento estourado)
 *   margem ≤ +5 p.p.          → no ritmo
 *   margem ≤ +15 p.p.         → atenção
 *   margem > +15 p.p.         → acima do ritmo
 *
 * Past months are judged against 100% (dentro / acima do plano). Future months have no pace.
 * Without a planned amount there is nothing to compare against ("sem plano").
 */

export type PaceStatus = 'on_track' | 'attention' | 'over' | 'no_plan' | 'not_started'

export const PACE_THRESHOLDS = {
  attentionMargin: 0.05,
  overMargin: 0.15,
} as const

export interface PaceInput {
  spentCents: number
  plannedCents: number
  elapsedRatio: number
  position: MonthPosition
}

export interface PaceResult {
  status: PaceStatus
  consumedRatio: number | null
  elapsedRatio: number
  /** consumed − elapsed; positive means spending faster than time. */
  margin: number | null
}

export function classifyPace({ spentCents, plannedCents, elapsedRatio, position }: PaceInput): PaceResult {
  if (plannedCents <= 0) return { status: 'no_plan', consumedRatio: null, elapsedRatio, margin: null }
  const consumedRatio = spentCents / plannedCents
  if (position === 'future') return { status: 'not_started', consumedRatio, elapsedRatio: 0, margin: null }

  const reference = position === 'past' ? 1 : elapsedRatio
  // Compare in whole basis points so documented thresholds are exact (no float drift at the edges).
  const marginBp = Math.round((consumedRatio - reference) * 10_000)
  const margin = marginBp / 10_000

  let status: PaceStatus
  if (spentCents > plannedCents) status = 'over'
  else if (position === 'past') status = 'on_track'
  else if (marginBp <= PACE_THRESHOLDS.attentionMargin * 10_000) status = 'on_track'
  else if (marginBp <= PACE_THRESHOLDS.overMargin * 10_000) status = 'attention'
  else status = 'over'

  return { status, consumedRatio, elapsedRatio: reference, margin }
}

export function paceLabel(status: PaceStatus, position: MonthPosition): string {
  if (position === 'past') {
    if (status === 'over') return 'Acima do plano'
    if (status === 'on_track') return 'Dentro do plano'
  }
  switch (status) {
    case 'on_track':
      return 'No ritmo'
    case 'attention':
      return 'Atenção'
    case 'over':
      return 'Acima do ritmo'
    case 'no_plan':
      return 'Sem plano'
    case 'not_started':
      return 'Não iniciado'
  }
}
