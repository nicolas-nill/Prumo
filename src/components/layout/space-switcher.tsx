'use client'

import { useTransition } from 'react'
import { Check, ChevronsUpDown, Plus, User, Users } from 'lucide-react'
import Link from 'next/link'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { switchSpaceAction } from '@/features/spaces/actions'
import { cn } from '@/lib/utils/cn'

export interface SpaceOption {
  id: string
  name: string
  type: 'personal' | 'shared'
  memberCount: number
}

export function SpaceSwitcher({ current, spaces, compact }: { current: { id: string; name: string; type: 'personal' | 'shared' }; spaces: SpaceOption[]; compact?: boolean }) {
  const [pending, start] = useTransition()
  const Icon = current.type === 'shared' ? Users : User

  if (spaces.length <= 1 && compact) {
    return <span className="truncate text-sm font-medium text-fg-muted">{current.name}</span>
  }

  return (
    <Menu>
      <MenuTrigger
        className={cn(
          'flex min-w-0 items-center gap-2 rounded-[12px] text-left transition-colors hover:bg-surface-muted data-[state=open]:bg-surface-muted',
          compact ? 'h-9 px-2' : 'h-12 w-full border border-border bg-surface px-3 shadow-xs',
          pending && 'opacity-60',
        )}
        aria-label={`Espaço financeiro: ${current.name}. Trocar espaço`}
      >
        {compact ? null : (
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon className="size-3.5" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          {compact ? null : <span className="block text-[0.6875rem] leading-tight text-fg-muted">Espaço</span>}
          <span className="block truncate text-sm font-medium leading-tight">{current.name}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-fg-subtle" aria-hidden />
      </MenuTrigger>
      <MenuContent align="start" className="w-[240px]">
        <MenuLabel>Seus espaços</MenuLabel>
        {spaces.map((space) => (
          <MenuItem
            key={space.id}
            onSelect={() => {
              if (space.id !== current.id) start(() => switchSpaceAction(space.id))
            }}
          >
            {space.type === 'shared' ? <Users /> : <User />}
            <span className="flex-1 truncate">{space.name}</span>
            {space.id === current.id ? <Check className="!text-accent" /> : null}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/espaco">
            <Plus /> Gerenciar espaço
          </Link>
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
