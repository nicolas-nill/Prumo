import {
  Baby,
  BriefcaseBusiness,
  Car,
  CircleDashed,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  PawPrint,
  PiggyBank,
  Plane,
  Plug,
  CirclePlus,
  Repeat,
  RotateCcw,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Tag,
  Ticket,
  TrendingUp,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { Tone } from '@/domain/types'
import { cn } from '@/lib/utils/cn'
import { toneSoft } from './tone'

/** Curated icon set — only these are bundled; categories store the key. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  home: House,
  'shopping-cart': ShoppingCart,
  plug: Plug,
  car: Car,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  baby: Baby,
  'paw-print': PawPrint,
  utensils: UtensilsCrossed,
  ticket: Ticket,
  'shopping-bag': ShoppingBag,
  repeat: Repeat,
  sparkles: Sparkles,
  plane: Plane,
  gift: Gift,
  'trending-up': TrendingUp,
  shield: Shield,
  'circle-dashed': CircleDashed,
  briefcase: BriefcaseBusiness,
  'hand-coins': HandCoins,
  'piggy-bank': PiggyBank,
  'rotate-ccw': RotateCcw,
  'plus-circle': CirclePlus,
  tag: Tag,
}

export const ICON_KEYS = Object.keys(CATEGORY_ICONS)

export function CategoryIcon({ icon, tone = 'slate', size = 'md', className }: { icon: string | null; tone?: Tone; size?: 'sm' | 'md'; className?: string }) {
  const Icon = (icon && CATEGORY_ICONS[icon]) || Tag
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        toneSoft(tone),
        size === 'sm' ? 'size-7 [&_svg]:size-3.5' : 'size-9 [&_svg]:size-4',
        className,
      )}
    >
      <Icon strokeWidth={1.8} />
    </span>
  )
}
