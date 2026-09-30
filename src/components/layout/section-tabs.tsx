'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

/** In-page navigation between sibling routes (e.g. Lançamentos | Recorrentes). */
export function SectionTabs({ tabs, label }: { tabs: { href: string; label: string }[]; label: string }) {
  const pathname = usePathname()
  return (
    <nav aria-label={label} className="flex gap-6 border-b border-border">
      {tabs.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 border-transparent pb-3 text-sm font-medium text-fg-muted transition-colors hover:text-fg',
              active && 'border-primary text-fg dark:border-primary',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
