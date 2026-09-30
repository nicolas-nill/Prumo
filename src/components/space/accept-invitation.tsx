'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/misc'
import { acceptInvitationAction } from '@/features/couples/actions'

export function AcceptInvitationForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="mt-8 flex flex-col gap-3">
      {error ? <InlineError title={error} /> : null}
      <Button
        size="lg"
        loading={pending}
        onClick={() =>
          start(async () => {
            const result = await acceptInvitationAction(token)
            if (result && !result.ok) setError(result.error.message)
          })
        }
      >
        Aceitar convite
      </Button>
    </div>
  )
}
