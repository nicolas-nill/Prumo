import { FlaskConical } from 'lucide-react'
import { getDataMode } from '@/lib/env'

/** Persistent notice whenever fictitious in-memory data is being shown. */
export function DemoBanner() {
  if (getDataMode() !== 'demo') return null
  return (
    <div className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-center text-xs font-medium text-warning">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span>Modo demonstração — dados fictícios, em memória. Nada aqui é salvo em banco.</span>
    </div>
  )
}
