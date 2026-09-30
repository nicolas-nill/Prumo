import type { Tone } from '@/domain/types'
import { cn } from '@/lib/utils/cn'
import { toneSolid } from './tone'

interface ProgressProps {
  /** 0..1 (values above 1 render full, in the textured danger style). */
  value: number | null
  /** Optional 0..1 marker, e.g. how much of the month has passed. */
  marker?: number | null
  tone?: Tone | 'primary' | 'success' | 'warning' | 'danger'
  size?: 'sm' | 'md'
  label: string
  className?: string
}

const TONE_CLASS: Record<string, string> = {
  primary: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

export function Progress({ value, marker, tone = 'primary', size = 'md', label, className }: ProgressProps) {
  const ratio = value === null ? 0 : Math.max(0, value)
  const over = ratio > 1
  const fill = over ? 'bar-over' : (TONE_CLASS[tone] ?? toneSolid(tone as Tone))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(Math.min(ratio, 1) * 100)}
      className={cn('relative w-full rounded-full bg-track', size === 'sm' ? 'h-1.5' : 'h-2', className)}
    >
      <div
        className={cn('h-full origin-left rounded-full transition-[width] duration-500 ease-out', fill)}
        style={{ width: `${Math.min(ratio, 1) * 100}%` }}
      />
      {marker !== null && marker !== undefined && marker > 0 && marker < 1 ? (
        <span
          aria-hidden
          className="absolute -top-1 w-px bg-[var(--pace-marker)]"
          style={{ left: `${marker * 100}%`, height: size === 'sm' ? '14px' : '16px' }}
        />
      ) : null}
    </div>
  )
}
