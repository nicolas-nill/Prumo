import type { Tone } from '@/domain/types'

// Static class maps so Tailwind can see every class at build time.
const SOFT: Record<Tone, string> = {
  blue: 'bg-tone-blue text-tone-blue-ink',
  rose: 'bg-tone-rose text-tone-rose-ink',
  lilac: 'bg-tone-lilac text-tone-lilac-ink',
  sage: 'bg-tone-sage text-tone-sage-ink',
  sand: 'bg-tone-sand text-tone-sand-ink',
  slate: 'bg-tone-slate text-tone-slate-ink',
}
const SOLID: Record<Tone, string> = {
  blue: 'bg-tone-blue-solid',
  rose: 'bg-tone-rose-solid',
  lilac: 'bg-tone-lilac-solid',
  sage: 'bg-tone-sage-solid',
  sand: 'bg-tone-sand-solid',
  slate: 'bg-tone-slate-solid',
}
const INK: Record<Tone, string> = {
  blue: 'text-tone-blue-ink',
  rose: 'text-tone-rose-ink',
  lilac: 'text-tone-lilac-ink',
  sage: 'text-tone-sage-ink',
  sand: 'text-tone-sand-ink',
  slate: 'text-tone-slate-ink',
}

export const toneSoft = (tone: Tone) => SOFT[tone] ?? SOFT.slate
export const toneSolid = (tone: Tone) => SOLID[tone] ?? SOLID.slate
export const toneInk = (tone: Tone) => INK[tone] ?? INK.slate
export const toneVar = (tone: Tone) => `var(--tone-${tone}-solid)`
