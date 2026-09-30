'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Archive, Ellipsis, RotateCcw, CircleCheckBig } from 'lucide-react'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import type { GoalStatus } from '@/domain/types'
import { setGoalStatusAction } from '@/features/goals/actions'

export function GoalStatusMenu({ goalId, status, name }: { goalId: string; status: GoalStatus; name: string }) {
  const [pending, start] = useTransition()
  const set = (next: 'active' | 'completed' | 'archived', message: string) =>
    start(async () => {
      const result = await setGoalStatusAction(goalId, next)
      if (result.ok) toast.success(message)
      else toast.error(result.error.message)
    })
  return (
    <Menu>
      <MenuTrigger className="inline-flex size-8 items-center justify-center rounded-[9px] text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-50" disabled={pending} aria-label={`Mais ações para ${name}`}>
        <Ellipsis className="size-4" />
      </MenuTrigger>
      <MenuContent>
        {status === 'active' ? (
          <MenuItem onSelect={() => set('completed', 'Meta marcada como concluída.')}>
            <CircleCheckBig /> Marcar como concluída
          </MenuItem>
        ) : (
          <MenuItem onSelect={() => set('active', 'Meta reaberta.')}>
            <RotateCcw /> Reabrir meta
          </MenuItem>
        )}
        {status !== 'archived' ? (
          <MenuItem onSelect={() => set('archived', 'Meta arquivada.')}>
            <Archive /> Arquivar
          </MenuItem>
        ) : null}
      </MenuContent>
    </Menu>
  )
}
