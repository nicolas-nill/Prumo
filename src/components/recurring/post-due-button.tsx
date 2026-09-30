'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { postDueRecurringAction } from '@/features/recurring/actions'

export function PostDueButton({ dueCount }: { dueCount: number }) {
  const [pending, start] = useTransition()
  return (
    <Button
      variant={dueCount ? 'primary' : 'secondary'}
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await postDueRecurringAction()
          if (!result.ok) return void toast.error(result.error.message)
          toast.success(result.data.created ? `${result.data.created} lançamento(s) criados.` : 'Tudo em dia — nada a lançar.')
        })
      }
    >
      <RefreshCw aria-hidden /> {dueCount ? `Lançar ${dueCount} vencida(s)` : 'Verificar vencimentos'}
    </Button>
  )
}
