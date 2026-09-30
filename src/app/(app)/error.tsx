'use client'

import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/misc'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('app.render_error', { digest: error.digest })
  }, [error])

  return (
    <Panel className="mx-auto mt-8 max-w-lg px-6 py-10 text-center">
      <p className="text-section-title">Não conseguimos carregar esta página</p>
      <p className="mt-2 text-secondary">Pode ter sido uma instabilidade momentânea. Seus dados continuam seguros.</p>
      {error.digest ? <p className="mt-3 text-caption">Código para suporte: {error.digest}</p> : null}
      <Button className="mt-6" variant="secondary" onClick={reset}>
        <RefreshCw aria-hidden /> Tentar novamente
      </Button>
    </Panel>
  )
}
