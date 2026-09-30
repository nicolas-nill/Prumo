'use client'

import Link from 'next/link'
import { useTheme } from 'next-themes'
import { LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react'
import { Avatar } from '@/components/ui/misc'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { signOutAction } from '@/features/auth/actions'
import { cn } from '@/lib/utils/cn'

export function UserMenu({ name, email, demo, variant }: { name: string; email: string | null; demo: boolean; variant: 'sidebar' | 'compact' }) {
  const { theme, setTheme } = useTheme()
  return (
    <Menu>
      <MenuTrigger
        className={cn(
          'flex items-center gap-3 rounded-[12px] text-left transition-colors hover:bg-surface-muted data-[state=open]:bg-surface-muted',
          variant === 'sidebar' ? 'w-full px-2 py-2' : 'p-1',
        )}
        aria-label="Conta e preferências"
      >
        <Avatar name={name} />
        {variant === 'sidebar' ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-caption">{demo ? 'Modo demonstração' : email}</span>
          </span>
        ) : null}
      </MenuTrigger>
      <MenuContent align={variant === 'sidebar' ? 'start' : 'end'} side={variant === 'sidebar' ? 'top' : 'bottom'} className="w-[248px]">
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-medium">{name}</p>
          {email ? <p className="truncate text-caption">{email}</p> : null}
        </div>
        <MenuSeparator />
        <MenuLabel>Aparência</MenuLabel>
        <MenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
          <MenuRadioItem value="light">
            <Sun /> Claro
          </MenuRadioItem>
          <MenuRadioItem value="dark">
            <Moon /> Escuro
          </MenuRadioItem>
          <MenuRadioItem value="system">
            <Monitor /> Igual ao sistema
          </MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/configuracoes">
            <Settings /> Configurações
          </Link>
        </MenuItem>
        <MenuItem onSelect={() => void signOutAction()}>
          <LogOut /> Sair
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
