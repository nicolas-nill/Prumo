import {
  ArrowLeftRight,
  Bot,
  LayoutDashboard,
  MessageCircle,
  Settings,
  SlidersHorizontal,
  Target,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export const PRIMARY_NAV: NavItem[] = [
  { href: '/visao-geral', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/movimentacoes', label: 'Movimentações', icon: ArrowLeftRight },
  { href: '/planejamento', label: 'Planejamento', icon: SlidersHorizontal },
  { href: '/metas', label: 'Metas', icon: Target },
  { href: '/contas', label: 'Contas e cartões', icon: WalletCards },
]

export function secondaryNav(spaceType: 'personal' | 'shared', devTools: boolean): NavItem[] {
  return [
    { href: '/espaco', label: spaceType === 'shared' ? 'Espaço compartilhado' : 'Espaço', icon: Users },
    { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
    { href: '/configuracoes', label: 'Configurações', icon: Settings },
    ...(devTools ? [{ href: '/dev/whatsapp', label: 'Simulador', icon: Bot }] : []),
  ]
}

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}
