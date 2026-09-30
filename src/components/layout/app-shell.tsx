'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { Ellipsis, Plus } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Dialog, DialogBody, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { TransactionDialog } from '@/components/transactions/transaction-dialog'
import type { TransactionReference } from '@/features/transactions/reference'
import { cn } from '@/lib/utils/cn'
import { PRIMARY_NAV, isActive, secondaryNav } from './nav-items'
import { SpaceSwitcher, type SpaceOption } from './space-switcher'
import { UserMenu } from './user-menu'

interface AppShellProps {
  children: ReactNode
  user: { name: string; email: string | null }
  space: { id: string; name: string; type: 'personal' | 'shared' }
  spaces: SpaceOption[]
  devTools: boolean
  demo: boolean
  /** Data for the global "Nova movimentação" dialog. */
  reference: TransactionReference
}

export function AppShell({ children, user, space, spaces, devTools, demo, reference }: AppShellProps) {
  const pathname = usePathname()
  const secondary = secondaryNav(space.type, devTools)
  const [moreOpen, setMoreOpen] = useState(false)
  const quickAdd = (trigger: ReactNode) => <TransactionDialog reference={reference} trigger={trigger} />

  return (
    <div className="lg:grid lg:min-h-[calc(100dvh-var(--banner-h,0px))] lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-bg px-4 py-5 lg:flex">
        <Link href="/visao-geral" className="mb-7 flex items-center rounded-md px-2" aria-label="PRUMO — visão geral">
          <Logo />
        </Link>
        <SpaceSwitcher current={space} spaces={spaces} />
        <nav aria-label="Principal" className="mt-6 flex flex-col gap-0.5">
          {PRIMARY_NAV.map((item) => (
            <SidebarLink key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        <div className="mt-6 border-t border-divider pt-4">
          <nav aria-label="Espaço e integrações" className="flex flex-col gap-0.5">
            {secondary.map((item) => (
              <SidebarLink key={item.href} {...item} active={isActive(pathname, item.href)} />
            ))}
          </nav>
        </div>
        <div className="mt-auto">
          <UserMenu name={user.name} email={user.email} demo={demo} variant="sidebar" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Top bar: mobile brand + actions / desktop actions */}
        <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-md supports-[backdrop-filter]:bg-bg/75 lg:border-none lg:bg-transparent lg:backdrop-blur-none">
          <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-6 lg:h-16 lg:px-10">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <Link href="/visao-geral" aria-label="PRUMO — visão geral">
                <Logo compact />
              </Link>
              <SpaceSwitcher current={space} spaces={spaces} compact />
            </div>
            <div className="hidden lg:block" />
            <div className="flex items-center gap-2">
              <div className="hidden lg:block">
                {quickAdd(
                  <button className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-fg shadow-xs transition-colors hover:bg-primary-hover">
                    <Plus className="size-4" aria-hidden /> Nova movimentação
                  </button>,
                )}
              </div>
              <div className="lg:hidden">
                <UserMenu name={user.name} email={user.email} demo={demo} variant="compact" />
              </div>
            </div>
          </div>
        </header>

        <main id="conteudo" className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-4 pb-28 sm:px-6 lg:px-10 lg:pt-2 lg:pb-16">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          <BottomLink {...PRIMARY_NAV[0]!} label="Início" active={isActive(pathname, PRIMARY_NAV[0]!.href)} />
          <BottomLink {...PRIMARY_NAV[1]!} label="Extrato" active={isActive(pathname, PRIMARY_NAV[1]!.href)} />
          <div className="flex justify-center">
            {quickAdd(
              <button
                aria-label="Nova movimentação"
                className="-mt-6 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-md transition-transform active:scale-95"
              >
                <Plus className="size-6" aria-hidden />
              </button>,
            )}
          </div>
          <BottomLink {...PRIMARY_NAV[2]!} label="Plano" active={isActive(pathname, PRIMARY_NAV[2]!.href)} />
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex h-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-fg-muted',
              [...PRIMARY_NAV.slice(3), ...secondary].some((i) => isActive(pathname, i.href)) && 'text-fg',
            )}
          >
            <Ellipsis className="size-5" aria-hidden />
            Mais
          </button>
        </div>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent size="sm">
          <DialogHeader title="Mais" />
          <DialogBody className="pt-2">
            <nav aria-label="Mais opções" className="flex flex-col gap-0.5">
              {[...PRIMARY_NAV.slice(3), ...secondary].map((item) => (
                <SidebarLink key={item.href} {...item} active={isActive(pathname, item.href)} onNavigate={() => setMoreOpen(false)} />
              ))}
            </nav>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SidebarLink({ href, label, icon: Icon, active, onNavigate }: { href: string; label: string; icon: typeof Plus; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg',
        active && 'bg-surface text-fg shadow-xs ring-1 ring-border dark:bg-surface-muted',
      )}
    >
      <Icon className={cn('size-[18px] shrink-0', active ? 'text-accent' : 'text-fg-subtle')} strokeWidth={1.8} aria-hidden />
      {label}
    </Link>
  )
}

function BottomLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Plus; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn('flex h-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-fg-muted', active && 'text-fg')}
    >
      <Icon className={cn('size-5', active && 'text-accent')} strokeWidth={1.8} aria-hidden />
      {label}
    </Link>
  )
}
